import { getAcquirerProvider } from '@/lib/acquirer'
import { sanitizeHostedCheckoutUrl } from '@/lib/acquirer/hosted-checkout'
import { mapProviderErrorToUserMessage, ProviderError } from '@/lib/acquirer/provider-error'
import { insertAuditLog } from '@/lib/audit-log'
import { getFinancialEnvironment, getFinancialProvider, getProviderCapabilities, isProviderConfigured, isSupabaseServiceConfigured } from '@/lib/env'
import { calculateSplitForProvider, mapSplitConfigErrorToUserMessage } from '@/lib/split-service'
import { checkPublicRateLimit } from '@/lib/public-rate-limit'
import { getOrgFromApiKey } from '@/lib/public-api-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

function randomSlug() {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let out = ''
  for (let i = 0; i < 14; i += 1) out += alphabet[Math.floor(Math.random() * alphabet.length)]
  return out
}

function buildPaymentLinkProviderSyncState() {
  const providerId = getFinancialProvider()
  if (providerId === 'pagarme') {
    return {
      providerId,
      enabled: false,
      message: 'Novos links Pagar.me permanecem no checkout white-label da Connekt Pay. O checkout hospedado do provedor foi descontinuado para o fluxo novo.',
    }
  }
  const capabilities = getProviderCapabilities(providerId)
  if (!capabilities.credentialsConfigured || !isProviderConfigured(providerId)) return null
  if (!capabilities.paymentLinks) {
    return {
      providerId,
      enabled: false,
      message: 'Sincronização externa de Payment Links está desabilitada (MYGATEWAY_PAYMENT_LINKS_ENABLED=false).',
    }
  }
  return { providerId, enabled: true as const }
}

function withRuntimePaymentLinkMetadata(metadata: unknown) {
  const record = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? { ...(metadata as Record<string, unknown>) } : {}
  const runtime = getFinancialEnvironment()
  if (typeof record.provider_id !== 'string' || !record.provider_id.trim()) {
    record.provider_id = runtime.providerId
  }
  if (typeof record.provider_environment !== 'string' || !record.provider_environment.trim()) {
    record.provider_environment = runtime.environment
  }
  if (typeof record.checkout_mode !== 'string' || !record.checkout_mode.trim()) {
    record.checkout_mode = 'internal'
  }
  return record
}

export async function GET(request: Request) {
  if (!isSupabaseServiceConfigured()) return json({ error: 'Funcionalidade indisponÃ­vel no momento.' }, { status: 503 })

  const ctx = await getOrgFromApiKey(request)
  if (!ctx?.apiKeyHash) return json({ error: 'Unauthorized' }, { status: 401 })
  const allowed = await checkPublicRateLimit({ organizationId: ctx.organizationId, apiKeyHash: ctx.apiKeyHash, limit: 120, windowSeconds: 60 })
  if (!allowed) return json({ error: 'Rate limit exceeded' }, { status: 429 })

  const url = new URL(request.url)
  const slug = url.searchParams.get('slug')
  const supabase = getSupabaseAdminClient()

  if (slug) {
    const { data, error } = await supabase
      .from('payment_links')
      .select('id, name, description, amount, currency, type, methods, max_installments, status, slug, created_at, metadata, provider_url, provider_status')
      .eq('organization_id', ctx.organizationId)
      .eq('slug', slug)
      .maybeSingle()
    if (error) return json({ error: 'NÃ£o foi possÃ­vel carregar o link agora.' }, { status: 500 })
    if (!data) return json({ error: 'Link nÃ£o encontrado.' }, { status: 404 })
    const metadata = withRuntimePaymentLinkMetadata(data?.metadata)
    const providerId = typeof metadata.provider_id === 'string' ? metadata.provider_id : null
    return json({
      paymentLink: {
        ...data,
        metadata,
        provider_url: sanitizeHostedCheckoutUrl({
          providerId,
          url: data?.provider_url,
        }),
      },
    })
  }

  const { data, error } = await supabase
    .from('payment_links')
    .select('id, name, description, amount, currency, type, methods, max_installments, status, slug, created_at, metadata, provider_url, provider_status')
    .eq('organization_id', ctx.organizationId)
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) return json({ error: 'NÃ£o foi possÃ­vel listar os links agora.' }, { status: 500 })
  return json({
    paymentLinks: (data ?? []).map((item: any) => ({
      ...item,
      metadata: withRuntimePaymentLinkMetadata(item?.metadata),
      provider_url: sanitizeHostedCheckoutUrl({
        providerId: typeof withRuntimePaymentLinkMetadata(item?.metadata).provider_id === 'string'
          ? String(withRuntimePaymentLinkMetadata(item?.metadata).provider_id)
          : null,
        url: item?.provider_url,
      }),
    })),
  })
}

export async function POST(request: Request) {
  if (!isSupabaseServiceConfigured()) return json({ error: 'Funcionalidade indisponÃ­vel no momento.' }, { status: 503 })

  const ctx = await getOrgFromApiKey(request)
  if (!ctx?.apiKeyHash) return json({ error: 'Unauthorized' }, { status: 401 })
  const allowed = await checkPublicRateLimit({ organizationId: ctx.organizationId, apiKeyHash: ctx.apiKeyHash, limit: 60, windowSeconds: 60 })
  if (!allowed) return json({ error: 'Rate limit exceeded' }, { status: 429 })

  const body = (await request.json().catch(() => null)) as
    | null
    | {
        name?: string
        description?: string
        amount?: number
        type?: 'one_time' | 'recurring'
        interval?: 'weekly' | 'monthly' | 'yearly'
        methods?: { pix?: boolean; card?: boolean }
        maxInstallments?: number | null
        status?: 'active' | 'inactive'
        slug?: string
        metadata?: Record<string, unknown>
      }

  if (!body?.name) return json({ error: 'Missing name' }, { status: 400 })
  const amount = typeof body.amount === 'number' ? Math.round(body.amount) : null
  if (!amount || amount <= 0) return json({ error: 'Invalid amount' }, { status: 400 })

  const supabase = getSupabaseAdminClient()
  let slug = typeof body.slug === 'string' && body.slug.trim() ? body.slug.trim() : randomSlug()
  for (let i = 0; i < 4; i += 1) {
    const { data: exists } = await supabase
      .from('payment_links')
      .select('id')
      .eq('organization_id', ctx.organizationId)
      .eq('slug', slug)
      .maybeSingle()
    if (!exists) break
    slug = randomSlug()
  }

  const type = body.type === 'recurring' ? 'recurring' : 'one_time'
  const methods =
    type === 'recurring'
      ? {
          pix: false,
          card: true,
        }
      : {
          pix: body.methods?.pix !== false,
          card: body.methods?.card !== false,
        }

  const { data, error } = await supabase
    .from('payment_links')
    .insert({
      organization_id: ctx.organizationId,
      name: body.name,
      description: body.description ?? null,
      amount,
      currency: 'BRL',
      type,
      methods,
      max_installments: type === 'recurring' ? 1 : typeof body.maxInstallments === 'number' ? body.maxInstallments : null,
      status: body.status === 'inactive' ? 'inactive' : 'active',
      slug,
      metadata: {
        provider_id: getFinancialProvider(),
        checkout_mode: 'internal',
        ...(type === 'recurring' ? { interval: body.interval ?? 'monthly', trial_days: 0 } : null),
        ...(body.metadata ?? {}),
      },
    })
    .select('id, slug')
    .single()

  if (error) return json({ error: 'NÃ£o foi possÃ­vel criar o link agora.' }, { status: 500 })

  await insertAuditLog({
    organizationId: ctx.organizationId,
    actorProfileId: ctx.actorProfileId,
    actorUserId: null,
    authType: 'api_key',
    origin: 'public_api',
    action: 'CREATE',
    entity: 'payment_link',
    entityId: data.id as string,
    before: null,
    after: data,
  })

  let providerSync: { ok: true } | { ok: false; message: string } | null =
    type === 'recurring'
      ? {
          ok: false,
          message: 'Link recorrente criado com checkout interno. A sincronizaÃ§Ã£o externa serÃ¡ habilitada junto da homologaÃ§Ã£o real de assinaturas no provedor.',
        }
      : null
  const providerState = buildPaymentLinkProviderSyncState()
  if (type !== 'recurring' && providerState && !providerState.enabled) {
    providerSync = { ok: false, message: providerState.message }
  }
  if (type !== 'recurring' && providerState?.enabled) {
    try {
      const { split, providerSplit } = await calculateSplitForProvider(supabase, {
        organizationId: ctx.organizationId,
        paymentLinkId: data.id as string,
        grossAmount: amount,
      })

      await supabase
        .from('payment_links')
        .update({
          metadata: {
            provider_id: providerState.providerId,
            ...(body.metadata ?? {}),
            split_preview: {
              gross_amount: Number(split.grossAmount),
              connekt_fee_amount: Number(split.connektFeeAmount),
              receiver_total_amount: Number(split.receiverTotalAmount),
              receivers: split.receivers.map((r) => ({
                receiver_id: r.receiverId,
                amount: Number(r.amount),
                percentage_bps: r.percentageBps,
              })),
            },
          },
        })
        .eq('id', data.id as string)

      const provider = getAcquirerProvider(providerState.providerId)
      const providerLink = await provider.createPaymentLink({
        name: body.name,
        description: body.description ?? null,
        amount: { amount, currency: 'BRL' },
        methods,
        metadata: { payment_link_id: data.id as string, slug: data.slug as string, organization_id: ctx.organizationId },
        split: providerSplit.receivers.map((r) => ({ receiverId: r.receiverId, amount: r.amount })),
        connektFeeAmount: providerSplit.connektFeeAmount,
      })

      const now = new Date().toISOString()
      await supabase
        .from('payment_links')
        .update({
          provider_reference: providerLink.id,
          provider_payload: (providerLink.metadata?.raw ?? providerLink) as any,
          provider_status: providerLink.status,
          provider_url: sanitizeHostedCheckoutUrl({ providerId: providerState.providerId, url: providerLink.url ?? null }),
          provider_synced_at: now,
          provider_last_error: null,
          provider_last_error_at: null,
        })
        .eq('id', data.id as string)

      await insertAuditLog({
        organizationId: ctx.organizationId,
        actorProfileId: ctx.actorProfileId,
        actorUserId: null,
        authType: 'api_key',
        origin: 'public_api',
        action: 'UPDATE',
        entity: 'payment_link',
        entityId: data.id as string,
        before: { provider_reference: null, provider_status: null, provider_url: null },
        after: {
          provider_reference: providerLink.id,
          provider_status: providerLink.status,
          provider_url: sanitizeHostedCheckoutUrl({ providerId: providerState.providerId, url: providerLink.url ?? null }),
          provider_synced_at: now,
        },
      })

      providerSync = { ok: true }
    } catch (e) {
      const now = new Date().toISOString()
      const message =
        e instanceof ProviderError ? mapProviderErrorToUserMessage(e) : mapSplitConfigErrorToUserMessage(e)

      await supabase
        .from('payment_links')
        .update({
          provider_last_error: message,
          provider_last_error_at: now,
        })
        .eq('id', data.id as string)

      await insertAuditLog({
        organizationId: ctx.organizationId,
        actorProfileId: ctx.actorProfileId,
        actorUserId: null,
        authType: 'api_key',
        origin: 'public_api',
        action: 'SYNC_FAILED',
        entity: 'payment_link',
        entityId: data.id as string,
        before: null,
        after: { provider_last_error: message, provider_last_error_at: now },
      })

      providerSync = { ok: false, message }
    }
  }

  return json({ paymentLink: data, ...(providerSync ? { providerSync } : null) }, { status: 201 })
}

import {
  getFinancialProvider,
  getProviderCapabilities,
  isProviderConfigured,
  isSupabaseConfigured,
  isSupabaseServiceConfigured,
} from '@/lib/env'
import { insertAuditLog } from '@/lib/audit-log'
import { assertRole, requireSessionOrgContext } from '@/lib/session-org-context'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import { classifyInternalApiError } from '@/lib/api-error'
import { getAcquirerProvider } from '@/lib/acquirer'
import { mapProviderErrorToUserMessage, ProviderError } from '@/lib/acquirer/provider-error'
import { sanitizeHostedCheckoutUrl } from '@/lib/acquirer/hosted-checkout'
import { checkRuntimeRateLimit, getRequestClientIp } from '@/lib/runtime-guards'
import { calculateSplitForProvider, mapSplitConfigErrorToUserMessage } from '@/lib/split-service'
import { sendTransactionalEmail } from '@/lib/email-service'
import { NextResponse } from 'next/server'

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

function parseAmountBRL(input: string) {
  const normalized = input.replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, '')
  const value = Number(normalized)
  if (!Number.isFinite(value) || value <= 0) return null
  return Math.round(value * 100)
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

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) return json({ paymentLinks: [] })
  const url = new URL(request.url)
  const slug = url.searchParams.get('slug')

  if (slug) {
    if (!isSupabaseServiceConfigured()) return json({ error: 'Funcionalidade indisponível no momento.' }, { status: 503 })
    const readRate = checkRuntimeRateLimit({
      key: `payment-link-slug:${getRequestClientIp(request)}:${slug}`,
      limit: 60,
      windowMs: 60_000,
    })
    if (!readRate.allowed) return json({ error: 'Rate limit exceeded' }, { status: 429 })
    const supabase = getSupabaseAdminClient()
    const { data, error } = await supabase
      .from('payment_links')
      .select('id, name, description, amount, currency, type, methods, max_installments, status, slug, created_at, provider_url, provider_status, metadata')
      .eq('slug', slug)
      .eq('status', 'active')
      .maybeSingle()

    if (error) return json({ error: 'Não foi possível carregar o link agora.' }, { status: 500 })
    if (!data) return json({ error: 'Link não encontrado.' }, { status: 404 })
    const providerId = typeof (data.metadata as Record<string, unknown> | null)?.provider_id === 'string'
      ? String((data.metadata as Record<string, unknown>).provider_id)
      : null
    return json({
      paymentLink: {
        ...data,
        provider_url: sanitizeHostedCheckoutUrl({ providerId, url: data.provider_url }),
      },
    })
  }

  try {
    const ctx = await requireSessionOrgContext()
    assertRole(ctx.role, ['owner', 'admin', 'super_admin'])
    const supabase = isSupabaseServiceConfigured() ? getSupabaseAdminClient() : await getSupabaseServerClient()
    const { data, error } = await supabase
      .from('payment_links')
      .select('id, name, description, amount, currency, type, methods, max_installments, status, slug, created_at, metadata, provider_url, provider_status')
      .eq('organization_id', ctx.organizationId)
      .order('created_at', { ascending: false })

    if (error) return json({ paymentLinks: [] })
    return json({
      paymentLinks: (data ?? []).map((item: any) => ({
        ...item,
        provider_url: sanitizeHostedCheckoutUrl({
          providerId: typeof item?.metadata?.provider_id === 'string' ? item.metadata.provider_id : null,
          url: item?.provider_url,
        }),
      })),
    })
  } catch (e) {
    const err = classifyInternalApiError(e)
    return json({ error: err.message }, { status: err.status })
  }
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return json({ error: 'Funcionalidade indisponível no momento.' }, { status: 503 })

  try {
    const ctx = await requireSessionOrgContext()
    assertRole(ctx.role, ['owner', 'admin', 'super_admin'])
    const orgId = ctx.organizationId

    const body = (await request.json().catch(() => null)) as
      | null
      | {
          name?: string
          description?: string
          amountBRL?: string
          type?: 'one_time' | 'recurring'
          interval?: 'weekly' | 'monthly' | 'yearly'
          pix?: boolean
          card?: boolean
          maxInstallments?: number
          imageUrl?: string
        }

    if (!body?.name) return json({ error: 'Missing name' }, { status: 400 })

    const amount = body.amountBRL ? parseAmountBRL(body.amountBRL) : null
    if (!amount) return json({ error: 'Invalid amount' }, { status: 400 })

    const type = body.type === 'recurring' ? 'recurring' : 'one_time'
    const methods =
      type === 'recurring'
        ? {
            pix: false,
            card: true,
          }
        : {
            pix: body.pix !== false,
            card: body.card !== false,
          }

    const maxInstallments = type === 'recurring' ? 1 : typeof body.maxInstallments === 'number' ? body.maxInstallments : null

    const supabase = isSupabaseServiceConfigured() ? getSupabaseAdminClient() : await getSupabaseServerClient()

    let slug = randomSlug()
    for (let i = 0; i < 4; i += 1) {
      const { data: exists } = await supabase
        .from('payment_links')
        .select('id')
        .eq('organization_id', orgId)
        .eq('slug', slug)
        .maybeSingle()
      if (!exists) break
      slug = randomSlug()
    }

    const { data, error } = await supabase
      .from('payment_links')
      .insert({
        organization_id: orgId,
        name: body.name,
        description: body.description ?? null,
        amount,
        currency: 'BRL',
        type,
        methods,
        max_installments: maxInstallments,
        status: 'active',
        slug,
        metadata: {
          provider_id: getFinancialProvider(),
          checkout_mode: 'internal',
          ...(type === 'recurring' ? { interval: body.interval ?? 'monthly', trial_days: 0 } : null),
          ...(body.imageUrl ? { image_url: body.imageUrl } : null),
        },
      })
      .select('id, slug')
      .single()

    if (error) return json({ error: 'Não foi possível criar o link agora.' }, { status: 500 })

    await insertAuditLog({
      organizationId: orgId,
      actorProfileId: ctx.actorProfileId,
      actorUserId: ctx.actorProfileId,
      authType: 'session',
      origin: 'internal_api',
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
            message: 'Link recorrente criado com checkout interno. A sincronização externa será habilitada junto da homologação real de assinaturas no provedor.',
          }
        : null
    const providerState = buildPaymentLinkProviderSyncState()
    if (type !== 'recurring' && providerState && !providerState.enabled) {
      providerSync = { ok: false, message: providerState.message }
    }
    if (type !== 'recurring' && providerState?.enabled) {
      try {
        try {
          const { split } = await calculateSplitForProvider(supabase, {
            organizationId: orgId,
            paymentLinkId: data.id as string,
            grossAmount: amount,
          })

          await supabase
            .from('payment_links')
            .update({
              metadata: {
                provider_id: providerState.providerId,
                ...(body.imageUrl ? { image_url: body.imageUrl } : null),
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
        } catch {
        }

        const provider = getAcquirerProvider(providerState.providerId)
        const providerLink = await provider.createPaymentLink({
          name: body.name,
          description: body.description ?? null,
          amount: { amount, currency: 'BRL' },
          methods,
          metadata: { payment_link_id: data.id as string, slug: data.slug as string, organization_id: orgId },
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
          organizationId: orgId,
          actorProfileId: ctx.actorProfileId,
          actorUserId: ctx.actorProfileId,
          authType: 'session',
          origin: 'internal_api',
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
          organizationId: orgId,
          actorProfileId: ctx.actorProfileId,
          actorUserId: ctx.actorProfileId,
          authType: 'session',
          origin: 'internal_api',
          action: 'SYNC_FAILED',
          entity: 'payment_link',
          entityId: data.id as string,
          before: null,
          after: { provider_last_error: message, provider_last_error_at: now },
        })
        providerSync = { ok: false, message }
      }
    }

    try {
      const { data: userData } = await supabase.auth.getUser()
      const email = userData.user?.email ?? null
      if (email) {
        await sendTransactionalEmail({
          organizationId: orgId,
          to: email,
          template: 'payment_link.created',
          data: { payment_link_id: data.id, slug: data.slug, name: body.name, amount_centavos: amount },
        })
      }
    } catch {
    }

    return json({ paymentLink: data, ...(providerSync ? { providerSync } : null) }, { status: 201 })
  } catch (e) {
    const err = classifyInternalApiError(e)
    return json({ error: err.message }, { status: err.status })
  }
}

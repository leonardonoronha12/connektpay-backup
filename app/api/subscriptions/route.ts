﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿import { getOrganizationOwnerProfileId } from '@/lib/audit-actor'
import { classifyInternalApiError, logApiError } from '@/lib/api-error'
import { ProviderError, mapProviderErrorToUserMessage } from '@/lib/acquirer/provider-error'
import { getFinancialProvider, getProviderCapabilities, isProviderConfigured, isSupabaseConfigured, isSupabaseServiceConfigured } from '@/lib/env'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import { getOrgFromApiKey } from '@/lib/public-api-auth'
import { checkPublicRateLimit } from '@/lib/public-rate-limit'
import { buildStableRequestKey, checkRuntimeRateLimit, claimRuntimeReplayWindow, getRequestClientIp } from '@/lib/runtime-guards'
import { assertRole, requireSessionOrgContext } from '@/lib/session-org-context'
import { buildCsvFilename, buildCsvString } from '@/lib/csv'
import { NextResponse } from 'next/server'
import { calculateChurn, calculateMRR, createSubscription, listSubscriptions } from '@/lib/subscription-service'

const SUBSCRIPTIONS_RUNTIME_BUILD_MARKER = 'subscriptions-runtime-d5acedd-v2'

export const dynamic = 'force-dynamic'

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

function buildSubscriptionsProviderState() {
  const providerId = getFinancialProvider()
  const capabilities = getProviderCapabilities(providerId)
  if (!capabilities.credentialsConfigured || !isProviderConfigured(providerId)) return null
  if (!capabilities.subscriptions) {
    return {
      providerId,
      enabled: false,
      message: 'Assinaturas ainda nÃ£o estÃ£o disponÃ­veis para o provedor financeiro ativo.',
    }
  }
  return { providerId, enabled: true as const }
}

function normalizeSubscriptionCardInput(
  providerId: string,
  card:
    | {
        holderName?: string
        number?: string
        expMonth?: string
        expYear?: string
        cvv?: string
        token?: string
        brand?: string
        last4?: string
      }
    | null
    | undefined,
) {
  const holderName = typeof card?.holderName === 'string' ? card.holderName.trim() : ''
  const expMonth = typeof card?.expMonth === 'string' ? card.expMonth.trim() : ''
  const expYear = typeof card?.expYear === 'string' ? card.expYear.trim() : ''
  if (!holderName || !expMonth || !expYear) {
    return { ok: false as const, message: 'Missing card' }
  }

  if (providerId === 'pagarme') {
    const token = typeof card?.token === 'string' ? card.token.trim() : ''
    const hasRawPan = typeof card?.number === 'string' && card.number.trim().length > 0
    const hasRawCvv = typeof card?.cvv === 'string' && card.cvv.trim().length > 0
    if (!token || hasRawPan || hasRawCvv) {
      return {
        ok: false as const,
        message: 'Envie apenas card.token para assinaturas em cartão da Pagar.me.',
      }
    }

    return {
      ok: true as const,
      card: {
        holderName,
        token,
        expMonth,
        expYear,
        brand: typeof card?.brand === 'string' ? card.brand.trim() || undefined : undefined,
        last4: typeof card?.last4 === 'string' ? card.last4.trim() || undefined : undefined,
      },
    }
  }

  const number = typeof card?.number === 'string' ? card.number.trim() : ''
  const cvv = typeof card?.cvv === 'string' ? card.cvv.trim() : ''
  if (!number || !cvv) {
    return { ok: false as const, message: 'Missing card' }
  }

  return {
    ok: true as const,
    card: {
      holderName,
      number,
      expMonth,
      expYear,
      cvv,
      brand: typeof card?.brand === 'string' ? card.brand.trim() || undefined : undefined,
      last4: typeof card?.last4 === 'string' ? card.last4.trim() || undefined : undefined,
    },
  }
}

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) return json({ subscriptions: [] })

  try {
    const ctx = await requireSessionOrgContext()
    assertRole(ctx.role, ['owner', 'admin', 'financeiro', 'super_admin'])
    const format = new URL(request.url).searchParams.get('format')
    const supabase = isSupabaseServiceConfigured() ? getSupabaseAdminClient() : await getSupabaseServerClient()

    const subscriptions = await (async () => {
      try {
        const out = await listSubscriptions({ supabase, organizationId: ctx.organizationId })
        return out.subscriptions ?? []
      } catch {
        return []
      }
    })()

    const mrrCents = await (async () => {
      try {
        const mrr = await calculateMRR({ supabase, organizationId: ctx.organizationId })
        return mrr.mrrCents
      } catch {
        return 0
      }
    })()

    const churnRate = await (async () => {
      try {
        const churn = await calculateChurn({ supabase, organizationId: ctx.organizationId })
        return churn.churnRate
      } catch {
        return 0
      }
    })()

    const nextChargeAt = subscriptions
      .map((s: any) => (s.next_charge_at ? new Date(s.next_charge_at as string).getTime() : null))
      .filter((t: any) => typeof t === 'number' && Number.isFinite(t))
      .sort((a: number, b: number) => a - b)[0]
    if (format === 'csv') {
      const rows = subscriptions.map((subscription: any) => ({
        id: subscription.id,
        plan_id: subscription.plano_id ?? subscription.plano?.id ?? '',
        plan_name: subscription.plano?.name ?? '',
        payer_id: subscription.pagador_id ?? subscription.pagador?.id ?? '',
        payer_name: subscription.pagador?.name ?? '',
        payer_email: subscription.pagador?.email ?? '',
        receiver_id: subscription.recebedor_id ?? '',
        status: subscription.status ?? '',
        next_charge_at: subscription.next_charge_at ?? '',
        attempts_failed: Number(subscription.attempts_failed ?? 0),
        created_at: subscription.created_at ?? '',
      }))
      const csv = buildCsvString(
        [
          { key: 'id', header: 'id' },
          { key: 'plan_id', header: 'plan_id' },
          { key: 'plan_name', header: 'plan_name' },
          { key: 'payer_id', header: 'payer_id' },
          { key: 'payer_name', header: 'payer_name' },
          { key: 'payer_email', header: 'payer_email' },
          { key: 'receiver_id', header: 'receiver_id' },
          { key: 'status', header: 'status' },
          { key: 'next_charge_at', header: 'next_charge_at' },
          { key: 'attempts_failed', header: 'attempts_failed' },
          { key: 'created_at', header: 'created_at' },
        ],
        rows
      )
      return new NextResponse(csv, {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="${buildCsvFilename('subscriptions')}"`,
          'X-Connekt-Build-Marker': SUBSCRIPTIONS_RUNTIME_BUILD_MARKER,
        },
      })
    }
    return json({
      subscriptions,
      mrrCents,
      churnRate,
      nextChargeAt: nextChargeAt ? new Date(nextChargeAt).toISOString() : null,
      runtimeBuildMarker: SUBSCRIPTIONS_RUNTIME_BUILD_MARKER,
      providerId: getFinancialProvider(),
      requiresClientCardTokenization: getFinancialProvider() === 'pagarme',
    }, { headers: { 'X-Connekt-Build-Marker': SUBSCRIPTIONS_RUNTIME_BUILD_MARKER } })
  } catch (e) {
    const err = classifyInternalApiError(e)
    return json(
      { error: err.message, runtimeBuildMarker: SUBSCRIPTIONS_RUNTIME_BUILD_MARKER },
      { status: err.status, headers: { 'X-Connekt-Build-Marker': SUBSCRIPTIONS_RUNTIME_BUILD_MARKER } },
    )
  }
}

export async function POST(request: Request) {
  if (!isSupabaseServiceConfigured()) return json({ error: 'Funcionalidade indisponÃ­vel no momento.' }, { status: 503 })
  const providerState = buildSubscriptionsProviderState()
  if (!providerState) return json({ error: 'O provedor financeiro ainda nÃ£o estÃ¡ configurado.' }, { status: 503 })
  if (!providerState.enabled) return json({ error: providerState.message }, { status: 503 })

  try {
    const body = (await request.json().catch(() => null)) as
      | null
      | {
          planId?: string
          planSlug?: string
          customer?: { name?: string; email?: string; document?: string; phone?: string }
          card?: {
            holderName?: string
            number?: string
            expMonth?: string
            expYear?: string
            cvv?: string
            token?: string
            brand?: string
            last4?: string
          }
        }

    if (!body) return json({ error: 'Invalid body' }, { status: 400 })
    const normalizedCard = normalizeSubscriptionCardInput(providerState.providerId, body.card)
    if (!normalizedCard.ok) return json({ error: normalizedCard.message }, { status: 400 })

    const supabase = getSupabaseAdminClient()
    const apiKeyCtx = await getOrgFromApiKey(request)
    if (apiKeyCtx?.apiKeyHash) {
      const allowed = await checkPublicRateLimit({ organizationId: apiKeyCtx.organizationId, apiKeyHash: apiKeyCtx.apiKeyHash, limit: 60, windowSeconds: 60 })
      if (!allowed) return json({ error: 'Rate limit exceeded' }, { status: 429 })
    }

    let organizationId: string | null = apiKeyCtx?.organizationId ?? null
    let actorProfileId: string | null = apiKeyCtx?.actorProfileId ?? null
    let authType: 'api_key' | 'session' = apiKeyCtx ? 'api_key' : 'session'
    let origin: 'public_api' | 'internal_api' = apiKeyCtx ? 'public_api' : 'internal_api'

    let planId = body.planId ?? null
    if (planId && !apiKeyCtx) {
      const sessionCtx = await requireSessionOrgContext()
      assertRole(sessionCtx.role, ['owner', 'admin', 'super_admin'])
      organizationId = sessionCtx.organizationId
      actorProfileId = sessionCtx.actorProfileId
      authType = 'session'
      origin = 'internal_api'
    }
    if (!planId && body.planSlug) {
      const { data: link } = await supabase
        .from('payment_links')
        .select('id, organization_id, amount, currency, type, status, metadata')
        .eq('slug', body.planSlug)
        .eq('type', 'recurring')
        .eq('status', 'active')
        .maybeSingle()
      if (!link) return json({ error: 'Plano nÃ£o encontrado.' }, { status: 404 })
      organizationId = organizationId ?? (link.organization_id as string)
      if (!organizationId) return json({ error: 'Plano nÃ£o encontrado.' }, { status: 404 })
      actorProfileId = actorProfileId ?? (await getOrganizationOwnerProfileId(organizationId))
      authType = 'api_key'
      origin = 'public_api'

      const { data: existingPlan } = await supabase
        .from('pay_plano')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('payment_link_id', link.id as string)
        .maybeSingle()
      if (existingPlan?.id) planId = existingPlan.id as string
      else {
        const { data: receiver } = await supabase
          .from('receivers')
          .select('id, created_at')
          .eq('organization_id', organizationId)
          .eq('status', 'active')
          .eq('kyc_status', 'approved')
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle()
        if (!receiver?.id) return json({ error: 'Split nÃ£o configurado. Cadastre um recebedor aprovado e/ou regras de split.' }, { status: 400 })

        const cycle = String((link as any).metadata?.interval ?? 'monthly')
        const trialDays = Number((link as any).metadata?.trial_days ?? 0)
        const insert = await supabase
          .from('pay_plano')
          .insert({
            organization_id: organizationId,
            recebedor_id: receiver.id,
            payment_link_id: link.id,
            name: 'Plano',
            description: null,
            amount_centavos: Number(link.amount),
            cycle,
            trial_days: Number.isFinite(trialDays) ? Math.max(0, Math.round(trialDays)) : 0,
            status: 'active',
          })
          .select('id')
          .single()
        if (insert.error) {
          logApiError('POST /api/subscriptions: create plan from payment_link failed', insert.error, { organizationId, paymentLinkId: link.id as string })
          return json({ error: 'Ocorreu um erro ao preparar o plano de assinatura. Tente novamente.' }, { status: 500 })
        }
        planId = insert.data.id as string
      }
    }

    if (!organizationId) return json({ error: 'Unauthorized' }, { status: 401 })
    if (!planId) return json({ error: 'Missing planId' }, { status: 400 })
    if (!apiKeyCtx && body.planSlug) {
      const clientIp = getRequestClientIp(request)
      const subscriptionRate = checkRuntimeRateLimit({
        key: `public-subscription:${clientIp}:${String(body.planSlug)}`,
        limit: 10,
        windowMs: 60_000,
      })
      if (!subscriptionRate.allowed) return json({ error: 'Rate limit exceeded' }, { status: 429 })

      const replayKey = buildStableRequestKey([
        'public-subscription',
        organizationId,
        planId,
        body.customer?.email,
        body.customer?.document,
        body.customer?.phone,
        clientIp,
      ])
      const replay = claimRuntimeReplayWindow({ key: replayKey, ttlMs: 60_000 })
      if (!replay.claimed) {
        return json({ error: 'Uma assinatura idÃªntica jÃ¡ estÃ¡ em processamento. Aguarde antes de reenviar.' }, { status: 409 })
      }
    }

    const sub = await createSubscription({
      supabase,
      organizationId,
      actorProfileId,
      origin,
      authType,
      planId,
      payer: { name: body.customer?.name ?? body.customer?.email ?? 'Pagador', email: body.customer?.email ?? null, document: body.customer?.document ?? null, phone: body.customer?.phone ?? null },
      card: normalizedCard.card,
    })

    return json(sub, { status: 201 })
  } catch (e) {
    if (e instanceof ProviderError) return json({ error: mapProviderErrorToUserMessage(e) }, { status: e.status })
    const err = classifyInternalApiError(e)
    return json({ error: err.message }, { status: err.status })
  }
}

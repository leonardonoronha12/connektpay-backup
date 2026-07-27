import { getFinancialEnvironment, getFinancialProvider, isPagarMeWebhookConfigured, isSupabaseServiceConfigured } from '@/lib/env'
import { processWebhookEventById } from '@/lib/webhook-processor'
import {
  getPagarmeWebhookBasicAuthConfig,
  getPagarmeWebhookBasicAuthDiagnostic,
  isPagarmeWebhookBasicAuthConfigured,
  verifyPagarmeWebhookBasicAuth,
} from '@/lib/webhook-basic-auth'
import { type IncomingWebhook, buildWebhookProviderEventId, getWebhookSignatureConfig, getWebhookSignatureHeader, verifyWebhookSignature } from '@/lib/webhook-signature'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { checkRuntimeRateLimit, getRequestClientIp } from '@/lib/runtime-guards'
import { NextResponse } from 'next/server'

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

function jsonUnauthorized(data: unknown) {
  return json(data, {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Pagar.me Webhook"',
    },
  })
}

function extractPaymentLinkCorrelationCode(payload: any) {
  if (typeof payload?.metadata?.payment_link_id === 'string') return payload.metadata.payment_link_id
  if (typeof payload?.code === 'string') return payload.code
  return null
}

function extractProviderMetadata(payload: any) {
  const candidates = [
    payload?.metadata,
    payload?.charges?.[0]?.metadata,
    payload?.last_transaction?.metadata,
    payload?.charges?.[0]?.last_transaction?.metadata,
  ]
  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
      return candidate as Record<string, unknown>
    }
  }
  return {}
}

function extractProviderOrderId(body: IncomingWebhook, payload: any) {
  if (typeof payload?.order_id === 'string') return payload.order_id
  if (typeof payload?.charges?.[0]?.order_id === 'string') return payload.charges[0].order_id
  if (String(body.type).startsWith('order.') && typeof payload?.id === 'string') return payload.id
  return null
}

function extractProviderChargeId(body: IncomingWebhook, payload: any) {
  if (typeof payload?.charge_id === 'string') return payload.charge_id
  if (typeof payload?.charges?.[0]?.id === 'string') return payload.charges[0].id
  if (String(body.type).startsWith('charge.') && typeof payload?.id === 'string') return payload.id
  return null
}

function extractProviderReference(payload: any) {
  return (
    (typeof payload?.charges?.[0]?.last_transaction?.id === 'string' && payload.charges[0].last_transaction.id) ||
    (typeof payload?.last_transaction?.id === 'string' && payload.last_transaction.id) ||
    (typeof payload?.transaction_id === 'string' && payload.transaction_id) ||
    (typeof payload?.id === 'string' && payload.id) ||
    null
  )
}

function normalizeIncomingEnvironment(value: unknown): 'sandbox' | 'production' | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  return normalized === 'sandbox' || normalized === 'production' ? normalized : null
}

async function persistUnresolvedWebhookEvent(input: {
  supabase: any
  provider: string
  providerEnvironment: 'sandbox' | 'production'
  providerEventId: string
  type: string
  attemptedSources: string[]
  payload: unknown
  correlationSnapshot: Record<string, unknown>
}) {
  const existing = await input.supabase
    .from('webhook_events_unresolved')
    .select('id, status')
    .eq('provider', input.provider)
    .eq('provider_environment', input.providerEnvironment)
    .eq('provider_event_id', input.providerEventId)
    .maybeSingle()
  if (existing.error) throw existing.error
  if (existing.data?.id) return String(existing.data.id)

  const inserted = await input.supabase
    .from('webhook_events_unresolved')
    .insert({
      provider: input.provider,
      provider_environment: input.providerEnvironment,
      provider_event_id: input.providerEventId,
      type: input.type,
      status: 'pending',
      attempted_sources: input.attemptedSources,
      payload: input.payload,
      correlation_snapshot: input.correlationSnapshot,
      resolution_error: 'organization_id_unresolved',
    })
    .select('id')
    .single()
  if (inserted.error) throw inserted.error
  return String(inserted.data.id)
}

type CorrelationSourceName =
  | 'metadata.organization_id'
  | 'metadata.internal_transaction_id'
  | 'metadata.internal_payment_link_id'
  | 'provider_order_id->transactions.provider_order_id'
  | 'provider_charge_id->transactions.provider_charge_id'
  | 'provider_reference->transactions.provider_reference'
  | 'metadata.transaction_id'
  | 'payload.id->transactions.provider_reference'
  | 'payment_link_correlation_code->payment_links.id'
  | 'payment_link_correlation_code->payment_links.slug'
  | 'provider_subscription_id->subscriptions.provider_reference'
  | 'metadata.assinatura_id'
  | 'metadata.anticipation_id'
  | 'provider_subscription_id->pay_assinatura.acquirer_subscription_id'
  | 'provider_payout_id->payouts.provider_reference'
  | 'provider_anticipation_id->pay_antecipacao.acquirer_anticipation_id'
  | 'provider_anticipation_id->pay_antecipacao.provider_reference'

export async function POST(request: Request) {
  if (!isSupabaseServiceConfigured()) {
    if (process.env.NODE_ENV === 'production') return json({ error: 'Funcionalidade indisponível no momento.' }, { status: 503 })
    return json({ ok: true })
  }
  const raw = await request.text().catch(() => '')
  let body: IncomingWebhook | null = null
  if (raw) {
    try {
      body = JSON.parse(raw) as IncomingWebhook
    } catch {
      body = null
    }
  }
  if (!body?.type) return json({ error: 'Missing type' }, { status: 400 })

  const supabase = getSupabaseAdminClient()

  const payload = body.data ?? {}
  const meta = extractProviderMetadata(payload)

  const providerId = getFinancialProvider()
  const runtime = getFinancialEnvironment(providerId)
  const runtimeEnvironment = runtime.environment
  const incomingProviderEnvironment = normalizeIncomingEnvironment(meta.provider_environment)
  if (incomingProviderEnvironment && incomingProviderEnvironment !== runtimeEnvironment) {
    return json(
      {
        error: 'Webhook recebido para ambiente financeiro incompatível com este deployment.',
        code: 'provider_environment_mismatch',
        providerEventId: buildWebhookProviderEventId(body, raw),
        expectedEnvironment: runtimeEnvironment,
        receivedEnvironment: incomingProviderEnvironment,
      },
      { status: 409 },
    )
  }
  if (providerId === 'pagarme') {
    if (process.env.NODE_ENV === 'production' && !isPagarMeWebhookConfigured()) {
      return json({ error: 'Webhook basic auth not configured' }, { status: 503 })
    }

    const authConfig = getPagarmeWebhookBasicAuthConfig()
    if (isPagarmeWebhookBasicAuthConfigured(authConfig)) {
      const authResult = verifyPagarmeWebhookBasicAuth(request.headers.get('authorization'), authConfig)
      if (!authResult.ok) return jsonUnauthorized({ error: 'Invalid webhook authorization' })
    }
  } else {
    const signatureConfig = getWebhookSignatureConfig()
    const secret = signatureConfig.secret
    if (process.env.NODE_ENV === 'production' && !secret) return json({ error: 'Webhook secret not configured' }, { status: 503 })
    if (secret) {
      const signatureHeader = getWebhookSignatureHeader(request.headers, signatureConfig)
      if (!signatureHeader) return json({ error: 'Missing signature' }, { status: 401 })
      const ok = verifyWebhookSignature({
        rawBody: raw,
        headerValue: signatureHeader.value,
        secret,
        requireSha256Prefix: signatureConfig.requireSha256Prefix,
      })
      if (!ok) return json({ error: 'Invalid signature' }, { status: 401 })
    }
  }

  const providerEventId = buildWebhookProviderEventId(body, raw)
  const webhookClientIp = getRequestClientIp(request)
  const webhookRate = checkRuntimeRateLimit({
    key: `provider-webhook:${providerId}:${webhookClientIp}`,
    limit: 600,
    windowMs: 60_000,
  })
  if (!webhookRate.allowed) {
    return json({ error: 'Too many webhook requests' }, { status: 429 })
  }

  const metaOrgId = typeof meta.organization_id === 'string' ? meta.organization_id : null
  const metaAssinaturaId = typeof meta.assinatura_id === 'string' ? meta.assinatura_id : null
  const metaAntecipacaoId = typeof meta.anticipation_id === 'string' ? meta.anticipation_id : typeof meta.antecipacao_id === 'string' ? meta.antecipacao_id : null

  const internalTransactionId =
    typeof meta.internal_transaction_id === 'string'
      ? meta.internal_transaction_id
      : typeof meta.transaction_id === 'string'
        ? meta.transaction_id
        : null
  const internalPaymentLinkId =
    typeof meta.internal_payment_link_id === 'string'
      ? meta.internal_payment_link_id
      : typeof meta.payment_link_id === 'string'
        ? meta.payment_link_id
        : null
  const providerPaymentId = extractProviderReference(payload)
  const paymentLinkCorrelationCode = internalPaymentLinkId ?? extractPaymentLinkCorrelationCode(payload)
  const providerSubscriptionId = typeof payload?.subscription_id === 'string' ? payload.subscription_id : typeof payload?.id === 'string' && String(body.type).startsWith('subscription.') ? payload.id : null
  const providerPayoutId = typeof payload?.payout_id === 'string' ? payload.payout_id : typeof payload?.id === 'string' && String(body.type).startsWith('payout.') ? payload.id : null
  const providerAnticipationId = typeof payload?.anticipation_id === 'string' ? payload.anticipation_id : typeof payload?.id === 'string' && String(body.type).startsWith('anticipation.') ? payload.id : null
  const providerOrderId = extractProviderOrderId(body, payload)
  const providerChargeId = extractProviderChargeId(body, payload)
  const providerOrderIdPresent = typeof providerOrderId === 'string'
  const providerChargeIdPresent = typeof providerChargeId === 'string'
  const providerPaymentLinkIdPresent = typeof payload?.payment_link_id === 'string' || typeof payload?.payment_link?.id === 'string'
  const attemptedSources: CorrelationSourceName[] = []
  let resolvedSource: CorrelationSourceName | null = null

  let organizationId: string | null = metaOrgId
  if (metaOrgId) {
    attemptedSources.push('metadata.organization_id')
    resolvedSource = 'metadata.organization_id'
  }
  if (!organizationId && internalTransactionId) {
    attemptedSources.push('metadata.internal_transaction_id')
    const { data } = await supabase.from('transactions').select('organization_id, provider, provider_environment').eq('id', internalTransactionId).maybeSingle()
    if ((data as any)?.provider && String((data as any).provider) !== providerId) return json({ error: 'Webhook recebido para provedor incompatível.' }, { status: 409 })
    if ((data as any)?.provider_environment && String((data as any).provider_environment) !== runtimeEnvironment) {
      return json({ error: 'Webhook recebido para ambiente financeiro incompatível com a transação.' }, { status: 409 })
    }
    organizationId = (data as any)?.organization_id ?? null
    if (organizationId) resolvedSource = 'metadata.internal_transaction_id'
  }
  if (!organizationId && internalPaymentLinkId) {
    attemptedSources.push('metadata.internal_payment_link_id')
    const { data } = await supabase.from('payment_links').select('organization_id').eq('id', internalPaymentLinkId).maybeSingle()
    organizationId = (data as any)?.organization_id ?? null
    if (organizationId) resolvedSource = 'metadata.internal_payment_link_id'
  }
  if (!organizationId && providerOrderId) {
    attemptedSources.push('provider_order_id->transactions.provider_order_id')
    const { data } = await supabase
      .from('transactions')
      .select('organization_id')
      .eq('provider', providerId)
      .eq('provider_environment', runtimeEnvironment)
      .eq('provider_order_id', providerOrderId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    organizationId = (data as any)?.organization_id ?? null
    if (organizationId) resolvedSource = 'provider_order_id->transactions.provider_order_id'
  }
  if (!organizationId && providerChargeId) {
    attemptedSources.push('provider_charge_id->transactions.provider_charge_id')
    const { data } = await supabase
      .from('transactions')
      .select('organization_id')
      .eq('provider', providerId)
      .eq('provider_environment', runtimeEnvironment)
      .eq('provider_charge_id', providerChargeId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    organizationId = (data as any)?.organization_id ?? null
    if (organizationId) resolvedSource = 'provider_charge_id->transactions.provider_charge_id'
  }
  if (!organizationId && internalTransactionId) {
    attemptedSources.push('metadata.transaction_id')
    const { data } = await supabase.from('transactions').select('organization_id, provider, provider_environment').eq('id', internalTransactionId).maybeSingle()
    if ((data as any)?.provider && String((data as any).provider) !== providerId) return json({ error: 'Webhook recebido para provedor incompatível.' }, { status: 409 })
    if ((data as any)?.provider_environment && String((data as any).provider_environment) !== runtimeEnvironment) {
      return json({ error: 'Webhook recebido para ambiente financeiro incompatível com a transação.' }, { status: 409 })
    }
    organizationId = (data as any)?.organization_id ?? null
    if (organizationId) resolvedSource = 'metadata.transaction_id'
  }
  if (!organizationId && providerPaymentId) {
    attemptedSources.push('provider_reference->transactions.provider_reference')
    const { data } = await supabase
      .from('transactions')
      .select('organization_id')
      .eq('provider', providerId)
      .eq('provider_environment', runtimeEnvironment)
      .eq('provider_reference', providerPaymentId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    organizationId = (data as any)?.organization_id ?? null
    if (organizationId) resolvedSource = 'provider_reference->transactions.provider_reference'
  }
  if (!organizationId && providerPaymentId) {
    attemptedSources.push('payload.id->transactions.provider_reference')
  }
  if (!organizationId && paymentLinkCorrelationCode) {
    attemptedSources.push('payment_link_correlation_code->payment_links.id')
    const { data } = await supabase
      .from('payment_links')
      .select('organization_id')
      .eq('id', paymentLinkCorrelationCode)
      .maybeSingle()
    organizationId = (data as any)?.organization_id ?? null
    if (organizationId) resolvedSource = 'payment_link_correlation_code->payment_links.id'
    if (!organizationId) {
      attemptedSources.push('payment_link_correlation_code->payment_links.slug')
      const bySlug = await supabase
        .from('payment_links')
        .select('organization_id')
        .eq('slug', paymentLinkCorrelationCode)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      organizationId = (bySlug.data as any)?.organization_id ?? null
      if (organizationId) resolvedSource = 'payment_link_correlation_code->payment_links.slug'
    }
  }
  if (!organizationId && providerSubscriptionId) {
    attemptedSources.push('provider_subscription_id->subscriptions.provider_reference')
    const { data } = await supabase
      .from('subscriptions')
      .select('organization_id')
      .eq('provider_reference', providerSubscriptionId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    organizationId = (data as any)?.organization_id ?? null
    if (organizationId) resolvedSource = 'provider_subscription_id->subscriptions.provider_reference'
  }
  if (!organizationId && metaAssinaturaId) {
    attemptedSources.push('metadata.assinatura_id')
    const { data } = await supabase.from('pay_assinatura').select('organization_id, provider, provider_environment').eq('id', metaAssinaturaId).maybeSingle()
    if ((data as any)?.provider && String((data as any).provider) !== providerId) return json({ error: 'Webhook recebido para provedor incompatível.' }, { status: 409 })
    if ((data as any)?.provider_environment && String((data as any).provider_environment) !== runtimeEnvironment) {
      return json({ error: 'Webhook recebido para ambiente financeiro incompatível com a assinatura.' }, { status: 409 })
    }
    organizationId = (data as any)?.organization_id ?? null
    if (organizationId) resolvedSource = 'metadata.assinatura_id'
  }
  if (!organizationId && metaAntecipacaoId) {
    attemptedSources.push('metadata.anticipation_id')
    const { data } = await supabase.from('pay_antecipacao').select('organization_id').eq('id', metaAntecipacaoId).maybeSingle()
    organizationId = (data as any)?.organization_id ?? null
    if (organizationId) resolvedSource = 'metadata.anticipation_id'
  }
  if (!organizationId && providerSubscriptionId) {
    attemptedSources.push('provider_subscription_id->pay_assinatura.acquirer_subscription_id')
    const { data } = await supabase
      .from('pay_assinatura')
      .select('organization_id')
      .eq('provider', providerId)
      .eq('provider_environment', runtimeEnvironment)
      .eq('acquirer_subscription_id', providerSubscriptionId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    organizationId = (data as any)?.organization_id ?? null
    if (organizationId) resolvedSource = 'provider_subscription_id->pay_assinatura.acquirer_subscription_id'
  }
  if (!organizationId && providerPayoutId) {
    attemptedSources.push('provider_payout_id->payouts.provider_reference')
    const { data } = await supabase
      .from('payouts')
      .select('organization_id')
      .eq('provider_reference', providerPayoutId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    organizationId = (data as any)?.organization_id ?? null
    if (organizationId) resolvedSource = 'provider_payout_id->payouts.provider_reference'
  }
  if (!organizationId && providerAnticipationId) {
    attemptedSources.push('provider_anticipation_id->pay_antecipacao.acquirer_anticipation_id')
    const r1 = await supabase
      .from('pay_antecipacao')
      .select('organization_id')
      .eq('acquirer_anticipation_id', providerAnticipationId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    organizationId = (r1.data as any)?.organization_id ?? null
    if (organizationId) resolvedSource = 'provider_anticipation_id->pay_antecipacao.acquirer_anticipation_id'
    if (!organizationId) {
      attemptedSources.push('provider_anticipation_id->pay_antecipacao.provider_reference')
      const r2 = await supabase
        .from('pay_antecipacao')
        .select('organization_id')
        .eq('provider_reference', providerAnticipationId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      organizationId = (r2.data as any)?.organization_id ?? null
      if (organizationId) resolvedSource = 'provider_anticipation_id->pay_antecipacao.provider_reference'
    }
  }

  if (!organizationId) {
    let unresolvedEventId: string | null = null
    try {
      unresolvedEventId = await persistUnresolvedWebhookEvent({
        supabase,
        provider: providerId,
        providerEnvironment: runtimeEnvironment,
        providerEventId,
        type: body.type,
        attemptedSources,
        payload: body,
        correlationSnapshot: {
          provider_order_id: providerOrderId,
          provider_charge_id: providerChargeId,
          provider_reference: providerPaymentId,
          internal_transaction_id: internalTransactionId,
          internal_payment_link_id: internalPaymentLinkId,
          payment_link_correlation_code: paymentLinkCorrelationCode,
          provider_order_id_present: providerOrderIdPresent,
          provider_charge_id_present: providerChargeIdPresent,
          provider_payment_link_id_present: providerPaymentLinkIdPresent,
        },
      })
    } catch {
      return json(
        {
          error: 'Webhook sem correlação segura e sem persistência técnica disponível.',
          code: 'unresolved_webhook_persistence_failed',
          providerEventId,
        },
        { status: 503 },
      )
    }

    return json(
      {
        error: 'Webhook sem correlação segura para organization_id.',
        code: 'organization_id_unresolved',
        providerEventId,
        unresolvedEventId,
        attemptedSources,
        providerOrderIdPresent,
        providerChargeIdPresent,
        providerPaymentLinkIdPresent,
      },
      { status: 409 },
    )
  }

  const { data: existing } = await supabase
    .from('webhook_events')
    .select('id, status')
    .eq('organization_id', organizationId)
    .eq('provider', providerId)
    .eq('provider_environment', runtimeEnvironment)
    .eq('provider_event_id', providerEventId)
    .maybeSingle()
  if (existing?.id) {
    await supabase
      .from('webhook_events_unresolved')
      .update({
        status: 'resolved',
        resolved_event_id: existing.id,
        resolved_at: new Date().toISOString(),
        resolution_error: null,
      })
      .eq('provider', providerId)
      .eq('provider_environment', runtimeEnvironment)
      .eq('provider_event_id', providerEventId)
    if (existing.status === 'pending') {
      try {
        await processWebhookEventById(existing.id as string)
      } catch {
      }
    }
    return json({ ok: true, eventId: existing.id as string })
  }

  const insert = await supabase
    .from('webhook_events')
    .insert({
      organization_id: organizationId,
      type: body.type,
      origin: 'provider',
      status: 'pending',
      attempts: 0,
      provider: providerId,
      provider_environment: runtimeEnvironment,
      provider_event_id: providerEventId,
      next_retry_at: new Date().toISOString(),
      payload: body,
    })
    .select('id')
    .single()

  if (insert.error) return json({ error: 'Não foi possível registrar o evento agora.' }, { status: 500 })

  await supabase
    .from('webhook_events_unresolved')
    .update({
      status: 'resolved',
      resolved_event_id: insert.data.id,
      resolved_at: new Date().toISOString(),
      resolution_error: null,
    })
    .eq('provider', providerId)
    .eq('provider_environment', runtimeEnvironment)
    .eq('provider_event_id', providerEventId)

  try {
    await processWebhookEventById(insert.data.id as string)
  } catch {
  }

  return json({ ok: true, eventId: insert.data.id })
}

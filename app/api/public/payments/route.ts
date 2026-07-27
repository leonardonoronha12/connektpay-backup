import { getAcquirerProvider } from '@/lib/acquirer'
import { mapProviderErrorToUserMessage } from '@/lib/acquirer/provider-error'
import type { CreatePaymentRequest } from '@/lib/acquirer/types'
import { getFinancialEnvironment, getFinancialProvider, getProviderCapabilities, isProviderConfigured, isSupabaseServiceConfigured } from '@/lib/env'
import { insertAuditLog } from '@/lib/audit-log'
import { appendLedgerEntryAdmin } from '@/lib/ledger-admin'
import { checkPublicRateLimit } from '@/lib/public-rate-limit'
import { getOrgFromApiKey } from '@/lib/public-api-auth'
import { getStandalonePaymentsBlockMessage } from '@/lib/standalone-payments'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import {
  calculateSplitForProvider,
  ensurePayLedgerFromSplitOnce,
  mapSplitConfigErrorToUserMessage,
  markPayTransacaoProviderError,
  markPayTransacaoProviderSuccess,
  persistSplitSnapshot,
} from '@/lib/split-service'
import crypto from 'crypto'
import { NextResponse } from 'next/server'

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

function normalizeProviderCardPayload(
  providerId: string,
  method: 'pix' | 'card' | undefined,
  card:
    | {
        holderName?: string
        number?: string
        expMonth?: string
        expYear?: string
        cvv?: string
        token?: string
      }
    | undefined,
): CreatePaymentRequest['card'] | null {
  if (method !== 'card') return undefined
  if (!card) return null

  if (providerId === 'pagarme') {
    const token = typeof card.token === 'string' ? card.token.trim() : ''
    const hasRawPan = typeof card.number === 'string' && card.number.trim().length > 0
    const hasRawCvv = typeof card.cvv === 'string' && card.cvv.trim().length > 0
    if (!token || hasRawPan || hasRawCvv) return null

    return {
      token,
      holderName: typeof card.holderName === 'string' ? card.holderName.trim() : undefined,
      expMonth: typeof card.expMonth === 'string' ? card.expMonth.trim() : undefined,
      expYear: typeof card.expYear === 'string' ? card.expYear.trim() : undefined,
    }
  }

  return card
}

async function ensureSaleLedgerOnce(input: { organizationId: string; transactionId: string; amount: number }) {
  const supabase = getSupabaseAdminClient()
  const runtime = getFinancialEnvironment()
  const { data: existingSale } = await supabase
    .from('ledger_entries')
    .select('id')
    .eq('organization_id', input.organizationId)
    .eq('provider', runtime.providerId)
    .eq('provider_environment', runtime.environment)
    .eq('transaction_id', input.transactionId)
    .eq('type', 'sale')
    .limit(1)
    .maybeSingle()
  if (!existingSale?.id) {
    await appendLedgerEntryAdmin({
      organizationId: input.organizationId,
      transactionId: input.transactionId,
      type: 'sale',
      direction: 'credit',
      amount: input.amount,
      origin: 'system',
    })
  }
}

export async function POST(request: Request) {
  if (!isSupabaseServiceConfigured()) return json({ error: 'Funcionalidade indisponÃ­vel no momento.' }, { status: 503 })
  const providerId = getFinancialProvider()
  const runtime = getFinancialEnvironment(providerId)
  const capabilities = getProviderCapabilities(providerId)
  if (!capabilities.credentialsConfigured || !isProviderConfigured(providerId)) {
    return json({ error: 'O provedor financeiro ainda nÃ£o estÃ¡ configurado.' }, { status: 503 })
  }

  const ctx = await getOrgFromApiKey(request)
  if (!ctx?.apiKeyHash) return json({ error: 'Unauthorized' }, { status: 401 })

  const allowed = await checkPublicRateLimit({ organizationId: ctx.organizationId, apiKeyHash: ctx.apiKeyHash, limit: 60, windowSeconds: 60 })
  if (!allowed) return json({ error: 'Rate limit exceeded' }, { status: 429 })

  const body = (await request.json().catch(() => null)) as
    | null
    | {
        paymentLinkSlug?: string
        method?: 'pix' | 'card'
        customer?: { name?: string; email?: string; document?: string }
        metadata?: Record<string, string>
        installments?: number
        amount?: number
        description?: string
        card?: {
          holderName?: string
          number?: string
          expMonth?: string
          expYear?: string
          cvv?: string
          token?: string
        }
      }

  if (!body) return json({ error: 'Invalid body' }, { status: 400 })
  if (body.method !== 'pix' && body.method !== 'card') return json({ error: 'Invalid method' }, { status: 400 })
  const normalizedCard = normalizeProviderCardPayload(providerId, body.method, body.card)
  if (body.method === 'card' && !normalizedCard) {
    return json({ error: 'Dados de cartão inválidos. Para Pagar.me, envie apenas card.token e dados operacionais.' }, { status: 400 })
  }

  const blockMessage = getStandalonePaymentsBlockMessage(body.paymentLinkSlug)
  if (blockMessage) {
    return json(
      {
        error: blockMessage,
        code: 'standalone_payments_disabled',
      },
      { status: 503 }
    )
  }

  const supabase = getSupabaseAdminClient()

  let paymentLink: any = null
  if (body.paymentLinkSlug) {
    const { data, error } = await supabase
      .from('payment_links')
      .select('id, organization_id, amount, currency, name, description, type, methods, max_installments, status, slug')
      .eq('organization_id', ctx.organizationId)
      .eq('slug', body.paymentLinkSlug)
      .eq('status', 'active')
      .maybeSingle()
    if (error) return json({ error: 'NÃ£o foi possÃ­vel carregar o link de pagamento agora.' }, { status: 500 })
    if (!data) return json({ error: 'Link de pagamento nÃ£o encontrado.' }, { status: 404 })
    paymentLink = data
  }

  const amount = paymentLink ? Number(paymentLink.amount) : typeof body.amount === 'number' ? body.amount : null
  if (!amount || amount <= 0) return json({ error: 'Invalid amount' }, { status: 400 })

  const methods = paymentLink ? ((paymentLink.methods ?? {}) as Record<string, unknown>) : null
  if (paymentLink) {
    if (body.method === 'pix' && methods?.pix === false) return json({ error: 'PIX not available' }, { status: 400 })
    if (body.method === 'card' && methods?.card === false) return json({ error: 'Card not available' }, { status: 400 })
  }

  let customerId: string | null = null
  const customerEmail = body.customer?.email?.trim() || null
  if (customerEmail) {
    const { data: existing } = await supabase.from('customers').select('id').eq('organization_id', ctx.organizationId).eq('email', customerEmail).maybeSingle()
    if (existing?.id) customerId = existing.id
  }
  if (!customerId && (body.customer?.name || customerEmail || body.customer?.document)) {
    const { data: createdCustomer, error: customerError } = await supabase
      .from('customers')
      .insert({
        organization_id: ctx.organizationId,
        name: body.customer?.name ?? customerEmail ?? 'Cliente',
        email: customerEmail,
        document: body.customer?.document ?? null,
      })
      .select('id')
      .single()
    if (customerError) return json({ error: 'NÃ£o foi possÃ­vel registrar o cliente agora.' }, { status: 500 })
    customerId = createdCustomer.id
  }

  const transactionInsert = await supabase
    .from('transactions')
    .insert({
      organization_id: ctx.organizationId,
      customer_id: customerId,
      payment_link_id: paymentLink?.id ?? null,
      amount,
      currency: 'BRL',
      method: body.method,
      status: 'created',
      provider: runtime.providerId,
      provider_environment: runtime.environment,
      provider_reference: null,
      provider_payload: {},
      public_token: crypto.randomUUID(),
    })
    .select('id, public_token')
    .single()

  if (transactionInsert.error) return json({ error: 'NÃ£o foi possÃ­vel criar a transaÃ§Ã£o agora.' }, { status: 500 })
  const transactionId = transactionInsert.data.id as string
  const transactionPublicToken = (transactionInsert.data as any).public_token as string

  let splitResult: Awaited<ReturnType<typeof calculateSplitForProvider>>
  try {
    splitResult = await calculateSplitForProvider(supabase, {
      organizationId: ctx.organizationId,
      paymentLinkId: paymentLink?.id ?? null,
      grossAmount: amount,
    })
  } catch (e) {
    const message = mapSplitConfigErrorToUserMessage(e)
    return json({ error: message }, { status: 400 })
  }
  const { split, providerSplit } = splitResult

  await persistSplitSnapshot({
    supabase,
    transactionId,
    organizationId: ctx.organizationId,
    paymentLinkId: paymentLink?.id ?? null,
    currency: 'BRL',
    split,
    providerSplit,
  })

  await insertAuditLog({
    organizationId: ctx.organizationId,
    actorProfileId: ctx.actorProfileId,
    actorUserId: null,
    authType: 'api_key',
    origin: 'public_api',
    action: 'CALCULATE_SPLIT',
    entity: 'pay_transacao',
    entityId: transactionId,
    before: null,
    after: {
      transaction_id: transactionId,
      gross_amount: Number(split.grossAmount),
      connekt_fee_amount: Number(split.connektFeeAmount),
      receiver_total_amount: Number(split.receiverTotalAmount),
      receivers: split.receivers.map((r) => ({ receiver_id: r.receiverId, amount: Number(r.amount), percentage_bps: r.percentageBps })),
    },
  })

  const provider = getAcquirerProvider()

  const createReq: CreatePaymentRequest = {
    amount: { amount, currency: 'BRL' },
    method: body.method,
    description: body.description ?? paymentLink?.description ?? paymentLink?.name ?? 'Pagamento',
    customer: body.customer,
    metadata: {
      ...(body.metadata ?? {}),
      transaction_id: transactionId,
      provider_environment: runtime.environment,
      ...(paymentLink?.id ? { payment_link_id: paymentLink.id as string, slug: paymentLink.slug as string } : null),
    },
    installments: typeof body.installments === 'number' ? body.installments : undefined,
    card: normalizedCard ?? undefined,
    split: providerSplit.receivers.map((r) => ({ receiverId: r.receiverId, amount: r.amount })),
    connektFeeAmount: providerSplit.connektFeeAmount,
  }

  let payment: any
  try {
    payment = await provider.createPayment(createReq)
  } catch (e) {
    const message = mapProviderErrorToUserMessage(e, 'Falha ao processar o pagamento no provedor financeiro.')
    await markPayTransacaoProviderError({ supabase, transactionId, message })
    await insertAuditLog({
      organizationId: ctx.organizationId,
      actorProfileId: ctx.actorProfileId,
      actorUserId: null,
      authType: 'api_key',
      origin: 'public_api',
      action: 'SYNC_FAILED',
      entity: 'pay_transacao',
      entityId: transactionId,
      before: null,
      after: { provider_last_error: message },
    })
    await supabase.from('transactions').update({ status: 'failed', provider_payload: {} }).eq('id', transactionId)
    return json({ error: message }, { status: 502 })
  }

  const { error: updateError } = await supabase
    .from('transactions')
    .update({
      status: payment.status,
      provider_reference: payment.providerPaymentId ?? payment.id,
      provider_payload: payment,
    })
    .eq('id', transactionId)

  if (updateError) return json({ error: 'NÃ£o foi possÃ­vel atualizar a transaÃ§Ã£o agora.' }, { status: 500 })

  await markPayTransacaoProviderSuccess({
    supabase,
    transactionId,
    providerReference: (payment.providerPaymentId ?? payment.id) as string,
    providerPayload: payment,
    status: String(payment.status ?? 'created'),
  })

  await insertAuditLog({
    organizationId: ctx.organizationId,
    actorProfileId: ctx.actorProfileId,
    actorUserId: null,
    authType: 'api_key',
    origin: 'public_api',
    action: 'UPDATE',
    entity: 'pay_transacao',
    entityId: transactionId,
    before: null,
    after: { status: payment.status, provider_reference: payment.providerPaymentId ?? payment.id },
  })

  if (payment.status === 'paid') {
    await ensureSaleLedgerOnce({
      organizationId: ctx.organizationId,
      transactionId,
      amount,
    })
    await ensurePayLedgerFromSplitOnce({ organizationId: ctx.organizationId, transactionId })
  }

  await insertAuditLog({
    organizationId: ctx.organizationId,
    actorProfileId: ctx.actorProfileId,
    actorUserId: null,
    authType: 'api_key',
    origin: 'public_api',
    action: 'CREATE',
    entity: 'transaction',
    entityId: transactionId,
    before: null,
    after: {
      id: transactionId,
      amount,
      currency: 'BRL',
      method: body.method,
      status: payment.status,
      provider_reference: payment.providerPaymentId ?? payment.id,
      payment_link_id: paymentLink?.id ?? null,
    },
  })

  return json({ transactionId, transactionPublicToken, payment })
}

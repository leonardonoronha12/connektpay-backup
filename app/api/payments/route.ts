﻿﻿﻿﻿﻿﻿﻿﻿﻿import { getAcquirerProvider } from '@/lib/acquirer'
import type { CreatePaymentRequest, PaymentResponse } from '@/lib/acquirer/types'
import { createProviderPayment } from '@/lib/provider-payment-sync'
import { getFinancialEnvironment, getFinancialProvider, isSupabaseServiceConfigured } from '@/lib/env'
import { insertAuditLog } from '@/lib/audit-log'
import { getOrganizationOwnerProfileId } from '@/lib/audit-actor'
import { classifyInternalApiError } from '@/lib/api-error'
import { validateCheckoutCustomer } from '@/lib/checkout-validation'
import { createPhase2InternalPayment, InternalPaymentError, validateCheckoutPaymentLink, type CheckoutPaymentLinkRecord } from '@/lib/payments-internal'
import { getOrgFromApiKey } from '@/lib/public-api-auth'
import { checkPublicRateLimit } from '@/lib/public-rate-limit'
import { buildStableRequestKey, checkRuntimeRateLimit, claimRuntimeReplayWindow, getRequestClientIp } from '@/lib/runtime-guards'
import { assertRole, requireSessionOrgContext } from '@/lib/session-org-context'
import { getStandalonePaymentsBlockMessage } from '@/lib/standalone-payments'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'

type PaymentRequestBody = {
  paymentLinkSlug?: string
  idempotencyKey?: string
  method?: 'pix' | 'card'
  customer?: { name?: string; email?: string; document?: string; phone?: string }
  metadata?: Record<string, string>
  installments?: number
  amount?: number
  description?: string
  card?: {
    holderName?: string
    token?: string
    number?: string
    expMonth?: string
    expYear?: string
    cvv?: string
    brand?: string
    last4?: string
  }
}

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

function getRequestedIdempotencyKey(request: Request, body: PaymentRequestBody | null) {
  const bodyKey = typeof body?.idempotencyKey === 'string' ? body.idempotencyKey.trim() : ''
  if (bodyKey) return bodyKey
  const headerKey = request.headers.get('x-idempotency-key')?.trim() || request.headers.get('idempotency-key')?.trim() || ''
  if (headerKey) return headerKey
  return typeof body?.metadata?.attempt_id === 'string' && body.metadata.attempt_id.trim() ? body.metadata.attempt_id.trim() : null
}

async function resolveCustomerId(input: {
  supabase: any
  organizationId: string
  customer?: { name?: string; email?: string; document?: string; phone?: string | null } | null
}) {
  let customerId: string | null = null
  const customerEmail = input.customer?.email?.trim() || null
  if (customerEmail) {
    const { data: existing } = await input.supabase
      .from('customers')
      .select('id, phone')
      .eq('organization_id', input.organizationId)
      .eq('email', customerEmail)
      .maybeSingle()
    if (existing?.id) {
      customerId = existing.id
      if (!existing.phone && input.customer?.phone) {
        await input.supabase
          .from('customers')
          .update({ phone: input.customer.phone })
          .eq('organization_id', input.organizationId)
          .eq('id', existing.id)
      }
    }
  }

  if (!customerId && (input.customer?.name || customerEmail || input.customer?.document)) {
    const { data: createdCustomer, error: customerError } = await input.supabase
      .from('customers')
      .insert({
        organization_id: input.organizationId,
        name: input.customer?.name ?? customerEmail ?? 'Cliente',
        email: customerEmail,
        document: input.customer?.document ?? null,
        phone: input.customer?.phone ?? null,
      })
      .select('id')
      .single()
    if (customerError) throw new InternalPaymentError('Não foi possível registrar o cliente agora.', { status: 500, code: 'customer_insert_failed' })
    customerId = createdCustomer.id
  }

  return customerId
}

function buildPhase2Response(input: {
  transactionId: string
  publicToken: string | null
  idempotencyKey: string
  code: string
  message: string
}) {
  return json(
    {
      error: input.message,
      code: input.code,
      transactionId: input.transactionId,
      internalTransactionId: input.transactionId,
      transactionPublicToken: input.publicToken,
      idempotencyKey: input.idempotencyKey,
      payment: {
        id: input.transactionId,
        status: 'provider_error',
      },
    },
    { status: 503 },
  )
}

function normalizeProviderCardPayload(
  providerId: string,
  method: PaymentRequestBody['method'],
  card: PaymentRequestBody['card'],
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
      brand: typeof card.brand === 'string' ? card.brand.trim() : undefined,
      last4: typeof card.last4 === 'string' ? card.last4.trim() : undefined,
    }
  }

  return card
}

function toProviderPayloadMetadata(input: {
  organizationId: string
  paymentLink?: CheckoutPaymentLinkRecord | null
  transactionId: string
  idempotencyKey: string
  providerEnvironment: string
  bodyMetadata?: Record<string, string>
}) {
  const userMetadata = Object.fromEntries(
    Object.entries(input.bodyMetadata ?? {}).filter(([key, value]) => {
      if (['organization_id', 'internal_transaction_id', 'internal_payment_link_id', 'idempotency_key', 'provider_environment'].includes(key)) return false
      return typeof value === 'string' && value.trim().length > 0
    }),
  )

  return {
    ...userMetadata,
    organization_id: input.organizationId,
    internal_transaction_id: input.transactionId,
    internal_payment_link_id: input.paymentLink?.id ?? '',
    idempotency_key: input.idempotencyKey,
    provider_environment: input.providerEnvironment,
    payment_link_slug: input.paymentLink?.slug ?? '',
  }
}

function toSerializablePayment(payment: PaymentResponse) {
  return {
    id: payment.id,
    status: payment.status,
    providerPaymentId: payment.providerPaymentId ?? null,
    providerReference: payment.providerReference ?? null,
    providerOrderId: payment.providerOrderId ?? null,
    providerChargeId: payment.providerChargeId ?? null,
    amount: typeof payment.amount === 'number' ? payment.amount : null,
    currency: payment.currency ?? null,
    createdAt: payment.createdAt ?? null,
    pix: payment.pix
      ? {
          qrCode: payment.pix.qrCode ?? null,
          qrCodeUrl: payment.pix.qrCodeUrl ?? null,
          qrCodeBase64: payment.pix.qrCodeBase64 ?? null,
          copyPaste: payment.pix.copyPaste ?? null,
          expiresAt: payment.pix.expiresAt ?? null,
        }
      : null,
    raw: payment.raw ?? null,
  }
}

function normalizePersistedPayment(row: any): PaymentResponse | null {
  if (!row) return null
  const providerPayload = row.provider_payload && typeof row.provider_payload === 'object' ? row.provider_payload : {}
  const pixPayload = providerPayload?.pix && typeof providerPayload.pix === 'object' ? providerPayload.pix : {}
  const providerReference = typeof row.provider_reference === 'string' ? row.provider_reference : null
  const providerOrderId = typeof row.provider_order_id === 'string' ? row.provider_order_id : null
  const providerChargeId = typeof row.provider_charge_id === 'string' ? row.provider_charge_id : null
  if (!providerReference && !providerOrderId && !providerChargeId) return null

  return {
    id: providerReference ?? providerChargeId ?? providerOrderId ?? String(row.id),
    status: String(row.status ?? 'created') as PaymentResponse['status'],
    providerPaymentId: providerReference ?? undefined,
    providerReference: providerReference ?? undefined,
    providerOrderId: providerOrderId ?? undefined,
    providerChargeId: providerChargeId ?? undefined,
    amount: typeof row.amount === 'number' ? row.amount : undefined,
    currency: typeof row.currency === 'string' && row.currency.toUpperCase() === 'BRL' ? 'BRL' : undefined,
    createdAt: typeof row.created_at === 'string' ? row.created_at : undefined,
    pix:
      pixPayload.qrCode || pixPayload.qrCodeUrl || pixPayload.copyPaste || pixPayload.expiresAt
        ? {
            qrCode: typeof pixPayload.qrCode === 'string' ? pixPayload.qrCode : undefined,
            qrCodeUrl: typeof pixPayload.qrCodeUrl === 'string' ? pixPayload.qrCodeUrl : undefined,
            qrCodeBase64: typeof pixPayload.qrCodeBase64 === 'string' ? pixPayload.qrCodeBase64 : undefined,
            copyPaste: typeof pixPayload.copyPaste === 'string' ? pixPayload.copyPaste : undefined,
            expiresAt: typeof pixPayload.expiresAt === 'string' ? pixPayload.expiresAt : undefined,
          }
        : undefined,
    raw: providerPayload.raw ?? providerPayload,
  }
}

async function loadPersistedTransactionState(supabase: any, transactionId: string) {
  const { data, error } = await supabase
    .from('transactions')
    .select(
      'id, status, amount, currency, created_at, provider_reference, provider_order_id, provider_charge_id, provider_payload, provider_error_code, provider_error_message',
    )
    .eq('id', transactionId)
    .maybeSingle()
  if (error) throw new InternalPaymentError('Não foi possível carregar a transação agora.', { status: 500, code: 'transaction_reload_failed' })
  return data
}

async function persistProviderSuccess(input: {
  supabase: any
  transactionId: string
  payment: PaymentResponse
}) {
  const providerPayload = toSerializablePayment(input.payment)
  const providerReference = input.payment.providerReference ?? input.payment.providerPaymentId ?? input.payment.id

  const txPatch = {
    status: input.payment.status,
    provider_reference: providerReference,
    provider_order_id: input.payment.providerOrderId ?? null,
    provider_charge_id: input.payment.providerChargeId ?? null,
    provider_payload: providerPayload,
    provider_error_code: null,
    provider_error_message: null,
  }

  const payTxPatch = {
    status: input.payment.status,
    provider_reference: providerReference,
    provider_order_id: input.payment.providerOrderId ?? null,
    provider_charge_id: input.payment.providerChargeId ?? null,
    provider_payload: providerPayload,
    provider_error_code: null,
    provider_error_message: null,
    provider_last_error: null,
    provider_last_error_at: null,
  }

  const [{ error: txError }, { error: payTxError }] = await Promise.all([
    input.supabase.from('transactions').update(txPatch).eq('id', input.transactionId),
    input.supabase.from('pay_transacao').update(payTxPatch).eq('transaction_id', input.transactionId),
  ])

  if (txError || payTxError) {
    throw new InternalPaymentError('Não foi possível persistir o retorno do provedor agora.', {
      status: 500,
      code: 'provider_persistence_failed',
    })
  }
}

async function persistProviderFailure(input: {
  supabase: any
  transactionId: string
  errorCode: string
  errorMessage: string
}) {
  const now = new Date().toISOString()
  await Promise.all([
    input.supabase
      .from('transactions')
      .update({
        status: 'provider_error',
        provider_error_code: input.errorCode,
        provider_error_message: input.errorMessage,
      })
      .eq('id', input.transactionId),
    input.supabase
      .from('pay_transacao')
      .update({
        status: 'provider_error',
        provider_error_code: input.errorCode,
        provider_error_message: input.errorMessage,
        provider_last_error: input.errorMessage,
        provider_last_error_at: now,
      })
      .eq('transaction_id', input.transactionId),
  ])
}

async function writePaymentAttemptAuditLogs(input: {
  organizationId: string
  actorProfileId: string
  actorUserId: string | null
  authType: 'api_key' | 'session'
  origin: 'internal_api' | 'public_api'
  transactionId: string
  paymentLinkId?: string | null
  amount: number
  currency: string
  method: 'pix' | 'card'
  provider: string
  idempotencyKey: string
  status: string
  providerReference?: string | null
  providerOrderId?: string | null
  providerChargeId?: string | null
  splitSnapshot: {
    gross_amount: number
    connekt_fee_amount: number
    receiver_total_amount: number
    applied_receivers: unknown
  }
  providerErrorCode?: string | null
  providerErrorMessage?: string | null
}) {
  await insertAuditLog({
    organizationId: input.organizationId,
    actorProfileId: input.actorProfileId,
    actorUserId: input.actorUserId,
    authType: input.authType,
    origin: input.origin,
    action: 'CALCULATE_SPLIT',
    entity: 'pay_transacao',
    entityId: input.transactionId,
    before: null,
    after: {
      transaction_id: input.transactionId,
      idempotency_key: input.idempotencyKey,
      gross_amount: input.splitSnapshot.gross_amount,
      connekt_fee_amount: input.splitSnapshot.connekt_fee_amount,
      receiver_total_amount: input.splitSnapshot.receiver_total_amount,
      receivers: input.splitSnapshot.applied_receivers,
    },
  })

  await insertAuditLog({
    organizationId: input.organizationId,
    actorProfileId: input.actorProfileId,
    actorUserId: input.actorUserId,
    authType: input.authType,
    origin: input.origin,
    action: 'UPDATE',
    entity: 'pay_transacao',
    entityId: input.transactionId,
    before: null,
    after: {
      status: input.status,
      provider_reference: input.providerReference ?? null,
      provider_order_id: input.providerOrderId ?? null,
      provider_charge_id: input.providerChargeId ?? null,
      provider_error_code: input.providerErrorCode ?? null,
      provider_error_message: input.providerErrorMessage ?? null,
    },
  })

  await insertAuditLog({
    organizationId: input.organizationId,
    actorProfileId: input.actorProfileId,
    actorUserId: input.actorUserId,
    authType: input.authType,
    origin: input.origin,
    action: 'CREATE',
    entity: 'transaction',
    entityId: input.transactionId,
    before: null,
    after: {
      id: input.transactionId,
      payment_link_id: input.paymentLinkId ?? null,
      amount: input.amount,
      currency: input.currency,
      method: input.method,
      status: input.status,
      provider: input.provider,
      provider_reference: input.providerReference ?? null,
      provider_order_id: input.providerOrderId ?? null,
      provider_charge_id: input.providerChargeId ?? null,
      idempotency_key: input.idempotencyKey,
    },
  })
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as PaymentRequestBody | null

    if (!body) return json({ error: 'Invalid body' }, { status: 400 })
    if (body.method !== 'pix' && body.method !== 'card') return json({ error: 'Invalid method' }, { status: 400 })
    if (!isSupabaseServiceConfigured()) return json({ error: 'Funcionalidade indisponível no momento.' }, { status: 503 })

    const supabase = getSupabaseAdminClient()
    const apiKeyCtx = await getOrgFromApiKey(request)
    const providerId = getFinancialProvider()
    const financialRuntime = getFinancialEnvironment(providerId)
    if (apiKeyCtx?.apiKeyHash) {
      const allowed = await checkPublicRateLimit({
        organizationId: apiKeyCtx.organizationId,
        apiKeyHash: apiKeyCtx.apiKeyHash,
        limit: 60,
        windowSeconds: 60,
      })
      if (!allowed) return json({ error: 'Rate limit exceeded' }, { status: 429 })
    }

    if (!body.paymentLinkSlug) {
      const ctx = apiKeyCtx ? null : await requireSessionOrgContext()
      if (!apiKeyCtx) assertRole(ctx!.role, ['owner', 'admin', 'operacional', 'super_admin'])

      const blockMessage = getStandalonePaymentsBlockMessage(body.paymentLinkSlug)
      if (blockMessage) {
        return json(
          {
            error: blockMessage,
            code: 'standalone_payments_disabled',
          },
          { status: 503 },
        )
      }

      const organizationId = apiKeyCtx ? apiKeyCtx.organizationId : (ctx!.organizationId as string)
      const actorProfileId = apiKeyCtx ? apiKeyCtx.actorProfileId : (ctx!.actorProfileId as string)
      const authType: 'api_key' | 'session' = apiKeyCtx ? 'api_key' : 'session'
      const requirePhone = providerId === 'pagarme'
      const customerValidation = validateCheckoutCustomer(body.customer, { requirePhone })
      if (!customerValidation.ok) return json({ error: customerValidation.message }, { status: 400 })
      const customer = customerValidation.customer
      const normalizedCard = normalizeProviderCardPayload(providerId, body.method, body.card)
      if (body.method === 'card' && !normalizedCard) {
        return json({ error: 'Dados de cartão inválidos. Para Pagar.me, envie apenas card.token e dados operacionais.' }, { status: 400 })
      }
      const customerId = await resolveCustomerId({ supabase, organizationId, customer })

      const result = await createPhase2InternalPayment({
        supabase,
        organizationId,
        paymentLink: null,
        amount: typeof body.amount === 'number' ? body.amount : null,
        currency: 'BRL',
        method: body.method,
        customer,
        customerId,
        provider: providerId,
        providerEnvironment: financialRuntime.environment,
        metadata: body.metadata,
        explicitIdempotencyKey: getRequestedIdempotencyKey(request, body),
        requestId: request.headers.get('x-request-id'),
        attemptId: body.metadata?.attempt_id,
        installments: typeof body.installments === 'number' ? body.installments : undefined,
        phase2ProviderErrorCode: 'provider_phase_pending',
        phase2ProviderErrorMessage: 'Transação interna criada e aguardando sincronização com o provedor financeiro.',
      })

      const existingTransaction = await loadPersistedTransactionState(supabase, result.transaction.transactionId)
      const existingPayment = normalizePersistedPayment(existingTransaction)
      if (result.transaction.reused && existingPayment) {
        return json({
          transactionId: result.transaction.transactionId,
          internalTransactionId: result.transaction.transactionId,
          transactionPublicToken: result.transaction.publicToken,
          idempotencyKey: result.transaction.idempotencyKey,
          payment: existingPayment,
        })
      }

      const providerPayment = await createProviderPayment({
        request: {
          amount: { amount: result.amount, currency: result.currency },
          method: body.method,
          description: body.description ?? 'Pagamento',
          customer,
          metadata: toProviderPayloadMetadata({
            organizationId,
            paymentLink: null,
            transactionId: result.transaction.transactionId,
            idempotencyKey: result.transaction.idempotencyKey,
            providerEnvironment: financialRuntime.environment,
            bodyMetadata: body.metadata,
          }),
          installments: typeof body.installments === 'number' ? body.installments : undefined,
          card: normalizedCard ?? undefined,
        },
      })

      if (providerPayment.ok) {
        const payment = providerPayment.payment
        await persistProviderSuccess({
          supabase,
          transactionId: result.transaction.transactionId,
          payment,
        })

        await writePaymentAttemptAuditLogs({
          organizationId,
          actorProfileId,
          actorUserId: authType === 'session' ? actorProfileId : null,
          authType,
          origin: authType === 'session' ? 'internal_api' : 'public_api',
          transactionId: result.transaction.transactionId,
          amount: result.amount,
          currency: result.currency,
          method: body.method,
          provider: providerId,
          idempotencyKey: result.transaction.idempotencyKey,
          status: payment.status,
          providerReference: payment.providerReference ?? payment.providerPaymentId ?? payment.id,
          providerOrderId: payment.providerOrderId ?? null,
          providerChargeId: payment.providerChargeId ?? null,
          splitSnapshot: result.splitSnapshot,
        })

        return json({
          transactionId: result.transaction.transactionId,
          internalTransactionId: result.transaction.transactionId,
          transactionPublicToken: result.transaction.publicToken,
          idempotencyKey: result.transaction.idempotencyKey,
          payment,
        })
      } else {
        const { code, message, status } = providerPayment

        await persistProviderFailure({
          supabase,
          transactionId: result.transaction.transactionId,
          errorCode: code,
          errorMessage: message,
        })

        await writePaymentAttemptAuditLogs({
          organizationId,
          actorProfileId,
          actorUserId: authType === 'session' ? actorProfileId : null,
          authType,
          origin: authType === 'session' ? 'internal_api' : 'public_api',
          transactionId: result.transaction.transactionId,
          amount: result.amount,
          currency: result.currency,
          method: body.method,
          provider: providerId,
          idempotencyKey: result.transaction.idempotencyKey,
          status: 'provider_error',
          providerReference: null,
          providerOrderId: null,
          providerChargeId: null,
          splitSnapshot: result.splitSnapshot,
          providerErrorCode: code,
          providerErrorMessage: message,
        })

        return json(
          {
            error: message,
            code,
            transactionId: result.transaction.transactionId,
            internalTransactionId: result.transaction.transactionId,
            transactionPublicToken: result.transaction.publicToken,
            idempotencyKey: result.transaction.idempotencyKey,
            payment: {
              id: result.transaction.transactionId,
              status: 'failed',
            },
          },
          { status },
        )
      }
    }

    let linkQuery = supabase
      .from('payment_links')
      .select('id, organization_id, amount, currency, name, description, type, methods, max_installments, status, slug, metadata')
      .eq('slug', body.paymentLinkSlug)
    if (apiKeyCtx) linkQuery = linkQuery.eq('organization_id', apiKeyCtx.organizationId)
    const { data: linkRows, error: linkError } = await linkQuery.limit(2)

    if (linkError) return json({ error: 'Não foi possível carregar o link de pagamento agora.' }, { status: 500 })
    const links = Array.isArray(linkRows) ? linkRows : []
    if (!links.length) return json({ error: 'Link de pagamento não encontrado.' }, { status: 404 })
    if (links.length > 1) {
      return json({ error: 'Slug ambíguo entre organizações. Não foi possível isolar o link com segurança.' }, { status: 409 })
    }
    const link = links[0] as CheckoutPaymentLinkRecord

    validateCheckoutPaymentLink({
      link,
      method: body.method,
      expectedOrganizationId: apiKeyCtx?.organizationId ?? null,
    })

    const requirePhone = providerId === 'pagarme'
    const customerValidation = validateCheckoutCustomer(body.customer, { requirePhone })
    if (!customerValidation.ok) return json({ error: customerValidation.message }, { status: 400 })
    const customer = customerValidation.customer
    const normalizedCard = normalizeProviderCardPayload(providerId, body.method, body.card)
    if (body.method === 'card' && !normalizedCard) {
      return json({ error: 'Dados de cartão inválidos. Para Pagar.me, envie apenas card.token e dados operacionais.' }, { status: 400 })
    }

    if (!apiKeyCtx) {
      const clientIp = getRequestClientIp(request)
      const paymentRate = checkRuntimeRateLimit({
        key: `public-checkout:${clientIp}:${String(body.paymentLinkSlug)}`,
        limit: 20,
        windowMs: 60_000,
      })
      if (!paymentRate.allowed) return json({ error: 'Rate limit exceeded' }, { status: 429 })

      const replayKey = buildStableRequestKey([
        'payment-link-checkout',
        String(link.id ?? ''),
        String(body.method ?? ''),
        customer.email,
        customer.document,
        typeof body.installments === 'number' ? body.installments : '',
        clientIp,
      ])
      const replay = claimRuntimeReplayWindow({ key: replayKey, ttlMs: 60_000 })
      if (!replay.claimed) {
        return json({ error: 'Uma tentativa idêntica já está em processamento. Aguarde antes de reenviar.' }, { status: 409 })
      }
    }

    const customerId = await resolveCustomerId({ supabase, organizationId: link.organization_id, customer })
    const actorProfileId = apiKeyCtx?.actorProfileId ?? (await getOrganizationOwnerProfileId(link.organization_id as string))
    const result = await createPhase2InternalPayment({
      supabase,
      organizationId: link.organization_id,
      paymentLink: link,
      method: body.method,
      customer,
      customerId,
      provider: providerId,
      providerEnvironment: financialRuntime.environment,
      metadata: body.metadata,
      explicitIdempotencyKey: getRequestedIdempotencyKey(request, body),
      requestId: request.headers.get('x-request-id'),
      attemptId: body.metadata?.attempt_id,
      installments: typeof body.installments === 'number' ? body.installments : undefined,
      phase2ProviderErrorCode: 'provider_phase_pending',
      phase2ProviderErrorMessage: 'Transação interna criada e aguardando sincronização com o provedor financeiro.',
    })

    const existingTransaction = await loadPersistedTransactionState(supabase, result.transaction.transactionId)
    const existingPayment = normalizePersistedPayment(existingTransaction)
    if (result.transaction.reused && existingPayment) {
      return json({
        transactionId: result.transaction.transactionId,
        internalTransactionId: result.transaction.transactionId,
        transactionPublicToken: result.transaction.publicToken,
        idempotencyKey: result.transaction.idempotencyKey,
        payment: existingPayment,
      })
    }

    const providerPayment = await createProviderPayment({
      request: {
        amount: { amount: result.amount, currency: result.currency },
        method: body.method,
        description: body.description ?? link.description ?? link.name ?? 'Pagamento',
        customer,
        metadata: toProviderPayloadMetadata({
          organizationId: link.organization_id,
          paymentLink: link,
          transactionId: result.transaction.transactionId,
          idempotencyKey: result.transaction.idempotencyKey,
          providerEnvironment: financialRuntime.environment,
          bodyMetadata: body.metadata,
        }),
        installments: typeof body.installments === 'number' ? body.installments : undefined,
        card: normalizedCard ?? undefined,
      },
    })

    if (providerPayment.ok) {
      const payment = providerPayment.payment
      await persistProviderSuccess({
        supabase,
        transactionId: result.transaction.transactionId,
        payment,
      })

      await writePaymentAttemptAuditLogs({
        organizationId: link.organization_id,
        actorProfileId,
        actorUserId: null,
        authType: 'api_key',
        origin: 'public_api',
        transactionId: result.transaction.transactionId,
        paymentLinkId: link.id,
        amount: result.amount,
        currency: result.currency,
        method: body.method,
        provider: providerId,
        idempotencyKey: result.transaction.idempotencyKey,
        status: payment.status,
        providerReference: payment.providerReference ?? payment.providerPaymentId ?? payment.id,
        providerOrderId: payment.providerOrderId ?? null,
        providerChargeId: payment.providerChargeId ?? null,
        splitSnapshot: result.splitSnapshot,
      })

      return json({
        transactionId: result.transaction.transactionId,
        internalTransactionId: result.transaction.transactionId,
        transactionPublicToken: result.transaction.publicToken,
        idempotencyKey: result.transaction.idempotencyKey,
        payment,
      })
    } else {
      const { code, message, status } = providerPayment

      await persistProviderFailure({
        supabase,
        transactionId: result.transaction.transactionId,
        errorCode: code,
        errorMessage: message,
      })

      await writePaymentAttemptAuditLogs({
        organizationId: link.organization_id,
        actorProfileId,
        actorUserId: null,
        authType: 'api_key',
        origin: 'public_api',
        transactionId: result.transaction.transactionId,
        paymentLinkId: link.id,
        amount: result.amount,
        currency: result.currency,
        method: body.method,
        provider: providerId,
        idempotencyKey: result.transaction.idempotencyKey,
        status: 'provider_error',
        providerReference: null,
        providerOrderId: null,
        providerChargeId: null,
        splitSnapshot: result.splitSnapshot,
        providerErrorCode: code,
        providerErrorMessage: message,
      })

      return json(
        {
          error: message,
          code,
          transactionId: result.transaction.transactionId,
          internalTransactionId: result.transaction.transactionId,
          transactionPublicToken: result.transaction.publicToken,
          idempotencyKey: result.transaction.idempotencyKey,
          payment: {
            id: result.transaction.transactionId,
            status: 'failed',
          },
        },
        { status },
      )
    }
  } catch (error) {
    if (error instanceof InternalPaymentError) {
      return json({ error: error.message, code: error.code }, { status: error.status })
    }
    const err = classifyInternalApiError(error)
    return json({ error: err.message }, { status: err.status })
  }
}

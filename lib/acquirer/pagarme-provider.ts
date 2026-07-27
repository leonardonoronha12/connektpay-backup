import type { AcquirerProvider } from '@/lib/acquirer/provider'
import { ProviderError } from '@/lib/acquirer/provider-error'
import {
  createPagarMePaymentLinkPayload,
  normalizePagarMePaymentLinkResponse,
  sanitizePagarMePaymentLinkResponse,
} from '@/lib/acquirer/pagarme-payment-links'
import type {
  AnticipateRequest,
  AnticipateResponse,
  CancelAnticipationRequest,
  CancelAnticipationResponse,
  CancelSubscriptionRequest,
  CancelSubscriptionResponse,
  CreatePaymentLinkRequest,
  CreatePaymentRequest,
  CreateSubscriptionRequest,
  CreateSubscriptionResponse,
  GetAnticipationRequest,
  GetAnticipationResponse,
  GetPayoutRequest,
  GetPayoutResponse,
  GetTransactionRequest,
  GetTransactionResponse,
  ListAnticipationsRequest,
  ListAnticipationsResponse,
  ListPayoutsRequest,
  ListPayoutsResponse,
  ListTransactionsRequest,
  ListTransactionsResponse,
  PaymentLinkCharge,
  PaymentLinkResponse,
  PaymentResponse,
  TokenizeCardRequest,
  TokenizeCardResponse,
} from '@/lib/acquirer/types'

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

class PagarMeAdapterError extends ProviderError {}

function safeTrim(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function ensureStringRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function pickFirstString(...values: unknown[]) {
  for (const value of values) {
    const trimmed = safeTrim(value)
    if (trimmed) return trimmed
  }
  return null
}

function pickFirstObject(...values: unknown[]) {
  for (const value of values) {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  }
  return null
}

function normalizePagarMePaymentStatus(input: unknown): PaymentResponse['status'] {
  const status = safeTrim(input).toLowerCase()
  if (status === 'waiting_payment' || status === 'pending') return 'pending'
  if (status === 'authorized' || status === 'pending_capture') return 'authorized'
  if (status === 'processing') return 'processing'
  if (status === 'paid') return 'paid'
  if (status === 'refunded' || status === 'pending_refund') return 'refunded'
  if (status === 'canceled' || status === 'cancelled') return 'canceled'
  if (status === 'expired') return 'expired'
  if (status === 'failed' || status === 'with_error') return 'failed'
  return 'created'
}

function parsePagarMeCustomerPhone(phone: unknown) {
  const digits = safeTrim(phone).replace(/\D+/g, '')
  const localDigits = digits.startsWith('55') && digits.length >= 12 ? digits.slice(2) : digits
  if (localDigits.length < 10 || localDigits.length > 11) return null
  const areaCode = localDigits.slice(0, 2)
  const number = localDigits.slice(2)
  return {
    mobile_phone: {
      country_code: '55',
      area_code: areaCode,
      number,
    },
  }
}

function buildPagarMePixSplit(split: CreatePaymentRequest['split']) {
  return (split ?? []).map((rule) => ({
    type: 'flat',
    amount: Math.max(0, Math.round(Number(rule.amount ?? 0))),
    recipient_id: rule.receiverId,
  }))
}

function normalizePagarMeRecipientPhone(phone: unknown) {
  const digits = safeTrim(phone)?.replace(/\D+/g, '') ?? ''
  const localDigits = digits.startsWith('55') && digits.length >= 12 ? digits.slice(2) : digits
  if (localDigits.length < 10 || localDigits.length > 11) return []
  return [
    {
      ddd: localDigits.slice(0, 2),
      number: localDigits.slice(2),
      type: 'mobile',
    },
  ]
}

function normalizePagarMeBankAccountType(value: unknown) {
  const normalized = safeTrim(value)?.toLowerCase()
  if (normalized === 'checking' || normalized === 'corrente' || normalized === 'conta_corrente') return 'conta_corrente'
  if (normalized === 'savings' || normalized === 'poupanca' || normalized === 'conta_poupanca') return 'conta_poupanca'
  return 'conta_corrente'
}

function toBirthdateDdMmYyyy(value: unknown) {
  const trimmed = safeTrim(value)
  if (!trimmed) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed)
  if (!match) return null
  return `${match[3]}/${match[2]}/${match[1]}`
}

function buildPagarMeRecipientPayload(input: Parameters<NonNullable<AcquirerProvider['createRecipient']>>[0]) {
  const document = safeTrim(input.document)?.replace(/\D+/g, '')
  const address = ensureStringRecord(input.address)
  const bankAccount = ensureStringRecord(input.bankAccount)
  const metadata = Object.fromEntries(
    Object.entries(input.metadata ?? {}).filter(([, value]) => Boolean(safeTrim(value))),
  )
  const phoneNumbers = normalizePagarMeRecipientPhone(input.phone)
  const bankDocument = safeTrim(bankAccount.document_number ?? bankAccount.documentNumber ?? input.document)?.replace(/\D+/g, '')
  const bankLegalName = pickFirstString(bankAccount.legal_name, bankAccount.legalName, input.legalName, input.name)
  const registerType = input.personType === 'pj' ? 'corporation' : 'individual'
  const personName = pickFirstString(input.name, input.legalName, input.tradeName)
  const companyName = pickFirstString(input.legalName, input.tradeName, input.name)
  const representativeDocument = safeTrim(input.legalResponsibleDocument)?.replace(/\D+/g, '')

  const managingPartners =
    input.personType === 'pj' && input.legalResponsibleName && representativeDocument
      ? [
          {
            name: input.legalResponsibleName,
            document_number: representativeDocument,
            birthdate: toBirthdateDdMmYyyy(input.birthDate),
            email: pickFirstString(input.email),
            self_declared_legal_representative: true,
            address: {
              street: pickFirstString(address.street),
              street_number: pickFirstString(address.number),
              neighborhood: pickFirstString(address.neighborhood, address.district),
              city: pickFirstString(address.city),
              state: pickFirstString(address.state),
              zipcode: pickFirstString(address.zip)?.replace(/\D+/g, ''),
              complementary: pickFirstString(address.complement),
            },
            phone_numbers: phoneNumbers,
          },
        ]
      : undefined

  return {
    transfer_enabled: true,
    transfer_interval: 'weekly',
    transfer_day: '5',
    automatic_anticipation_enabled: false,
    anticipatable_volume_percentage: '0',
    ...(metadata.internal_receiver_id ? { code: metadata.internal_receiver_id } : null),
    ...(pickFirstString(metadata.internal_receiver_id) ? { external_id: metadata.internal_receiver_id } : null),
    register_information: {
      type: registerType,
      document_number: document,
      ...(input.personType === 'pj'
        ? {
            company_name: companyName,
            trading_name: pickFirstString(input.tradeName, input.name),
          }
        : {
            name: personName,
          }),
      email: pickFirstString(input.email),
      address: {
        street: pickFirstString(address.street),
        number: pickFirstString(address.number),
        neighborhood: pickFirstString(address.neighborhood, address.district),
        zip_code: pickFirstString(address.zip)?.replace(/\D+/g, ''),
        city: pickFirstString(address.city),
        state: pickFirstString(address.state),
        country: 'BR',
        complement: pickFirstString(address.complement),
      },
      phone_numbers: phoneNumbers,
      ...(managingPartners?.length ? { managing_partners: managingPartners } : null),
    },
    bank_account: {
      bank_code: pickFirstString(bankAccount.bank_code, bankAccount.bankCode),
      agencia: pickFirstString(bankAccount.agency, bankAccount.agencia),
      conta: pickFirstString(bankAccount.account, bankAccount.conta),
      conta_dv: pickFirstString(bankAccount.account_digit, bankAccount.accountDigit, bankAccount.conta_dv),
      type: normalizePagarMeBankAccountType(bankAccount.account_type ?? bankAccount.accountType),
      document_number: bankDocument,
      legal_name: bankLegalName,
    },
    metadata,
  }
}

function normalizePagarMeRecipientResponse(response: Record<string, unknown>) {
  const requestId = pickFirstString(response.request_id, response.requestId)
  const kycDetails = pickFirstObject(response.kyc_details)
  const status = pickFirstString(response.status) ?? 'registration'
  return {
    id: pickFirstString(response.id, response.recipient_id) ?? '',
    status,
    requestId,
    raw: {
      ...response,
      ...(kycDetails ? { kyc_details: kycDetails } : null),
      ...(requestId ? { request_id: requestId } : null),
    },
  }
}

function buildPagarMeCustomer(input: CreatePaymentRequest, opts?: { requirePhone?: boolean }) {
  const requirePhone = opts?.requirePhone === true
  const customerName = pickFirstString(input.customer?.name, input.customer?.email)
  const customerEmail = pickFirstString(input.customer?.email)
  const customerDocument = pickFirstString(input.customer?.document)?.replace(/\D+/g, '') ?? ''
  const customerPhones = parsePagarMeCustomerPhone(input.customer?.phone)

  if (!customerName || !customerEmail || !customerDocument || (requirePhone && !customerPhones)) {
    throw new PagarMeAdapterError({
      provider: 'pagarme',
      code: 'bad_request',
      status: 400,
      retryable: false,
      message: `Missing required customer data for Pagar.me ${input.method.toUpperCase()} payment.`,
      details: {
        customer_name_present: Boolean(customerName),
        customer_email_present: Boolean(customerEmail),
        customer_document_present: Boolean(customerDocument),
        customer_phone_present: Boolean(customerPhones),
      },
    })
  }

  return {
    name: customerName,
    email: customerEmail,
    type: customerDocument.length > 11 ? 'company' : 'individual',
    document: customerDocument,
    ...(customerPhones ? { phones: customerPhones } : null),
  }
}

function buildPagarMeCommonPaymentPayload(input: CreatePaymentRequest) {
  const amount = Math.round(Number(input.amount?.amount ?? 0))
  const currency = safeTrim(input.amount?.currency || 'BRL').toUpperCase()
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new PagarMeAdapterError({
      provider: 'pagarme',
      code: 'bad_request',
      status: 400,
      retryable: false,
      message: `Invalid amount for Pagar.me ${input.method.toUpperCase()} payment.`,
    })
  }
  if (currency !== 'BRL') {
    throw new PagarMeAdapterError({
      provider: 'pagarme',
      code: 'bad_request',
      status: 400,
      retryable: false,
      message: `Pagar.me ${input.method.toUpperCase()} only supports BRL.`,
    })
  }

  const metadata = Object.fromEntries(
    Object.entries(input.metadata ?? {}).filter(([, value]) => {
      const trimmed = safeTrim(value)
      return Boolean(trimmed)
    }),
  )

  const description = pickFirstString(input.description, 'Pagamento Connekt Pay') as string
  const split = buildPagarMePixSplit(input.split).filter((entry) => entry.amount > 0 && safeTrim(entry.recipient_id))

  return {
    amount,
    currency,
    metadata,
    description,
    split,
    code: pickFirstString(metadata.internal_transaction_id, metadata.internal_payment_link_id) ?? undefined,
  }
}

function buildPagarMePixPayload(input: CreatePaymentRequest) {
  if (input.method !== 'pix') {
    throw new PagarMeAdapterError({
      provider: 'pagarme',
      code: 'bad_request',
      status: 400,
      retryable: false,
      message: 'Invalid payment method for Pagar.me PIX payload.',
    })
  }

  const common = buildPagarMeCommonPaymentPayload(input)
  const expiresInSeconds = 15 * 60

  return {
    code: common.code,
    closed: true,
    items: [
      {
        amount: common.amount,
        quantity: 1,
        description: common.description,
        code: common.code,
      },
    ],
    customer: buildPagarMeCustomer(input, { requirePhone: true }),
    metadata: common.metadata,
    payments: [
      {
        payment_method: 'pix',
        pix: {
          expires_in: expiresInSeconds,
        },
        ...(common.split.length ? { split: common.split } : null),
      },
    ],
  }
}

function normalizeStatementDescriptor(value: unknown) {
  const normalized = safeTrim(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 ]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 13)
  return normalized || undefined
}

function buildPagarMeCardPayload(input: CreatePaymentRequest) {
  if (input.method !== 'card') {
    throw new PagarMeAdapterError({
      provider: 'pagarme',
      code: 'bad_request',
      status: 400,
      retryable: false,
      message: 'Invalid payment method for Pagar.me card payload.',
    })
  }

  const common = buildPagarMeCommonPaymentPayload(input)
  const cardId = pickFirstString(input.card?.cardId)
  const cardToken = pickFirstString(input.card?.token)
  if (!cardId && !cardToken) {
    throw new PagarMeAdapterError({
      provider: 'pagarme',
      code: 'bad_request',
      status: 400,
      retryable: false,
      message: 'Missing card identifier for Pagar.me card payment.',
    })
  }

  const installments = Math.max(1, Math.min(12, Math.round(Number(input.installments ?? 1) || 1)))
  const operationType = safeTrim(input.metadata?.operation_type).toLowerCase() === 'auth_only' ? 'auth_only' : 'auth_and_capture'
  const statementDescriptor = normalizeStatementDescriptor(input.metadata?.statement_descriptor)
  const recurrenceCycle = safeTrim(input.card?.recurrenceCycle).toLowerCase()
  const paymentOriginChargeId = pickFirstString(input.card?.paymentOriginChargeId)
  const paymentOriginBrandId = pickFirstString(input.card?.paymentOriginBrandId)

  return {
    code: common.code,
    closed: true,
    items: [
      {
        amount: common.amount,
        quantity: 1,
        description: common.description,
        code: common.code,
      },
    ],
    ...(input.customerId ? { customer_id: input.customerId } : { customer: buildPagarMeCustomer(input, { requirePhone: true }) }),
    metadata: common.metadata,
    payments: [
      {
        payment_method: 'credit_card',
        credit_card: {
          operation_type: operationType,
          installments,
          ...(cardId ? { card_id: cardId } : { card_token: cardToken }),
          ...((recurrenceCycle === 'first' || recurrenceCycle === 'subsequent') ? { recurrence_cycle: recurrenceCycle } : null),
          ...(paymentOriginChargeId || paymentOriginBrandId
            ? {
                payment_origin: {
                  ...(paymentOriginChargeId ? { charge_id: paymentOriginChargeId } : null),
                  ...(paymentOriginBrandId ? { brand_id: paymentOriginBrandId } : null),
                },
              }
            : null),
          ...(statementDescriptor ? { statement_descriptor: statementDescriptor } : null),
        },
        ...(common.split.length ? { split: common.split } : null),
      },
    ],
  }
}

function normalizePagarMePaymentResponse(response: Record<string, unknown>): PaymentResponse {
  const charge = pickFirstObject(
    Array.isArray(response.charges) ? response.charges[0] : null,
    response,
  )
  const lastTransaction = pickFirstObject(charge?.last_transaction, response.last_transaction)
  const providerOrderId = pickFirstString(response.id)
  const providerChargeId = pickFirstString(charge?.id, response.charge_id, response.id)
  const providerReference = pickFirstString(lastTransaction?.id, charge?.id, response.id)
  const status = normalizePagarMePaymentStatus(lastTransaction?.status ?? charge?.status ?? response.status)
  const qrCode = pickFirstString(lastTransaction?.qr_code)
  const qrCodeUrl = pickFirstString(lastTransaction?.qr_code_url)
  const copyPaste = pickFirstString(lastTransaction?.qr_code, lastTransaction?.copy_paste)
  const expiresAt = pickFirstString(lastTransaction?.expires_at)
  const createdAt = pickFirstString(lastTransaction?.created_at, charge?.created_at, response.created_at)
  const amount = Number(charge?.amount ?? response.amount ?? 0)
  const currency = safeTrim(charge?.currency ?? response.currency ?? 'BRL').toUpperCase()

  if (!providerReference || !providerOrderId || !providerChargeId) {
    throw new PagarMeAdapterError({
      provider: 'pagarme',
      code: 'unexpected_response',
      status: 502,
      retryable: false,
      message: 'Pagar.me PIX response is missing provider identifiers.',
      details: {
        order_id_present: Boolean(providerOrderId),
        charge_id_present: Boolean(providerChargeId),
        provider_reference_present: Boolean(providerReference),
      },
    })
  }

  return {
    id: providerReference,
    status,
    providerPaymentId: providerReference,
    providerReference,
    providerOrderId,
    providerChargeId,
    amount: Number.isFinite(amount) && amount > 0 ? Math.round(amount) : undefined,
    currency: currency === 'BRL' ? 'BRL' : undefined,
    createdAt: createdAt ?? undefined,
    pix:
      qrCode || qrCodeUrl || expiresAt
        ? {
            qrCode: qrCode ?? undefined,
            qrCodeUrl: qrCodeUrl ?? undefined,
            copyPaste: copyPaste ?? undefined,
            expiresAt: expiresAt ?? undefined,
          }
        : undefined,
    raw: {
      id: providerOrderId,
      status: pickFirstString(response.status),
      amount: Number.isFinite(amount) ? Math.round(amount) : null,
      currency: currency || null,
      created_at: createdAt,
      charges:
        charge && providerChargeId
          ? [
              {
                id: providerChargeId,
                status: pickFirstString(charge.status),
                amount: Number.isFinite(Number(charge.amount ?? 0)) ? Math.round(Number(charge.amount ?? 0)) : null,
                currency: pickFirstString(charge.currency),
                payment_method: pickFirstString(charge.payment_method),
                last_transaction: lastTransaction
                  ? {
                      id: providerReference,
                      status: pickFirstString(lastTransaction.status),
                      qr_code: qrCode,
                      qr_code_url: qrCodeUrl,
                      expires_at: expiresAt,
                      created_at: pickFirstString(lastTransaction.created_at),
                    }
                  : null,
              },
            ]
          : [],
      metadata: ensureStringRecord(response.metadata),
    },
  }
}

function retryableForStatus(status: number) {
  return status === 408 || status === 409 || status === 429 || status >= 500
}

export class PagarMeProvider implements AcquirerProvider {
  private readonly baseUrl: string
  private readonly secretKey: string
  private readonly fetcher: Fetcher
  private readonly timeoutMs: number
  private readonly authorizationValue: string

  constructor(opts: { baseUrl: string; secretKey: string; fetcher?: Fetcher; timeoutMs?: number }) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '')
    this.secretKey = opts.secretKey
    this.fetcher = opts.fetcher ?? fetch
    this.timeoutMs = typeof opts.timeoutMs === 'number' && opts.timeoutMs > 0 ? Math.round(opts.timeoutMs) : 30_000
    this.authorizationValue = `Basic ${Buffer.from(`${this.secretKey}:`).toString('base64')}`
  }

  private async requestJson<T>(input: {
    path: string
    method: 'GET' | 'POST'
    query?: Record<string, string | number | null | undefined>
    body?: unknown
    headers?: Record<string, string | null | undefined>
  }) {
    const url = new URL(`${this.baseUrl}${input.path}`)
    for (const [key, value] of Object.entries(input.query ?? {})) {
      if (value == null || value === '') continue
      url.searchParams.set(key, String(value))
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await this.fetcher(url, {
        method: input.method,
        signal: controller.signal,
        headers: {
          accept: 'application/json',
          authorization: this.authorizationValue,
          'user-agent': 'connektpay/1.0',
          ...Object.fromEntries(Object.entries(input.headers ?? {}).filter(([, value]) => Boolean(value))),
          ...(input.body ? { 'content-type': 'application/json' } : null),
        },
        body: input.body ? JSON.stringify(input.body) : undefined,
      })

      const contentType = response.headers.get('content-type') ?? ''
      const requestId = response.headers.get('request-id') ?? response.headers.get('x-request-id') ?? null
      const isJson = contentType.toLowerCase().includes('application/json')
      const payloadText = isJson ? '' : await response.text().catch(() => '')
      const payloadJson = isJson ? await response.json().catch(() => null) : null

      if (!response.ok) {
        const status = response.status
        const code =
          status === 400
            ? 'bad_request'
            : status === 401 || status === 403
              ? 'invalid_credentials'
              : status === 404
                ? 'not_found'
                : status === 409
                  ? 'conflict'
                  : status === 422
                    ? 'unprocessable'
                    : status === 429
                      ? 'rate_limited'
                      : status >= 500
                        ? 'unavailable'
                        : 'unexpected_response'

        throw new PagarMeAdapterError({
          provider: 'pagarme',
          code,
          status,
          retryable: retryableForStatus(status),
          message:
            typeof (payloadJson as Record<string, unknown> | null)?.message === 'string'
              ? String((payloadJson as Record<string, unknown>).message)
              : `Pagar.me request failed (${status})`,
          details:
            payloadJson && typeof payloadJson === 'object'
              ? { request_id: requestId, response: payloadJson }
              : { request_id: requestId, response: payloadText },
        })
      }

      if (!isJson) {
        throw new PagarMeAdapterError({
          provider: 'pagarme',
          code: 'unexpected_response',
          status: 502,
          retryable: false,
          message: 'Pagar.me returned a non-JSON response.',
          details: payloadText,
        })
      }

      if (payloadJson && typeof payloadJson === 'object' && requestId && typeof (payloadJson as Record<string, unknown>).request_id === 'undefined') {
        return { ...(payloadJson as Record<string, unknown>), request_id: requestId } as T
      }

      return payloadJson as T
    } catch (error) {
      if (error instanceof PagarMeAdapterError) throw error
      const message = error instanceof Error ? error.message : 'Error'
      if (message.toLowerCase().includes('abort')) {
        throw new PagarMeAdapterError({
          provider: 'pagarme',
          code: 'timeout',
          status: 504,
          retryable: true,
          message: 'Pagar.me timeout.',
        })
      }
      throw new PagarMeAdapterError({
        provider: 'pagarme',
        code: 'network_error',
        status: 503,
        retryable: true,
        message: 'Pagar.me network error.',
      })
    } finally {
      clearTimeout(timeout)
    }
  }

  private notImplemented(operation: string): never {
    throw new PagarMeAdapterError({
      provider: 'pagarme',
      code: 'NOT_IMPLEMENTED',
      status: 501,
      retryable: false,
      message: `${operation} is not implemented for Pagar.me in this phase.`,
    })
  }

  async authenticate(): Promise<{ ok: true; accountId?: string; environment?: string }> {
    await this.requestJson<Record<string, unknown> | Array<Record<string, unknown>>>({
      path: '/paymentlinks',
      method: 'GET',
      query: { page: 1, size: 1 },
    })

    return {
      ok: true,
      environment: this.secretKey.startsWith('sk_test_') ? 'sandbox' : 'production',
    }
  }

  async createRecipient(input: Parameters<NonNullable<AcquirerProvider['createRecipient']>>[0]): Promise<{ id: string; status: string; requestId?: string | null; raw?: unknown }> {
    const payload = buildPagarMeRecipientPayload(input)
    const response = await this.requestJson<Record<string, unknown>>({
      path: '/recipients',
      method: 'POST',
      body: payload,
      headers: {
        'Idempotency-Key': pickFirstString(input.idempotencyKey, input.metadata?.internal_receiver_id, input.receiverId),
      },
    })
    return normalizePagarMeRecipientResponse(response)
  }

  async getRecipient(input: { providerReference: string }): Promise<{ id: string; status: string; requestId?: string | null; raw?: unknown }> {
    const providerReference = safeTrim(input.providerReference)
    if (!providerReference) {
      throw new PagarMeAdapterError({
        provider: 'pagarme',
        code: 'bad_request',
        status: 400,
        retryable: false,
        message: 'Missing recipient id.',
      })
    }

    const response = await this.requestJson<Record<string, unknown>>({
      path: `/recipients/${encodeURIComponent(providerReference)}`,
      method: 'GET',
    })
    return normalizePagarMeRecipientResponse(response)
  }

  async getKycStatus(input: { providerReference: string; receiverId?: string }): Promise<{ id: string; status: string; requestId?: string | null; raw?: unknown }> {
    return this.getRecipient({ providerReference: input.providerReference })
  }

  async createPaymentLink(input: CreatePaymentLinkRequest): Promise<PaymentLinkResponse> {
    const payload = createPagarMePaymentLinkPayload(input)
    const response = await this.requestJson<Record<string, unknown>>({
      path: '/paymentlinks',
      method: 'POST',
      body: payload,
    })
    return normalizePagarMePaymentLinkResponse(response)
  }

  async listPaymentLinks(input?: { limit?: number }): Promise<PaymentLinkResponse[]> {
    const size = typeof input?.limit === 'number' && input.limit > 0 ? Math.min(100, Math.round(input.limit)) : 50
    const response = await this.requestJson<
      Record<string, unknown> | Array<Record<string, unknown>> | { data?: Array<Record<string, unknown>> }
    >({
      path: '/paymentlinks',
      method: 'GET',
      query: { page: 1, size },
    })

    const rawItems = Array.isArray(response)
      ? response
      : Array.isArray((response as { data?: unknown }).data)
        ? ((response as { data?: Array<Record<string, unknown>> }).data ?? [])
        : []

    return rawItems.map((item) => normalizePagarMePaymentLinkResponse(item))
  }

  async getPaymentLink(input: { paymentLinkId: string }): Promise<PaymentLinkResponse> {
    const paymentLinkId = String(input.paymentLinkId ?? '').trim()
    if (!paymentLinkId) {
      throw new PagarMeAdapterError({
        provider: 'pagarme',
        code: 'bad_request',
        status: 400,
        retryable: false,
        message: 'Missing payment link id.',
      })
    }

    const response = await this.requestJson<Record<string, unknown>>({
      path: `/paymentlinks/${encodeURIComponent(paymentLinkId)}`,
      method: 'GET',
    })
    return normalizePagarMePaymentLinkResponse(response)
  }

  async getPaymentLinkCharges(_input: { paymentLinkId: string; limit?: number }): Promise<PaymentLinkCharge[]> {
    this.notImplemented('getPaymentLinkCharges')
  }

  async createPayment(_input: CreatePaymentRequest): Promise<PaymentResponse> {
    const payload = _input.method === 'card' ? buildPagarMeCardPayload(_input) : buildPagarMePixPayload(_input)
    const response = await this.requestJson<Record<string, unknown>>({
      path: '/orders',
      method: 'POST',
      body: payload,
      headers: {
        'Idempotency-Key': pickFirstString(_input.metadata?.idempotency_key, _input.metadata?.internal_transaction_id),
      },
    })
    return normalizePagarMePaymentResponse(response)
  }

  async tokenizeCard(_input: TokenizeCardRequest): Promise<TokenizeCardResponse> {
    this.notImplemented('tokenizeCard')
  }

  async submitKyc(input: Parameters<NonNullable<AcquirerProvider['submitKyc']>>[0]): Promise<{ id: string; status: string; requestId?: string | null; raw?: unknown }> {
    const providerReference = safeTrim(input.metadata?.provider_receiver_id ?? input.metadata?.provider_reference ?? input.receiverId)
    if (!providerReference) {
      throw new PagarMeAdapterError({
        provider: 'pagarme',
        code: 'bad_request',
        status: 400,
        retryable: false,
        message: 'Missing recipient id for KYC.',
      })
    }

    const response = await this.requestJson<Record<string, unknown>>({
      path: `/recipients/${encodeURIComponent(providerReference)}/kyc_link`,
      method: 'POST',
      body: {},
      headers: {
        'Idempotency-Key': pickFirstString(input.idempotencyKey, input.metadata?.internal_receiver_id, input.receiverId),
      },
    })

    return {
      id: providerReference,
      status: 'pending',
      requestId: pickFirstString((response as Record<string, unknown>).request_id),
      raw: response,
    }
  }

  async createSubscription(_input: CreateSubscriptionRequest): Promise<CreateSubscriptionResponse> {
    this.notImplemented('createSubscription')
  }

  async cancelSubscription(_input: CancelSubscriptionRequest): Promise<CancelSubscriptionResponse> {
    this.notImplemented('cancelSubscription')
  }

  async anticipate(_input: AnticipateRequest): Promise<AnticipateResponse> {
    this.notImplemented('anticipate')
  }

  async listTransactions(_input: ListTransactionsRequest): Promise<ListTransactionsResponse> {
    this.notImplemented('listTransactions')
  }

  async getTransaction(_input: GetTransactionRequest): Promise<GetTransactionResponse> {
    this.notImplemented('getTransaction')
  }

  async listPayouts(_input: ListPayoutsRequest): Promise<ListPayoutsResponse> {
    this.notImplemented('listPayouts')
  }

  async getPayout(_input: GetPayoutRequest): Promise<GetPayoutResponse> {
    this.notImplemented('getPayout')
  }

  async listAnticipations(_input: ListAnticipationsRequest): Promise<ListAnticipationsResponse> {
    this.notImplemented('listAnticipations')
  }

  async getAnticipation(_input: GetAnticipationRequest): Promise<GetAnticipationResponse> {
    this.notImplemented('getAnticipation')
  }

  async cancelAnticipation(_input: CancelAnticipationRequest): Promise<CancelAnticipationResponse> {
    this.notImplemented('cancelAnticipation')
  }

  async createPayout(_input: {
    receiverId: string
    amount: { amount: number; currency: 'BRL' }
    metadata?: Record<string, string>
  }): Promise<{ id: string; status: string }> {
    this.notImplemented('createPayout')
  }
}

export function sanitizePagarMeProviderPayload(payload: unknown) {
  if (!payload || typeof payload !== 'object') return payload
  return sanitizePagarMePaymentLinkResponse(payload as Record<string, unknown>)
}

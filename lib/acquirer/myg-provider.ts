import type { AcquirerProvider } from '@/lib/acquirer/provider'
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
  GetPayoutRequest,
  GetPayoutResponse,
  GetAnticipationRequest,
  GetAnticipationResponse,
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
import crypto from 'crypto'

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export class MyGatewayError extends Error {
  readonly status: number
  readonly code:
    | 'invalid_credentials'
    | 'timeout'
    | 'rate_limited'
    | 'unavailable'
    | 'unexpected_response'
    | 'network_error'
    | 'bad_request'

  readonly details?: unknown

  constructor(input: { message: string; status: number; code: MyGatewayError['code']; details?: unknown }) {
    super(input.message)
    this.status = input.status
    this.code = input.code
    this.details = input.details
  }
}

export class MygProvider implements AcquirerProvider {
  private readonly baseUrl: string
  private readonly xApiKey: string
  private readonly authData: string
  private readonly fetcher: Fetcher
  private readonly timeoutMs: number
  private authToken: { token: string; expiresAtMs?: number } | null
  private authTokenPromise: Promise<string> | null

  constructor(opts: { baseUrl: string; xApiKey: string; authData: string; fetcher?: Fetcher; timeoutMs?: number }) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '')
    this.xApiKey = opts.xApiKey
    this.authData = opts.authData
    this.fetcher = opts.fetcher ?? fetch
    this.timeoutMs = typeof opts.timeoutMs === 'number' && opts.timeoutMs > 0 ? Math.round(opts.timeoutMs) : 30_000
    this.authToken = null
    this.authTokenPromise = null
  }

  private getAuthHeaderName() {
    const raw = process.env.MYGATEWAY_AUTH_HEADER
    const name = typeof raw === 'string' && raw.trim() ? raw.trim() : 'Authorization'
    return name
  }

  private authHeaders(token: string) {
    const headerName = this.getAuthHeaderName()
    return { [headerName]: token } as Record<string, string>
  }

  private async requestJson<T>(input: {
    path: string
    method: 'GET' | 'POST'
    body?: unknown
    timeoutMs?: number
    headers?: Record<string, string | undefined>
  }) {
    const controller = new AbortController()
    const timeoutMs = typeof input.timeoutMs === 'number' && input.timeoutMs > 0 ? Math.round(input.timeoutMs) : this.timeoutMs
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await this.fetcher(`${this.baseUrl}${input.path}`, {
        method: input.method,
        signal: controller.signal,
        headers: {
          'x-api-key': this.xApiKey,
          ...(input.body ? { 'content-type': 'application/json' } : null),
          ...(input.headers ?? null),
        },
        body: input.body ? JSON.stringify(input.body) : undefined,
      })

      const contentType = res.headers.get('content-type') ?? ''
      const isJson = contentType.toLowerCase().includes('application/json')
      const payloadText = isJson ? '' : await res.text().catch(() => '')
      const payloadJson = isJson ? await res.json().catch(() => null) : null

      if (!res.ok) {
        const details = isJson ? payloadJson : payloadText
        const status = res.status
        const code: MyGatewayError['code'] =
          status === 400
            ? 'bad_request'
            : status === 401 || status === 403
              ? 'invalid_credentials'
              : status === 408
                ? 'timeout'
                : status === 429
                  ? 'rate_limited'
                  : status >= 500
                    ? 'unavailable'
                    : 'unexpected_response'

        throw new MyGatewayError({
          message: typeof (payloadJson as any)?.message === 'string' ? (payloadJson as any).message : `MyGateway request failed (${status})`,
          status,
          code,
          details,
        })
      }

      if (!isJson) {
        throw new MyGatewayError({
          message: 'MyGateway unexpected response',
          status: 502,
          code: 'unexpected_response',
          details: payloadText,
        })
      }

      return payloadJson as T
    } catch (e) {
      if (e instanceof MyGatewayError) throw e
      const msg = e instanceof Error ? e.message : 'Error'
      const aborted = msg.toLowerCase().includes('abort') || msg.toLowerCase().includes('aborted')
      if (aborted) {
        throw new MyGatewayError({ message: 'MyGateway timeout', status: 504, code: 'timeout' })
      }
      throw new MyGatewayError({ message: 'MyGateway network error', status: 503, code: 'network_error' })
    } finally {
      clearTimeout(timeout)
    }
  }

  async authenticate(): Promise<{ ok: true; accountId?: string; environment?: string }> {
    const payload = await this.requestJson<{ auth_token?: string; expires_in?: string | number }>({
      path: '/authentication/v2/auth',
      method: 'POST',
      body: {
        authData: this.authData,
      },
    })

    const token = typeof payload?.auth_token === 'string' ? payload.auth_token.trim() : ''
    if (!token) {
      throw new MyGatewayError({ message: 'MyGateway unexpected response', status: 502, code: 'unexpected_response', details: payload })
    }

    const expires = payload?.expires_in
    const expiresAtMs =
      typeof expires === 'number'
        ? Date.now() + Math.max(0, Math.round(expires * 1000))
        : typeof expires === 'string'
          ? /^\d+$/.test(expires.trim())
            ? Date.now() + Math.max(0, Math.round(Number(expires.trim()) * 1000))
            : Number.isFinite(Date.parse(expires))
              ? Date.parse(expires)
              : undefined
          : undefined

    this.authToken = { token, ...(typeof expiresAtMs === 'number' ? { expiresAtMs } : null) }
    return { ok: true } as const
  }

  private authTokenValid() {
    if (!this.authToken?.token) return false
    if (typeof this.authToken.expiresAtMs !== 'number') return true
    return this.authToken.expiresAtMs - Date.now() > 60_000
  }

  private async getAuthToken() {
    if (this.authTokenValid() && this.authToken?.token) return this.authToken.token

    if (this.authTokenPromise) return this.authTokenPromise

    this.authTokenPromise = (async () => {
      await this.authenticate()
      if (!this.authToken?.token) throw new MyGatewayError({ message: 'MyGateway invalid credentials', status: 401, code: 'invalid_credentials' })
      return this.authToken.token
    })()

    try {
      return await this.authTokenPromise
    } finally {
      this.authTokenPromise = null
    }
  }

  private normalizeSituationToStatus(input: unknown): PaymentResponse['status'] {
    const raw = String(input ?? '').trim()
    const upper = raw.toUpperCase()
    if (upper === 'PAID' || raw === '99999') return 'paid'
    if (upper === 'REVERSED' || upper === 'PARTIALREVERSED') return 'refunded'
    if (upper === 'CANCELED' || upper === 'CANCELLED') return 'canceled'
    if (upper === 'PROCESSING' || upper === 'IN_PROGRESS') return 'processing'
    if (upper === 'PENDING' || upper === 'WAITING_PAYMENT' || upper === 'WAITING') return 'pending'
    if (upper === 'UNPAID' || upper === 'FAIL' || upper === 'REPROVED' || upper === 'CHARGEBACK') return 'failed'
    if (upper === 'NEW') return 'created'
    return 'pending'
  }

  async createPaymentLink(input: CreatePaymentLinkRequest): Promise<PaymentLinkResponse> {
    const token = await this.getAuthToken()
    const cents = typeof input.amount?.amount === 'number' && Number.isInteger(input.amount.amount) ? input.amount.amount : NaN
    if (!Number.isFinite(cents) || cents <= 0) throw new MyGatewayError({ message: 'Invalid value', status: 400, code: 'bad_request' })
    const value = String(Math.round(cents))
    if (!/^\d+$/.test(value)) throw new MyGatewayError({ message: 'Invalid value', status: 400, code: 'bad_request' })

    const title = String(input.name ?? '').trim()
    if (!title) throw new MyGatewayError({ message: 'Missing title', status: 400, code: 'bad_request' })
    if (title.length > 120) throw new MyGatewayError({ message: 'Title too long', status: 400, code: 'bad_request' })

    const descriptionRaw = input.description ?? ''
    const description = String(descriptionRaw ?? '')
      .replace(/[\u0000-\u001F\u007F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (description.length > 2000) throw new MyGatewayError({ message: 'Description too long', status: 400, code: 'bad_request' })

    const minInstallments = typeof input.minimumNumberOfInstallments === 'number' ? Math.round(input.minimumNumberOfInstallments) : 1
    const maxInstallments =
      typeof input.maximumQuantityOfInstallments === 'number'
        ? Math.round(input.maximumQuantityOfInstallments)
        : typeof input.methods?.card === 'boolean' && input.methods.card
          ? 18
          : 1
    if (minInstallments < 1 || minInstallments > 18) throw new MyGatewayError({ message: 'Invalid installments', status: 400, code: 'bad_request' })
    if (maxInstallments < 1 || maxInstallments > 18) throw new MyGatewayError({ message: 'Invalid installments', status: 400, code: 'bad_request' })
    if (maxInstallments < minInstallments) throw new MyGatewayError({ message: 'Invalid installments', status: 400, code: 'bad_request' })

    const numberOfAllowedSales = typeof input.numberOfAllowedSales === 'number' ? Math.round(input.numberOfAllowedSales) : 1
    if (numberOfAllowedSales <= 0) throw new MyGatewayError({ message: 'Invalid numberOfAllowedSales', status: 400, code: 'bad_request' })

    const allowedTypes = new Set(['PIX', 'Credit', 'Billet'])
    const requestedTypes =
      Array.isArray(input.acceptedPaymentsType) && input.acceptedPaymentsType.length
        ? input.acceptedPaymentsType.map((t) => String(t))
        : [
            ...(input.methods?.pix !== false ? (['PIX'] as const) : []),
            ...(input.methods?.card !== false ? (['Credit'] as const) : []),
          ]
    const acceptedPaymentsType = requestedTypes.filter((t) => allowedTypes.has(t))
    if (!acceptedPaymentsType.length) throw new MyGatewayError({ message: 'Invalid acceptedPaymentsType', status: 400, code: 'bad_request' })

    const showFormAddress = input.showFormAddress === 1 ? 1 : 0
    const customerInterest = input.customerInterest === 1 ? 1 : 0

    const now = new Date()
    const providedValidity = typeof input.validity === 'string' && input.validity.trim() ? input.validity.trim() : null
    const validity = providedValidity ?? this.formatValidity(addDays(now, 7))
    if (!this.validityLooksValid(validity)) throw new MyGatewayError({ message: 'Invalid validity', status: 400, code: 'bad_request' })
    if (!this.validityIsFuture(validity)) throw new MyGatewayError({ message: 'Validity must be in the future', status: 400, code: 'bad_request' })

    const payload = await this.requestJson<any>({
      path: '/payments/v1/paymentlink',
      method: 'POST',
      headers: {
        ...this.authHeaders(token),
      },
      body: {
        value,
        title,
        description,
        validity,
        minimumNumberOfInstallments: minInstallments,
        maximumQuantityOfInstallments: maxInstallments,
        numberOfAllowedSales,
        showFormAddress,
        customerInterest,
        acceptedPaymentsType,
      },
    })

    const id = String(payload?.id ?? payload?.data?.id ?? '').trim()
    const link = typeof payload?.link === 'string' ? payload.link : typeof payload?.data?.link === 'string' ? payload.data.link : null
    if (!id) throw new MyGatewayError({ message: 'MyGateway unexpected response', status: 502, code: 'unexpected_response', details: payload })
    return {
      id,
      status: 'created',
      url: link,
      metadata: { raw: payload },
    }
  }

  async listPaymentLinks(input?: { limit?: number }): Promise<PaymentLinkResponse[]> {
    const token = await this.getAuthToken()
    const payload = await this.requestJson<any>({
      path: '/payments/v1/paymentlink',
      method: 'GET',
      headers: {
        ...this.authHeaders(token),
      },
    })

    const listRaw = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.items) ? payload.items : []
    const limit = typeof input?.limit === 'number' && input.limit > 0 ? Math.round(input.limit) : null
    const normalized = listRaw
      .map((row: any) => {
        const id = typeof row?.id === 'string' ? row.id : typeof row?.paymentLinkId === 'string' ? row.paymentLinkId : null
        if (!id) return null
        const url = typeof row?.link === 'string' ? row.link : typeof row?.url === 'string' ? row.url : null
        const status = typeof row?.status === 'string' ? row.status : 'unknown'
        return { id: String(id), status: String(status), url, metadata: { raw: row } } satisfies PaymentLinkResponse
      })
      .filter(Boolean) as PaymentLinkResponse[]
    return limit ? normalized.slice(0, limit) : normalized
  }

  async getPaymentLink(input: { paymentLinkId: string }): Promise<PaymentLinkResponse> {
    const token = await this.getAuthToken()
    const payload = await this.requestJson<any>({
      path: `/payments/v1/paymentlink/${encodeURIComponent(input.paymentLinkId)}`,
      method: 'GET',
      headers: {
        ...this.authHeaders(token),
      },
    })

    return {
      id: input.paymentLinkId,
      status: typeof payload?.status === 'string' ? payload.status : typeof payload?.data?.status === 'string' ? payload.data.status : 'unknown',
      url: typeof payload?.link === 'string' ? payload.link : typeof payload?.data?.link === 'string' ? payload.data.link : null,
      metadata: { raw: payload },
    }
  }

  async getPaymentLinkCharges(input: { paymentLinkId: string; limit?: number }): Promise<PaymentLinkCharge[]> {
    void input.limit
    const link = await this.getPaymentLink({ paymentLinkId: input.paymentLinkId })
    return [
      {
        id: link.id,
        status: link.status,
        amount: { amount: 0, currency: 'BRL' },
        raw: link.metadata?.raw,
      },
    ]
  }

  async createPayment(input: CreatePaymentRequest): Promise<PaymentResponse> {
    const token = await this.getAuthToken()
    const clientChargeId = crypto.randomUUID()
    const itemId = crypto.randomUUID()
    const description = input.description ?? 'Pagamento'
    const amount = input.amount.amount

    const splitReceivers =
      Array.isArray(input.split) && input.split.length
        ? input.split
            .map((r) => ({
              receiverId: String(r.receiverId),
              amount: typeof r.amount === 'number' && Number.isInteger(r.amount) && r.amount > 0 ? Math.round(r.amount) : null,
            }))
            .filter((r) => typeof r.amount === 'number')
        : null

    if (input.method === 'pix') {
      const payload = await this.requestJson<any>({
        path: '/payments/v1/create',
        method: 'POST',
        headers: {
          ...this.authHeaders(token),
        },
        body: {
          paymentType: 2,
          pix: {
            clientChargeId,
            value: amount,
            description,
            customer: input.customer ?? undefined,
            items: [{ id: itemId, name: description, value: amount, amount: 1 }],
            ...(typeof input.connektFeeAmount === 'number' && Number.isInteger(input.connektFeeAmount) && input.connektFeeAmount > 0
              ? { connektFeeAmount: Math.round(input.connektFeeAmount) }
              : null),
            ...(splitReceivers && splitReceivers.length ? { split: { receivers: splitReceivers } } : null),
          },
        },
      })

      const paymentId = String(payload?.data?.paymentId ?? '').trim()
      if (!paymentId) throw new MyGatewayError({ message: 'MyGateway unexpected response', status: 502, code: 'unexpected_response', details: payload })

      return {
        id: paymentId,
        providerPaymentId: paymentId,
        status: this.normalizeSituationToStatus(payload?.data?.status ?? payload?.data?.situation ?? 'New'),
        pix: {
          qrCode: typeof payload?.data?.qrCode === 'string' ? payload.data.qrCode : undefined,
          copyPaste: typeof payload?.data?.qrCode === 'string' ? payload.data.qrCode : undefined,
          expiresAt: typeof payload?.data?.dueDate === 'string' ? payload.data.dueDate : undefined,
        },
      }
    }

    const card = input.card
    if (!card) throw new MyGatewayError({ message: 'Missing card data', status: 400, code: 'bad_request' })

    const transactionId = (input.metadata?.transaction_id ?? crypto.randomUUID()).toString()
    const cardNumber = typeof card.number === 'string' ? card.number.trim() : ''
    const numberToken =
      typeof card.token === 'string' && card.token.trim()
        ? card.token.trim()
        : cardNumber
          ? (await this.tokenizeCard({ cardNumber: cardNumber.replace(/[^\d]/g, ''), transactionId })).cardTokenRef
          : ''

    if (!numberToken) throw new MyGatewayError({ message: 'Missing card token', status: 400, code: 'bad_request' })

    const payload = await this.requestJson<any>({
      path: '/payments/v1/create',
      method: 'POST',
      headers: {
        ...this.authHeaders(token),
      },
      body: {
        paymentType: 3,
        creditCard: {
          clientChargeId,
          payment: {
            value: amount,
            installments: typeof input.installments === 'number' && input.installments > 1 ? Math.round(input.installments) : 1,
          },
          cardInfo: {
            numberToken,
            cardHolderName: card.holderName,
            securityCode: card.cvv,
            expirationMonth: card.expMonth ? Number(card.expMonth) : undefined,
            expirationYear: card.expYear ? Number(card.expYear) : undefined,
          },
          sellerInfo: {
            softDescriptor: description.slice(0, 22),
          },
          customer: input.customer ?? undefined,
          items: [{ id: itemId, name: description, value: amount, amount: 1 }],
          ...(typeof input.connektFeeAmount === 'number' && Number.isInteger(input.connektFeeAmount) && input.connektFeeAmount > 0
            ? { connektFeeAmount: Math.round(input.connektFeeAmount) }
            : null),
          ...(splitReceivers && splitReceivers.length ? { split: { receivers: splitReceivers } } : null),
        },
      },
    })

    const paymentId = String(payload?.data?.paymentId ?? '').trim()
    if (!paymentId) throw new MyGatewayError({ message: 'MyGateway unexpected response', status: 502, code: 'unexpected_response', details: payload })

    return {
      id: paymentId,
      providerPaymentId: paymentId,
      status: this.normalizeSituationToStatus(payload?.data?.status ?? payload?.data?.situation ?? 'New'),
    }
  }

  async tokenizeCard(input: TokenizeCardRequest): Promise<TokenizeCardResponse> {
    const token = await this.getAuthToken()
    const payload = await this.requestJson<any>({
      path: '/payments/v1/creditcard/generate/token',
      method: 'POST',
      headers: {
        ...this.authHeaders(token),
      },
      body: {
        cardNumber: input.cardNumber.replace(/[^\d]/g, ''),
        transactionId: input.transactionId,
      },
    })
    const t = String(payload?.data?.numberToken ?? '').trim()
    if (!t) {
      throw new MyGatewayError({
        message: 'MyGateway unexpected response',
        status: 502,
        code: 'unexpected_response',
        details: payload,
      })
    }
    return { cardTokenRef: t, raw: payload }
  }

  async createSubscription(input: CreateSubscriptionRequest): Promise<CreateSubscriptionResponse> {
    const token = await this.getAuthToken()
    const payload = await this.requestJson<any>({
      path: '/subscriptions/v1/create',
      method: 'POST',
      headers: {
        ...this.authHeaders(token),
      },
      body: {
        externalId: input.externalId,
        amount: input.amountCents,
        cycle: input.cycle,
        trialDays: input.trialDays,
        receiverId: input.receiverId,
        payer: input.payer,
        card: input.card,
        split: input.split,
        metadata: input.metadata ?? {},
      },
    })

    const id = String(payload?.data?.subscriptionId ?? payload?.data?.id ?? payload?.subscriptionId ?? payload?.id ?? '').trim()
    if (!id) {
      throw new MyGatewayError({
        message: 'MyGateway unexpected response',
        status: 502,
        code: 'unexpected_response',
        details: payload,
      })
    }
    const st = String(payload?.data?.status ?? payload?.status ?? 'pending').toLowerCase()
    const status =
      st === 'active' || st === 'pending' || st === 'past_due' || st === 'canceled' || st === 'failed' ? (st as any) : ('pending' as const)
    const nextChargeAt =
      typeof payload?.data?.nextChargeAt === 'string'
        ? payload.data.nextChargeAt
        : typeof payload?.data?.next_charge_at === 'string'
          ? payload.data.next_charge_at
          : typeof payload?.nextChargeAt === 'string'
            ? payload.nextChargeAt
            : null

    return { id, status, nextChargeAt, raw: payload }
  }

  async cancelSubscription(input: CancelSubscriptionRequest): Promise<CancelSubscriptionResponse> {
    const token = await this.getAuthToken()
    const payload = await this.requestJson<any>({
      path: '/subscriptions/v1/cancel',
      method: 'POST',
      headers: {
        ...this.authHeaders(token),
      },
      body: {
        subscriptionId: input.id,
        metadata: input.metadata ?? {},
      },
    })
    return { ok: true, raw: payload }
  }

  async anticipate(input: AnticipateRequest): Promise<AnticipateResponse> {
    const token = await this.getAuthToken()
    const payload = await this.requestJson<any>({
      path: '/anticipations/v1/request',
      method: 'POST',
      headers: {
        ...this.authHeaders(token),
      },
      body: {
        externalId: input.externalId,
        amount: input.amountCents,
        feeBps: input.feeBps,
        receiverId: input.receiverId,
        metadata: input.metadata ?? {},
      },
    })
    const id = String(payload?.data?.anticipationId ?? payload?.data?.id ?? payload?.id ?? '').trim()
    if (!id) {
      throw new MyGatewayError({
        message: 'MyGateway unexpected response',
        status: 502,
        code: 'unexpected_response',
        details: payload,
      })
    }
    return {
      id,
      status: typeof payload?.data?.status === 'string' ? payload.data.status : typeof payload?.status === 'string' ? payload.status : null,
      providerReference: typeof payload?.data?.reference === 'string' ? payload.data.reference : null,
      raw: payload,
    }
  }

  async getAnticipation(input: GetAnticipationRequest): Promise<GetAnticipationResponse> {
    const token = await this.getAuthToken()
    const payload = await this.requestJson<any>({
      path: `/anticipations/v1/${encodeURIComponent(input.id)}`,
      method: 'GET',
      headers: {
        ...this.authHeaders(token),
      },
    })
    const id = String(payload?.data?.anticipationId ?? payload?.data?.id ?? payload?.id ?? input.id).trim()
    return {
      id,
      status: typeof payload?.data?.status === 'string' ? payload.data.status : typeof payload?.status === 'string' ? payload.status : null,
      raw: payload,
    }
  }

  async cancelAnticipation(input: CancelAnticipationRequest): Promise<CancelAnticipationResponse> {
    const token = await this.getAuthToken()
    const payload = await this.requestJson<any>({
      path: '/anticipations/v1/cancel',
      method: 'POST',
      headers: {
        ...this.authHeaders(token),
      },
      body: {
        anticipationId: input.id,
        metadata: input.metadata ?? {},
      },
    })
    return { ok: true, raw: payload }
  }

  async listTransactions(_input: ListTransactionsRequest): Promise<ListTransactionsResponse> {
    throw new MyGatewayError({
      message: 'MyGateway endpoint not available for listTransactions',
      status: 501,
      code: 'unexpected_response',
    })
  }

  async getTransaction(input: GetTransactionRequest): Promise<GetTransactionResponse> {
    const token = await this.getAuthToken()
    const payload = await this.requestJson<any>({
      path: `/payments/v1/situation/${encodeURIComponent(input.id)}`,
      method: 'GET',
      headers: {
        ...this.authHeaders(token),
      },
    })
    const status = payload?.situation ?? payload?.data?.situation ?? payload?.status ?? null
    const amount =
      typeof payload?.data?.amount?.amount === 'number'
        ? Number(payload.data.amount.amount)
        : typeof payload?.data?.value === 'number'
          ? Number(payload.data.value)
          : typeof payload?.amount?.amount === 'number'
            ? Number(payload.amount.amount)
            : null
    return {
      id: input.id,
      status: status != null ? this.normalizeSituationToStatus(status) : null,
      amountCents: amount != null ? Math.round(amount) : null,
      raw: payload,
    }
  }

  async listPayouts(_input: ListPayoutsRequest): Promise<ListPayoutsResponse> {
    throw new MyGatewayError({
      message: 'MyGateway endpoint not available for listPayouts',
      status: 501,
      code: 'unexpected_response',
    })
  }

  async getPayout(_input: GetPayoutRequest): Promise<GetPayoutResponse> {
    throw new MyGatewayError({
      message: 'MyGateway endpoint not available for getPayout',
      status: 501,
      code: 'unexpected_response',
    })
  }

  async listAnticipations(_input: ListAnticipationsRequest): Promise<ListAnticipationsResponse> {
    throw new MyGatewayError({
      message: 'MyGateway endpoint not available for listAnticipations',
      status: 501,
      code: 'unexpected_response',
    })
  }

  async submitKyc(_input: {
    receiverId: string
    personType: 'pf' | 'pj'
    document: string
    name: string
    legalName?: string | null
    email?: string | null
    phone?: string | null
    address?: Record<string, unknown> | null
    bankAccount?: Record<string, unknown> | null
    documents?: Array<{ docType: string; bucket: string; path: string; mimeType?: string | null; sizeBytes?: number | null }>
    metadata?: Record<string, string>
  }): Promise<{ id: string; status: string }> {
    throw new MyGatewayError({
      message: 'MyGateway endpoint not available for submitKyc',
      status: 501,
      code: 'unexpected_response',
    })
  }

  async createPayout(input: { receiverId: string; amount: { amount: number; currency: 'BRL' }; metadata?: Record<string, string> }) {
    const token = await this.getAuthToken()
    return await this.requestJson<{ id: string; status: string }>({
      path: '/payouts',
      method: 'POST',
      headers: { ...this.authHeaders(token) },
      body: input,
    })
  }

  private formatValidity(d: Date) {
    const yyyy = String(d.getFullYear())
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    const hh = String(d.getHours()).padStart(2, '0')
    const min = String(d.getMinutes()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd} ${hh}:${min}`
  }

  private validityLooksValid(input: string) {
    return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(input)
  }

  private validityIsFuture(input: string) {
    const [datePart, timePart] = input.split(' ')
    const [y, m, d] = datePart.split('-').map((v) => Number(v))
    const [hh, mm] = timePart.split(':').map((v) => Number(v))
    const ts = Date.UTC(y, m - 1, d, hh, mm, 0, 0)
    if (!Number.isFinite(ts)) return false
    return ts > Date.now()
  }
}

function addDays(d: Date, days: number) {
  const out = new Date(d.getTime())
  out.setDate(out.getDate() + days)
  return out
}

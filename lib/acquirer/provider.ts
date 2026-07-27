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

export interface AcquirerProvider {
  authenticate(): Promise<{ ok: true; accountId?: string; environment?: string }>

  createRecipient?(input: {
    receiverId: string
    personType: 'pf' | 'pj'
    document: string
    name: string
    legalName?: string | null
    tradeName?: string | null
    birthDate?: string | null
    legalResponsibleName?: string | null
    legalResponsibleDocument?: string | null
    email?: string | null
    phone?: string | null
    address?: Record<string, unknown> | null
    bankAccount?: Record<string, unknown> | null
    metadata?: Record<string, string>
    idempotencyKey?: string | null
  }): Promise<{ id: string; status: string; requestId?: string | null; raw?: unknown }>

  getRecipient?(input: { providerReference: string }): Promise<{ id: string; status: string; requestId?: string | null; raw?: unknown }>
  getKycStatus?(input: { providerReference: string; receiverId?: string }): Promise<{ id: string; status: string; requestId?: string | null; raw?: unknown }>

  createPaymentLink(input: CreatePaymentLinkRequest): Promise<PaymentLinkResponse>
  listPaymentLinks(input?: { limit?: number }): Promise<PaymentLinkResponse[]>
  getPaymentLink(input: { paymentLinkId: string }): Promise<PaymentLinkResponse>
  getPaymentLinkCharges(input: { paymentLinkId: string; limit?: number }): Promise<PaymentLinkCharge[]>

  createPayment(input: CreatePaymentRequest): Promise<PaymentResponse>
  tokenizeCard(input: TokenizeCardRequest): Promise<TokenizeCardResponse>
  createSubscription(input: CreateSubscriptionRequest): Promise<CreateSubscriptionResponse>
  cancelSubscription(input: CancelSubscriptionRequest): Promise<CancelSubscriptionResponse>
  anticipate(input: AnticipateRequest): Promise<AnticipateResponse>
  listTransactions(input: ListTransactionsRequest): Promise<ListTransactionsResponse>
  getTransaction(input: GetTransactionRequest): Promise<GetTransactionResponse>
  listPayouts(input: ListPayoutsRequest): Promise<ListPayoutsResponse>
  getPayout(input: GetPayoutRequest): Promise<GetPayoutResponse>
  listAnticipations(input: ListAnticipationsRequest): Promise<ListAnticipationsResponse>
  getAnticipation(input: GetAnticipationRequest): Promise<GetAnticipationResponse>
  cancelAnticipation(input: CancelAnticipationRequest): Promise<CancelAnticipationResponse>

  createPayout(input: {
    receiverId: string
    amount: { amount: number; currency: 'BRL' }
    metadata?: Record<string, string>
  }): Promise<{ id: string; status: string }>

  submitKyc?(input: {
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
    idempotencyKey?: string | null
  }): Promise<{ id: string; status: string; requestId?: string | null; raw?: unknown }>
}

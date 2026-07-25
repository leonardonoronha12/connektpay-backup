export type Money = { amount: number; currency: 'BRL' }

export type SplitRule = {
  receiverId: string
  amount?: number
  percentageBps?: number
}

export type CreatePaymentRequest = {
  amount: Money
  method: 'pix' | 'card'
  description?: string
  customer?: { name?: string; email?: string; document?: string; phone?: string | null }
  customerId?: string
  split?: SplitRule[]
  connektFeeAmount?: number
  metadata?: Record<string, string>
  installments?: number
  card?: {
    holderName?: string
    number?: string
    cardId?: string
    token?: string
    expMonth?: string
    expYear?: string
    cvv?: string
    brand?: string
    last4?: string
    recurrenceCycle?: 'first' | 'subsequent'
    paymentOriginChargeId?: string
    paymentOriginBrandId?: string
  }
}

export type PaymentStatus = 'created' | 'authorized' | 'pending' | 'processing' | 'paid' | 'failed' | 'canceled' | 'expired' | 'refunded'

export type PaymentPixData = {
  qrCode?: string
  qrCodeUrl?: string
  qrCodeBase64?: string
  copyPaste?: string
  expiresAt?: string
}

export type PaymentResponse = {
  id: string
  status: PaymentStatus
  providerPaymentId?: string
  providerReference?: string
  providerOrderId?: string
  providerChargeId?: string
  amount?: number
  currency?: 'BRL'
  createdAt?: string
  pix?: PaymentPixData
  raw?: unknown
}

export type PaymentLinkMethods = { pix?: boolean; card?: boolean }

export type CreatePaymentLinkRequest = {
  name: string
  description?: string | null
  amount: Money
  methods?: PaymentLinkMethods
  validity?: string | null
  minimumNumberOfInstallments?: number | null
  maximumQuantityOfInstallments?: number | null
  numberOfAllowedSales?: number | null
  showFormAddress?: 0 | 1 | null
  customerInterest?: 0 | 1 | null
  acceptedPaymentsType?: Array<'PIX' | 'Credit' | 'Billet'> | null
  metadata?: Record<string, string>
  split?: SplitRule[]
  connektFeeAmount?: number
}

export type PaymentLinkResponse = {
  id: string
  status: string
  url?: string | null
  metadata?: Record<string, unknown>
}

export type PaymentLinkCharge = {
  id: string
  status: string
  amount: Money
  createdAt?: string
  raw?: unknown
}

export type TokenizeCardRequest = {
  cardNumber: string
  transactionId: string
}

export type TokenizeCardResponse = {
  cardTokenRef: string
  raw?: unknown
}

export type CreateSubscriptionRequest = {
  externalId: string
  amountCents: number
  cycle: string
  trialDays: number
  receiverId: string
  payer: { name: string; email?: string | null; document?: string | null; phone?: string | null }
  card: { tokenRef: string; holderName: string; expMonth: string; expYear: string; cvv: string }
  split: { connektFeeAmount: number; receivers: Array<{ receiverId: string; amount: number }> }
  metadata?: Record<string, string>
}

export type CreateSubscriptionResponse = {
  id: string
  status: 'active' | 'pending' | 'past_due' | 'canceled' | 'failed'
  nextChargeAt?: string | null
  raw?: unknown
}

export type CancelSubscriptionRequest = { id: string; metadata?: Record<string, string> }
export type CancelSubscriptionResponse = { ok: true; raw?: unknown }

export type AnticipateRequest = {
  externalId: string
  amountCents: number
  feeBps: number
  receiverId: string | null
  metadata?: Record<string, string>
}

export type AnticipateResponse = {
  id: string
  status?: string | null
  providerReference?: string | null
  raw?: unknown
}

export type GetAnticipationRequest = { id: string }
export type GetAnticipationResponse = { id: string; status?: string | null; raw?: unknown }

export type CancelAnticipationRequest = { id: string; metadata?: Record<string, string> }
export type CancelAnticipationResponse = { ok: true; raw?: unknown }

export type ListTransactionsRequest = { periodStartIso: string; periodEndIso: string }
export type ListTransactionsResponse = { transactions: Array<{ id: string; status?: string | null; amountCents?: number | null; raw?: unknown }> }

export type GetTransactionRequest = { id: string }
export type GetTransactionResponse = { id: string; status?: string | null; amountCents?: number | null; raw?: unknown }

export type ListPayoutsRequest = { periodStartIso: string; periodEndIso: string }
export type ListPayoutsResponse = { payouts: Array<{ id: string; status?: string | null; amountCents?: number | null; raw?: unknown }> }

export type GetPayoutRequest = { id: string }
export type GetPayoutResponse = { id: string; status?: string | null; amountCents?: number | null; raw?: unknown }

export type ListAnticipationsRequest = { periodStartIso: string; periodEndIso: string }
export type ListAnticipationsResponse = { anticipations: Array<{ id: string; status?: string | null; amountCents?: number | null; raw?: unknown }> }

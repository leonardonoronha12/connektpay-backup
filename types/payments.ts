export type PaymentMethod = 'pix' | 'card' | 'boleto'

export type Money = {
  amount: number
  currency: 'BRL'
}

export type SplitRule = {
  receiverId: string
  amount?: number
  percentageBps?: number
}

export type CreatePaymentInput = {
  amount: Money
  method: PaymentMethod
  description?: string
  customer?: {
    name?: string
    email?: string
    document?: string
  }
  split?: SplitRule[]
  connektFeeAmount?: number
  metadata?: Record<string, string>
}

export type PaymentStatus = 'created' | 'authorized' | 'pending' | 'processing' | 'paid' | 'failed' | 'canceled' | 'refunded'

export type Payment = {
  id: string
  status: PaymentStatus
  providerPaymentId?: string
}

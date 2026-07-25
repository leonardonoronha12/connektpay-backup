import type { Money } from '@/types/payments'

export type BillingInterval = 'day' | 'week' | 'month' | 'year'

export type Plan = {
  id: string
  name: string
  amount: Money
  interval: BillingInterval
  intervalCount: number
}

export type SubscriptionStatus = 'active' | 'past_due' | 'canceled'

export type Subscription = {
  id: string
  customerId: string
  planId: string
  status: SubscriptionStatus
  nextChargeAt?: string
}


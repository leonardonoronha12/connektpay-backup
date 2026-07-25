import type { Plan, Subscription } from '@/types/subscriptions'

export async function createPlan(_plan: Omit<Plan, 'id'>): Promise<Plan> {
  const interval = _plan.interval
  const intervalCount = _plan.intervalCount ?? 1
  if (interval !== 'week' && interval !== 'month' && interval !== 'year') throw new Error('Unsupported interval')
  if (intervalCount !== 1) throw new Error('Unsupported intervalCount')

  const amountBRL = (_plan.amount.amount / 100).toFixed(2).replace('.', ',')
  const apiInterval = interval === 'week' ? 'weekly' : interval === 'month' ? 'monthly' : 'yearly'

  const res = await fetch('/api/payment-links', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: _plan.name,
      description: null,
      amountBRL,
      type: 'recurring',
      interval: apiInterval,
      pix: false,
      card: true,
      maxInstallments: 1,
    }),
  })
  const json = (await res.json().catch(() => null)) as any
  if (!res.ok) throw new Error(json?.error ?? 'Failed to create plan')
  const paymentLink = json?.paymentLink
  if (!paymentLink?.id) throw new Error('Invalid plan response')
  return { id: String(paymentLink.id), ..._plan }
}

export async function createSubscription(_input: { customerId: string; planId: string }): Promise<Subscription> {
  throw new Error('createSubscription requires card details; use POST /api/subscriptions')
}

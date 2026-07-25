import type { CreatePaymentInput, Payment } from '@/types/payments'

export async function createPayment(input: CreatePaymentInput): Promise<Payment> {
  if (input.method !== 'pix' && input.method !== 'card') throw new Error('Unsupported method')
  if (input.split?.length) throw new Error('Split is not supported in this helper')

  const res = await fetch('/api/payments', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      amount: input.amount.amount,
      method: input.method,
      description: input.description,
      customer: input.customer,
      metadata: input.metadata,
    }),
  })
  const json = (await res.json().catch(() => null)) as any
  if (!res.ok) throw new Error(json?.error ?? 'Failed to create payment')

  const p = json?.payment
  if (!p?.id || !p?.status) throw new Error('Invalid payment response')
  return { id: String(p.id), status: p.status, providerPaymentId: p.providerPaymentId }
}

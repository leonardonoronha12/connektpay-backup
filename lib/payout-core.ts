export type PayoutStatus = 'requested' | 'processing' | 'paid' | 'failed' | 'canceled' | 'scheduled'

export function mapPayoutStatusFromEventType(type: string): PayoutStatus | null {
  if (type === 'payout.requested') return 'requested'
  if (type === 'payout.processing') return 'processing'
  if (type === 'payout.paid') return 'paid'
  if (type === 'payout.completed') return 'paid'
  if (type === 'payout.failed') return 'failed'
  if (type === 'payout.canceled') return 'canceled'
  return null
}

export function calculatePayoutFee(input: { grossAmountCents: number; feeBps: number }) {
  const gross = Number(input.grossAmountCents)
  const bps = Number(input.feeBps)
  if (!Number.isFinite(gross) || !Number.isInteger(gross) || gross <= 0) throw new Error('Invalid gross amount')
  if (!Number.isFinite(bps) || !Number.isInteger(bps) || bps < 0) throw new Error('Invalid fee bps')
  const fee = Math.round((gross * bps) / 10_000)
  const net = gross - fee
  return { feeAmountCents: fee, netAmountCents: net }
}


import { expect, test } from '@playwright/test'

import { calculatePayoutFee, mapPayoutStatusFromEventType } from '@/lib/payout-core'

test.describe('Payouts (core)', () => {
  test('mapPayoutStatusFromEventType cobre eventos do PRD', async () => {
    expect(mapPayoutStatusFromEventType('payout.requested')).toBe('requested')
    expect(mapPayoutStatusFromEventType('payout.processing')).toBe('processing')
    expect(mapPayoutStatusFromEventType('payout.paid')).toBe('paid')
    expect(mapPayoutStatusFromEventType('payout.failed')).toBe('failed')
    expect(mapPayoutStatusFromEventType('payout.canceled')).toBe('canceled')
    expect(mapPayoutStatusFromEventType('unknown')).toBe(null)
  })

  test('calculatePayoutFee usa bps (sem float) e preserva centavos', async () => {
    const out = calculatePayoutFee({ grossAmountCents: 100_00, feeBps: 200 })
    expect(out.feeAmountCents).toBe(200)
    expect(out.netAmountCents).toBe(9800)
  })
})


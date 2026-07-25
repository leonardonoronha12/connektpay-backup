import { expect, test } from '@playwright/test'

import { buildDailySeriesFromPaidTransactions, buildPaymentsByMethod, buildSubscriptionsByStatus, parsePeriod } from '@/lib/dashboard-core'

test.describe('Dashboard (core)', () => {
  test('parsePeriod usa days quando start/end ausentes', async () => {
    const out = parsePeriod({ days: '7', start: null, end: null })
    expect(out.days).toBe(7)
    expect(out.startIso.endsWith('Z')).toBe(true)
    expect(out.endIso.endsWith('Z')).toBe(true)
  })

  test('buildDailySeriesFromPaidTransactions agrega por dia', async () => {
    const series = buildDailySeriesFromPaidTransactions({
      paidTx: [
        { created_at: '2026-01-01T10:00:00.000Z', gross_amount: 1000, connekt_fee_amount: 10 },
        { created_at: '2026-01-01T12:00:00.000Z', gross_amount: 2000, connekt_fee_amount: 20 },
        { created_at: '2026-01-02T10:00:00.000Z', gross_amount: 3000, connekt_fee_amount: 30 },
      ],
    })
    expect(series).toHaveLength(2)
    expect(series[0].day).toBe('2026-01-01')
    expect(series[0].volume_cents).toBe(3000)
    expect(series[0].revenue_cents).toBe(30)
    expect(series[1].day).toBe('2026-01-02')
    expect(series[1].volume_cents).toBe(3000)
  })

  test('buildPaymentsByMethod conta e soma valores', async () => {
    const out = buildPaymentsByMethod({
      txs: [
        { method: 'pix', amount: 1000 },
        { method: 'pix', amount: 2000 },
        { method: 'card', amount: 3000 },
      ],
    })
    const by = new Map(out.map((r) => [r.method, r]))
    expect(by.get('pix')?.count).toBe(2)
    expect(by.get('pix')?.amount_cents).toBe(3000)
    expect(by.get('card')?.count).toBe(1)
  })

  test('buildSubscriptionsByStatus agrega por status', async () => {
    const out = buildSubscriptionsByStatus({ subs: [{ status: 'active' }, { status: 'active' }, { status: 'canceled' }] })
    const by = new Map(out.map((r) => [r.status, r.count]))
    expect(by.get('active')).toBe(2)
    expect(by.get('canceled')).toBe(1)
  })
})


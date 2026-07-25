import { expect, test } from '@playwright/test'

import { calculateChurnRate, calculateMRRCents, computeInitialNextChargeAt, decideDunningAction } from '@/lib/subscription-core'

test.describe('Recorrência (core)', () => {
  test('computeInitialNextChargeAt usa UTC e trialDays', async () => {
    const createdAt = '2026-01-01T00:00:00.000Z'
    const next = computeInitialNextChargeAt({ createdAtIso: createdAt, trialDays: 7, cycle: 'monthly' })
    expect(next.startsWith('2026-02-08')).toBe(true)
  })

  test('MRR soma mensal + anual (normalizado) + semanal (normalizado)', async () => {
    const plans = new Map([
      ['m', { amountCents: 10000, cycle: 'monthly' as const }],
      ['y', { amountCents: 120000, cycle: 'yearly' as const }],
      ['w', { amountCents: 2500, cycle: 'weekly' as const }],
    ])
    const mrr = calculateMRRCents({
      plansById: plans,
      subscriptions: [
        { planoId: 'm', status: 'active' },
        { planoId: 'y', status: 'active' },
        { planoId: 'w', status: 'past_due' },
        { planoId: 'm', status: 'canceled' },
      ],
    })
    expect(mrr).toBe(10000 + Math.round(120000 / 12) + Math.round((2500 * 52) / 12))
  })

  test('churn calcula cancelados na janela / base ativa no início da janela', async () => {
    const now = '2026-02-01T00:00:00.000Z'
    const churn = calculateChurnRate({
      nowIso: now,
      windowDays: 30,
      subscriptions: [
        { status: 'active', createdAt: '2025-01-01T00:00:00.000Z', canceledAt: null },
        { status: 'canceled', createdAt: '2025-01-01T00:00:00.000Z', canceledAt: '2026-01-15T00:00:00.000Z' },
        { status: 'canceled', createdAt: '2026-01-20T00:00:00.000Z', canceledAt: '2026-01-25T00:00:00.000Z' },
      ],
    })
    expect(churn).toBe(1 / 2)
  })

  test('dunning: tentativa 2 notifica; tentativa 3 cancela', async () => {
    expect(decideDunningAction({ attemptsFailed: 1 })).toBe('none')
    expect(decideDunningAction({ attemptsFailed: 2 })).toBe('notify')
    expect(decideDunningAction({ attemptsFailed: 3 })).toBe('cancel')
  })
})


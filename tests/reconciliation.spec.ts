import { expect, test } from '@playwright/test'

import {
  classifyDivergence,
  compareAmounts,
  compareStatuses,
  normalizeInternalStatus,
  normalizeProviderStatus,
  sanitizeProviderPayload,
} from '@/lib/reconciliation-core'
import { getEnabledReconciliationEntityTypes } from '@/lib/reconciliation-config'

test.describe('Conciliação (core)', () => {
  test('valores iguais => match', async () => {
    const r = compareAmounts({ internalAmountCents: 1000, providerAmountCents: 1000 })
    expect(r.ok).toBe(true)
    expect(r.diff).toBe(0)
  })

  test('valores diferentes => divergente', async () => {
    const r = compareAmounts({ internalAmountCents: 1000, providerAmountCents: 900 })
    expect(r.ok).toBe(false)
    expect(r.diff).toBe(100)
  })

  test('status divergente => status_mismatch', async () => {
    const out = classifyDivergence({
      entityType: 'transaction',
      internalStatus: 'paid',
      providerStatus: 'failed',
      internalAmountCents: 1000,
      providerAmountCents: 1000,
    })
    expect(out.status).toBe('divergent')
    expect(out.reason).toBe('status_mismatch')
  })

  test('status normaliza provider (Paid) => paid', async () => {
    const cmp = compareStatuses({ entityType: 'transaction', internalStatus: 'paid', providerStatus: 'Paid' })
    expect(cmp.ok).toBe(true)
    expect(cmp.internal).toBe('paid')
    expect(cmp.provider).toBe('paid')
  })

  test('missing provider amount => pending', async () => {
    const out = classifyDivergence({
      entityType: 'transaction',
      internalStatus: 'paid',
      providerStatus: 'paid',
      internalAmountCents: 1000,
      providerAmountCents: null,
    })
    expect(out.status).toBe('pending')
    expect(out.reason).toBe('missing_provider_amount')
  })

  test('sanitizeProviderPayload remove campos sensíveis', async () => {
    const sanitized = sanitizeProviderPayload({
      cardNumber: '4111111111111111',
      cvv: '123',
      tokenRef: 'tok_abc',
      nested: { authorization: 'Bearer x', ok: true },
    }) as any
    expect(sanitized.cardNumber).toBe('[redacted]')
    expect(sanitized.cvv).toBe('[redacted]')
    expect(sanitized.tokenRef).toBe('[redacted]')
    expect(sanitized.nested.authorization).toBe('[redacted]')
    expect(sanitized.nested.ok).toBe(true)
  })

  test('normalizeInternalStatus e normalizeProviderStatus retornam strings', async () => {
    expect(typeof normalizeInternalStatus({ entityType: 'payout', status: 'paid' })).toBe('string')
    expect(typeof normalizeProviderStatus({ entityType: 'anticipation', status: 'completed' })).toBe('string')
  })

  test('conciliação respeita apenas módulos externos homologados/ativos', async () => {
    const prevAnticipation = process.env.ANTICIPATION_PROVIDER_ENABLED
    const prevPayout = process.env.PAYOUT_PROVIDER_ENABLED

    process.env.ANTICIPATION_PROVIDER_ENABLED = 'false'
    process.env.PAYOUT_PROVIDER_ENABLED = 'false'
    expect(getEnabledReconciliationEntityTypes()).toEqual(['transaction'])

    process.env.ANTICIPATION_PROVIDER_ENABLED = 'true'
    process.env.PAYOUT_PROVIDER_ENABLED = 'true'
    expect(getEnabledReconciliationEntityTypes()).toEqual(['transaction', 'anticipation', 'payout'])

    if (prevAnticipation == null) delete process.env.ANTICIPATION_PROVIDER_ENABLED
    else process.env.ANTICIPATION_PROVIDER_ENABLED = prevAnticipation
    if (prevPayout == null) delete process.env.PAYOUT_PROVIDER_ENABLED
    else process.env.PAYOUT_PROVIDER_ENABLED = prevPayout
  })
})

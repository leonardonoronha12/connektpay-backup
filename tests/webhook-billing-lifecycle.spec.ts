import { expect, test } from '@playwright/test'

import { mapTransactionStatus } from '@/lib/webhook-status'

test.describe('Webhook billing lifecycle', () => {
  test('normaliza a progressao de billing para status internos', () => {
    const lifecycle = ['payment.created', 'payment.pending', 'payment.processing', 'payment.paid']

    expect(lifecycle.map((eventType) => mapTransactionStatus(eventType))).toEqual(['created', 'pending', 'processing', 'paid'])
  })

  test('cobre aliases e estados terminais do billing', () => {
    expect(mapTransactionStatus('payment.approved')).toBe('paid')
    expect(mapTransactionStatus('payment.failed')).toBe('failed')
    expect(mapTransactionStatus('payment.canceled')).toBe('canceled')
    expect(mapTransactionStatus('payment.cancelled')).toBe('canceled')
    expect(mapTransactionStatus('payment.refunded')).toBe('refunded')
    expect(mapTransactionStatus('payment.unknown')).toBeNull()
  })
})

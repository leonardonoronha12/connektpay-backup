import { expect, test } from '@playwright/test'

import { validateSubscriptionPaymentMethod } from '@/lib/subscription-core'

test.describe('Pix Automático (scaffolding)', () => {
  test('createSubscription bloqueia planos pix_auto até integração real existir', async () => {
    const out = validateSubscriptionPaymentMethod('pix_auto')
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.message).toBe('Pix Automático ainda não está disponível.')
  })
})

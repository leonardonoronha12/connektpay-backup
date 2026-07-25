import { expect, test } from '@playwright/test'

import {
  STANDALONE_PAYMENTS_DISABLED_MESSAGE,
  getStandalonePaymentsBlockMessage,
  isStandalonePaymentRequest,
} from '@/lib/standalone-payments'

test.describe('standalone payments gating', () => {
  const previousEnv = process.env.STANDALONE_PAYMENTS_ENABLED

  test.afterEach(() => {
    if (previousEnv == null) delete process.env.STANDALONE_PAYMENTS_ENABLED
    else process.env.STANDALONE_PAYMENTS_ENABLED = previousEnv
  })

  test('bloqueia pagamento avulso sem paymentLinkSlug por padrao', () => {
    delete process.env.STANDALONE_PAYMENTS_ENABLED

    expect(isStandalonePaymentRequest(undefined)).toBeTruthy()
    expect(getStandalonePaymentsBlockMessage(undefined)).toBe(STANDALONE_PAYMENTS_DISABLED_MESSAGE)
  })

  test('nao bloqueia checkout de Payment Link real', () => {
    delete process.env.STANDALONE_PAYMENTS_ENABLED

    expect(isStandalonePaymentRequest('checkout-real')).toBeFalsy()
    expect(getStandalonePaymentsBlockMessage('checkout-real')).toBeNull()
  })

  test('permite pagamento avulso quando a flag dedicada estiver habilitada', () => {
    process.env.STANDALONE_PAYMENTS_ENABLED = 'true'

    expect(getStandalonePaymentsBlockMessage(null)).toBeNull()
  })
})

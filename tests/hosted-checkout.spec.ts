import { expect, test } from '@playwright/test'

import {
  getHostedCheckoutAllowedHosts,
  inferProviderIdFromHostedCheckoutUrl,
  isHostedCheckoutUrlAllowed,
  sanitizeHostedCheckoutUrl,
} from '@/lib/acquirer/hosted-checkout'

test.describe('hosted checkout allowlist', () => {
  test('aceita domínio atual do payment link da Pagar.me', async () => {
    expect(getHostedCheckoutAllowedHosts('pagarme')).toContain('payment-link.pagar.me')
    expect(getHostedCheckoutAllowedHosts('pagarme')).toContain('*.pagar.me')
    expect(isHostedCheckoutUrlAllowed('pagarme', 'https://payment-link.pagar.me/pl_123')).toBeTruthy()
    expect(isHostedCheckoutUrlAllowed('pagarme', 'https://payment-link-v3-sdx.pagar.me/pl_123')).toBeTruthy()
    expect(inferProviderIdFromHostedCheckoutUrl('https://payment-link.pagar.me/pl_123')).toBe('pagarme')
    expect(inferProviderIdFromHostedCheckoutUrl('https://payment-link-v3-sdx.pagar.me/pl_123')).toBe('pagarme')
    expect(sanitizeHostedCheckoutUrl({ providerId: 'pagarme', url: 'https://payment-link.pagar.me/pl_123' })).toBe(
      'https://payment-link.pagar.me/pl_123',
    )
    expect(
      sanitizeHostedCheckoutUrl({ providerId: 'pagarme', url: 'https://payment-link-v3-sdx.pagar.me/pl_123' }),
    ).toBe('https://payment-link-v3-sdx.pagar.me/pl_123')
  })
})

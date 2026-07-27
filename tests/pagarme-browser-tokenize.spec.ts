import { expect, test } from '@playwright/test'

import { tokenizePagarMeCardInBrowser } from '@/lib/pagarme-browser-tokenize'

test.describe('pagarme browser tokenize', () => {
  test('limita card.label a 32 caracteres antes de chamar a API do provider', async () => {
    const originalFetch = global.fetch
    const originalBaseUrl = process.env.NEXT_PUBLIC_PAGARME_BASE_URL
    const originalAppId = process.env.NEXT_PUBLIC_PAGARME_APP_ID
    let capturedBody: any = null

    process.env.NEXT_PUBLIC_PAGARME_BASE_URL = 'https://api.pagar.me/core/v5'
    process.env.NEXT_PUBLIC_PAGARME_APP_ID = 'pk_test_123'
    global.fetch = (async (_input, init) => {
      capturedBody = JSON.parse(String(init?.body ?? '{}'))
      return new Response(JSON.stringify({ id: 'tok_123' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as typeof fetch

    try {
      const result = await tokenizePagarMeCardInBrowser({
        number: '4111 1111 1111 1111',
        holderName: 'Leonardo QA',
        holderDocument: '11144477735',
        expMonth: '12',
        expYear: '30',
        cvv: '123',
        label: 'QA Auto 20260714 Checkout Conciliacao muito grande',
      })

      expect(result.token).toBe('tok_123')
      expect(capturedBody?.card?.label).toBe('QA Auto 20260714 Checkout Concil')
      expect(String(capturedBody?.card?.label ?? '')).toHaveLength(32)
    } finally {
      global.fetch = originalFetch
      if (typeof originalBaseUrl === 'string') process.env.NEXT_PUBLIC_PAGARME_BASE_URL = originalBaseUrl
      else delete process.env.NEXT_PUBLIC_PAGARME_BASE_URL
      if (typeof originalAppId === 'string') process.env.NEXT_PUBLIC_PAGARME_APP_ID = originalAppId
      else delete process.env.NEXT_PUBLIC_PAGARME_APP_ID
    }
  })
})

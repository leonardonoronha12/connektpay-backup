import { expect, test } from '@playwright/test'
import { createPaymentLinkViaApi, createQaSession, ensureGuestContext, fillCheckoutCustomer, loginWithQaSession } from './helpers/qa-suite'

test.describe('Preview Pagar.me Runtime', () => {
  test('preview expõe apenas configuração pública e envia apenas token ao backend no checkout cartão', async ({ page, baseURL }) => {
    test.skip(!baseURL || !/^https:\/\/.+\.vercel\.app$/i.test(baseURL), 'Executa somente contra Preview publicado na Vercel.')

    const session = await createQaSession(baseURL, 'owner', { preferStaticCreds: true })
    const browserRequests: Array<{ url: string; method: string; postData: string | null }> = []

    page.on('request', (request) => {
      browserRequests.push({
        url: request.url(),
        method: request.method(),
        postData: request.postData() ?? null,
      })
    })

    try {
      await loginWithQaSession(page, session)

      const subscriptionsResponse = await page.request.get(new URL('/api/subscriptions', session.baseURL).toString())
      const subscriptionsPayload = await subscriptionsResponse.json().catch(() => null)
      expect(subscriptionsResponse.ok(), `GET /api/subscriptions: ${String(subscriptionsPayload?.error ?? '')}`.trim()).toBeTruthy()
      expect(subscriptionsPayload?.providerId).toBe('pagarme')
      expect(Boolean(subscriptionsPayload?.requiresClientCardTokenization)).toBeTruthy()

      await page.goto(new URL('/subscriptions/new', session.baseURL).toString(), { waitUntil: 'domcontentloaded' })
      await expect(page.getByText(/Tokenização client-side exigida para o provedor atual/i)).toHaveCount(0)

      const bundleAudit = await page.evaluate(async () => {
        const scripts = Array.from(document.scripts)
          .map((script) => script.src)
          .filter((src): src is string => Boolean(src) && src.startsWith(location.origin))

        const chunks: string[] = []
        for (const src of scripts.slice(0, 20)) {
          try {
            const text = await fetch(src, { credentials: 'same-origin' }).then((response) => response.text())
            chunks.push(text)
          } catch {}
        }

        const blob = chunks.join('\n')
        return {
          leaksSecretIdentifiers: /(PAGARME_SECRET_KEY|PAGARME_WEBHOOK_USERNAME|PAGARME_WEBHOOK_PASSWORD|SUPABASE_SERVICE_ROLE_KEY|service_role)/i.test(blob),
          hasPagarMeMentions: /pagarme|pagar\.me|core\/v5|sdx/i.test(blob),
        }
      })

      expect(bundleAudit.leaksSecretIdentifiers).toBeFalsy()
      expect(bundleAudit.hasPagarMeMentions).toBeTruthy()

      const paymentLink = await createPaymentLinkViaApi(page, { amountBRL: '19,90' })

      await ensureGuestContext(page)
      browserRequests.length = 0

      await page.goto(new URL(`/checkout?slug=${encodeURIComponent(paymentLink.slug)}`, session.baseURL).toString(), {
        waitUntil: 'domcontentloaded',
      })

      await expect(page.getByRole('heading', { name: /Finalizar pagamento/i })).toBeVisible()
      await page.getByRole('button', { name: /Cartão de crédito/i }).click()

      await fillCheckoutCustomer(page)
      await page.getByPlaceholder('ANA L SILVA').fill('Cliente Preview')
      await page.getByPlaceholder('0000 0000 0000 0000').fill('4111 1111 1111 1111')
      await page.getByPlaceholder('MM/AA').fill('12/30')
      await page.getByPlaceholder('123').fill('123')

      const submitButton = page.getByRole('button', { name: /Finalizar pagamento/i })
      await expect(submitButton).toBeEnabled()
      await submitButton.click()

      await page.waitForLoadState('networkidle').catch(() => null)
      await page.waitForTimeout(2_000)

      const pagarMeRequests = browserRequests.filter((entry) => /pagar\.me/i.test(entry.url))
      const backendPaymentRequest = browserRequests.find((entry) => /\/api\/payments(?:\?|$)/.test(entry.url) && entry.method === 'POST')

      expect(pagarMeRequests.length, 'O navegador deve falar diretamente com a Pagar.me para tokenização.').toBeGreaterThan(0)
      expect(backendPaymentRequest, 'O checkout deve chamar /api/payments após tokenização client-side.').toBeTruthy()

      const paymentPayload = backendPaymentRequest?.postData ? JSON.parse(backendPaymentRequest.postData) : null
      expect(paymentPayload?.card?.token, 'O backend deve receber card.token.').toBeTruthy()
      expect(typeof paymentPayload?.card?.number === 'undefined' || paymentPayload?.card?.number === '').toBeTruthy()
      expect(typeof paymentPayload?.card?.cvv === 'undefined' || paymentPayload?.card?.cvv === '').toBeTruthy()
    } finally {
      await session.cleanup()
    }
  })
})

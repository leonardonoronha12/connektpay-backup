import { expect, test } from '@playwright/test'
import {
  createPaymentLinkViaApi,
  createQaSession,
  ensureGuestContext,
  fillCheckoutCustomer,
  isMobileProject,
  loginWithQaSession,
  startQaCapture,
  submitCheckout,
} from './helpers/qa-suite'

test.describe('QA Checkout', () => {
  test('checkout público desktop exibe erro controlado para invalid_credentials sem depender de execução anterior', async ({ page, baseURL }, testInfo) => {
    test.skip(isMobileProject(testInfo), 'Checkout mobile fica isolado em qa-mobile.spec.ts.')
    const session = await createQaSession(baseURL)
    const capture = startQaCapture(page, baseURL)

    try {
      await loginWithQaSession(page, session)
      const paymentLink = await createPaymentLinkViaApi(page, { amountBRL: '19,90' })

      await ensureGuestContext(page)
      capture.reset()
      await page.goto(`/checkout?slug=${encodeURIComponent(paymentLink.slug)}`, { waitUntil: 'domcontentloaded' })
      await page.waitForResponse((response) => response.url().includes(`/api/payment-links?slug=${paymentLink.slug}`) && response.status() === 200, { timeout: 30_000 }).catch(() => {})

      await expect(page.getByRole('heading', { name: /Finalizar pagamento/i })).toBeVisible()
      await expect(page.locator('p', { hasText: /^Produto$/ }).first()).toBeVisible()
      await expect(page.locator('p', { hasText: /^Total$/ }).first()).toBeVisible()
      await expect(page.getByRole('button', { name: /Continuar no checkout seguro/i })).toHaveCount(0)

      await expect(page.getByRole('button', { name: /PIX/i })).toBeVisible()

      const paymentResponsePromise = page
        .waitForResponse((response) => response.url().includes('/api/payments') && response.request().method() === 'POST', {
          timeout: 30_000,
        })
        .catch(() => null)

      await fillCheckoutCustomer(page)
      await submitCheckout(page, testInfo)

      const paymentResponse = await paymentResponsePromise
      const paymentPayload = await paymentResponse?.json().catch(() => null)
      const isControlledProviderInvalidCredentials401 =
        paymentResponse?.status() === 401 &&
        paymentPayload?.code === 'invalid_credentials' &&
        paymentPayload?.error === 'Credenciais inválidas do provedor financeiro.'
      const invalidCredentialsError = page.getByText('Credenciais inválidas do provedor financeiro.').first()

      const controlledError = page
        .getByText(
          /Falha ao processar o split|Não foi possível iniciar o pagamento|Não foi possível concluir sua solicitação\. Tente novamente\.|Split inválido|Credenciais inválidas do provedor financeiro\.|Erro/i,
        )
        .first()
      const awaitingConfirmation = page.getByText(/Aguardando confirmação em tempo real/i).first()
      const result = await Promise.race([
        controlledError.waitFor({ timeout: 25_000 }).then(() => 'error').catch(() => null),
        awaitingConfirmation.waitFor({ timeout: 25_000 }).then(() => 'polling').catch(() => null),
      ])

      expect(result, 'Checkout precisa avançar para erro controlado ou polling interno').toBeTruthy()
      if (isControlledProviderInvalidCredentials401) {
        await expect(invalidCredentialsError, 'O checkout deve exibir a mensagem controlada do provider para invalid_credentials.').toBeVisible()
      }
      await capture.assertNoUnexpected({
        allowCheckoutPublicGuestNoise: true,
        allowCheckoutProviderInvalidCredentials401: isControlledProviderInvalidCredentials401,
      })
    } finally {
      capture.stop()
      await session.cleanup()
    }
  })
})

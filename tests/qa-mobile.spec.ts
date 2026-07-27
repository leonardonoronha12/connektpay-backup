import { expect, test } from '@playwright/test'
import {
  createPaymentLinkViaApi,
  createQaSession,
  ensureGuestContext,
  fillCheckoutCustomer,
  isMobileProject,
  loginWithQaSession,
  openMobileDrawerLink,
  startQaCapture,
  submitCheckout,
} from './helpers/qa-suite'

test.describe('QA Mobile', () => {
  test('menu mobile abre drawer e navega para transacoes', async ({ page, baseURL }, testInfo) => {
    test.skip(!isMobileProject(testInfo), 'Cobertura mobile roda apenas no projeto Mobile Android.')
    const session = await createQaSession(baseURL)
    const capture = startQaCapture(page, baseURL)

    try {
      await loginWithQaSession(page, session)
      await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
      await page.waitForLoadState('networkidle').catch(() => {})
      await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible()

      const transactionsLink = await openMobileDrawerLink(page, 'Transações')
      await transactionsLink.click()
      await expect
        .poll(() => page.evaluate(() => window.location.pathname), { timeout: 15_000, intervals: [100, 250, 500, 1_000] })
        .toBe('/transacoes')
      await expect(page.getByRole('heading', { level: 1, name: 'Transações' })).toBeVisible()
      await capture.assertNoUnexpected()
    } finally {
      capture.stop()
      await session.cleanup()
    }
  })

  test('checkout mobile usa slug proprio e nao herda sessao desktop', async ({ page, baseURL }, testInfo) => {
    test.skip(!isMobileProject(testInfo), 'Cobertura mobile roda apenas no projeto Mobile Android.')
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
      await expect(page.getByRole('button', { name: /Continuar no checkout seguro/i })).toHaveCount(0)

      await fillCheckoutCustomer(page)
      await submitCheckout(page, testInfo)

      const controlledError = page.getByText(/Falha ao processar o split|Não foi possível iniciar o pagamento|Split inválido|Erro/i).first()
      const awaitingConfirmation = page.getByText(/Aguardando confirmação em tempo real/i).first()
      const result = await Promise.race([
        controlledError.waitFor({ timeout: 25_000 }).then(() => 'error').catch(() => null),
        awaitingConfirmation.waitFor({ timeout: 25_000 }).then(() => 'polling').catch(() => null),
      ])

      expect(result, 'Checkout mobile precisa avançar para erro controlado ou polling').toBeTruthy()
      await capture.assertNoUnexpected({ allowCheckoutProviderNoise: true })
    } finally {
      capture.stop()
      await session.cleanup()
    }
  })
})

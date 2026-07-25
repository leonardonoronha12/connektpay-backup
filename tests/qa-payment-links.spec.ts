import { expect, test } from '@playwright/test'
import { createPaymentLinkViaUi, createQaSession, isMobileProject, loginWithQaSession, startQaCapture } from './helpers/qa-suite'

test.describe('QA Payment Links', () => {
  test('lista, cria e abre checkout de link próprio', async ({ page, baseURL }, testInfo) => {
    test.skip(isMobileProject(testInfo), 'Fluxos mobile ficam isolados em qa-mobile.spec.ts.')
    const session = await createQaSession(baseURL)
    const capture = startQaCapture(page, baseURL)

    try {
      await loginWithQaSession(page, session)
      await page.goto('/links-pagamento', { waitUntil: 'domcontentloaded' })
      await expect(page.locator('h1')).toHaveText('Links de Pagamento')
      await page.waitForResponse((response) => response.url().includes('/api/payment-links') && response.status() === 200, { timeout: 30_000 }).catch(() => {})
      await expect(page.getByText('Total de links')).toBeVisible()
      await expect(page.getByRole('link', { name: /Novo link/i }).first()).toBeVisible()

      const link = await createPaymentLinkViaUi(page)
      await expect(page).toHaveURL(new RegExp(`/checkout\\?slug=${link.slug}`))
      await expect(page.getByRole('heading', { name: /Finalizar pagamento/i })).toBeVisible()
      await capture.assertNoUnexpected()
    } finally {
      capture.stop()
      await session.cleanup()
    }
  })
})

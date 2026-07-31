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
      const detailsResponse = await page.request.get(new URL(`/api/payment-links?slug=${encodeURIComponent(link.slug)}`, session.baseURL).toString())
      const detailsPayload = await detailsResponse.json().catch(() => null)

      expect(detailsResponse.ok(), `GET /api/payment-links?slug=: ${String(detailsPayload?.error ?? '')}`.trim()).toBeTruthy()
      expect(link.providerUrl).toBe('')
      expect(link.providerSync).toMatchObject({
        ok: false,
      })
      expect(String(link.providerSync?.message ?? '')).toMatch(/white-label da Connekt Pay|checkout hospedado do provedor foi descontinuado/i)
      expect(String(detailsPayload?.paymentLink?.provider_url ?? '').trim()).toBe('')
      expect(String(detailsPayload?.paymentLink?.metadata?.provider_id ?? '').trim()).toBe('pagarme')
      expect(String(detailsPayload?.paymentLink?.metadata?.checkout_mode ?? '').trim()).toBe('internal')
      await expect(page).toHaveURL(new RegExp(`/checkout\\?slug=${link.slug}`))
      await expect(page.getByRole('heading', { name: /Finalizar pagamento/i })).toBeVisible()
      await expect(page.getByRole('button', { name: /Continuar no checkout seguro/i })).toHaveCount(0)
      await capture.assertNoUnexpected()
    } finally {
      capture.stop()
      await session.cleanup()
    }
  })
})

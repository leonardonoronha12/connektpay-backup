import { expect, test } from '@playwright/test'
import { closeAssistantIfVisible } from './helpers/e2e-auth'
import {
  createPaymentLinkViaApi,
  createQaSession,
  isMobileProject,
  loginWithQaSession,
  seedQaTransaction,
  startQaCapture,
} from './helpers/qa-suite'

test.describe('QA Transactions', () => {
  test('transações usam dados próprios e validam busca, detalhes e export', async ({ page, baseURL }, testInfo) => {
    test.skip(isMobileProject(testInfo), 'Fluxos mobile ficam isolados em qa-mobile.spec.ts.')
    const session = await createQaSession(baseURL)
    const capture = startQaCapture(page, baseURL)

    try {
      await loginWithQaSession(page, session)
      const paymentLink = await createPaymentLinkViaApi(page)
      const seededTransaction = await seedQaTransaction(page, { paymentLinkSlug: paymentLink.slug, status: 'paid' })

      await page.goto('/transacoes', { waitUntil: 'domcontentloaded' })
      await page.waitForResponse((response) => response.url().includes('/api/transactions') && response.status() === 200, { timeout: 30_000 }).catch(() => {})
      await expect(page.locator('h1')).toHaveText('Transações')
      await expect(page.getByPlaceholder('Buscar por cliente ou ID...')).toBeVisible()

      const rows = page.locator('tbody tr')
      await expect(rows.first()).toBeVisible({ timeout: 30_000 })
      await page.getByPlaceholder('Buscar por cliente ou ID...').fill(seededTransaction.id)
      await page.waitForResponse((response) => response.url().includes('/api/transactions') && response.status() === 200, { timeout: 30_000 }).catch(() => {})
      await expect(page.locator('tbody tr')).toHaveCount(1, { timeout: 10_000 })
      await expect(page.locator('tbody tr').first().locator('td').first()).toContainText(seededTransaction.id)

      await page.getByPlaceholder('Buscar por cliente ou ID...').fill('')

      await page.getByRole('button', { name: /^Todos$/ }).click()
      await page.waitForResponse((response) => response.url().includes('/api/transactions') && response.status() === 200, { timeout: 30_000 }).catch(() => {})
      await page.getByRole('button', { name: /^Pago$/ }).click()
      await page.waitForResponse((response) => response.url().includes('/api/transactions') && response.status() === 200, { timeout: 30_000 }).catch(() => {})
      await expect(page.locator('tbody tr').first().locator('td').first()).toContainText(seededTransaction.id)
      await page.getByRole('button', { name: /^Todos$/ }).click()
      await page.waitForResponse((response) => response.url().includes('/api/transactions') && response.status() === 200, { timeout: 30_000 }).catch(() => {})

      await closeAssistantIfVisible(page)
      const rowMenuButton = page.locator('[data-tx-menu-root] button').first()
      await rowMenuButton.scrollIntoViewIfNeeded()
      await rowMenuButton.focus()
      await rowMenuButton.press('Enter')
      await expect(page.getByRole('button', { name: 'Ver detalhes' })).toBeVisible()
      await page.getByRole('button', { name: 'Ver detalhes' }).click()
      await expect(page).toHaveURL(new RegExp(`/transacoes/${seededTransaction.id}$`), { timeout: 30_000 })
      await expect(page.getByRole('button', { name: /Voltar para transações/i })).toBeVisible()
      await expect(page.getByText(seededTransaction.id).first()).toBeVisible()
      await expect(page.getByText(/PIX Copia e Cola/i)).toBeVisible()
      await page.getByRole('button', { name: /Voltar para transações/i }).click()
      await expect(page).toHaveURL(/\/transacoes$/, { timeout: 30_000 })

      const exportButton = page.getByRole('button', { name: /Exportar/i })
      await expect(exportButton).toBeVisible()
      await capture.assertNoUnexpected({ allowCheckoutProviderNoise: true })
    } finally {
      capture.stop()
      await session.cleanup()
    }
  })
})

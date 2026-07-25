import { expect, test } from '@playwright/test'
import { createQaSession, isMobileProject, loginWithQaSession, startQaCapture } from './helpers/qa-suite'

test.describe('QA Dashboard', () => {
  test('dashboard carrega KPIs do domínio sem estado prévio', async ({ page, baseURL }, testInfo) => {
    test.skip(isMobileProject(testInfo), 'Fluxos mobile ficam isolados em qa-mobile.spec.ts.')
    const session = await createQaSession(baseURL)
    const capture = startQaCapture(page, baseURL)

    try {
      await loginWithQaSession(page, session)
      await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
      await page.waitForLoadState('networkidle').catch(() => {})
      await expect(page.locator('h1')).toHaveText('Dashboard')
      await expect(page.locator('p', { hasText: /^TPV$/ }).first()).toBeVisible()
      await expect(page.locator('p', { hasText: /^Receita Connekt$/ }).first()).toBeVisible()
      await expect(page.locator('p', { hasText: /^Saldo disponível$/ }).first()).toBeVisible()
      await expect(page.locator('p', { hasText: /^MRR$/ }).first()).toBeVisible()
      await capture.assertNoUnexpected()
    } finally {
      capture.stop()
      await session.cleanup()
    }
  })
})

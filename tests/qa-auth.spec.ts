import { expect, test } from '@playwright/test'
import { loginViaUi } from './helpers/e2e-auth'
import { createQaSession, isMobileProject, loginWithQaSession, logoutViaUserMenu, startQaCapture } from './helpers/qa-suite'

test.describe('QA Auth', () => {
  test('login redireciona para dashboard', async ({ page, baseURL }, testInfo) => {
    test.skip(isMobileProject(testInfo), 'Fluxos mobile ficam isolados em qa-mobile.spec.ts.')
    const session = await createQaSession(baseURL)
    const capture = startQaCapture(page, baseURL)

    try {
      await loginViaUi(page, session.baseURL, session, 90_000, { allowDashboardFallback: true })
      await expect(page.locator('h1')).toHaveText('Dashboard')
      await capture.assertNoUnexpected()
    } finally {
      capture.stop()
      await session.cleanup()
    }
  })

  test('logout encerra a sessão sem depender de outro teste', async ({ page, baseURL }, testInfo) => {
    test.skip(isMobileProject(testInfo), 'Fluxos mobile ficam isolados em qa-mobile.spec.ts.')
    const session = await createQaSession(baseURL)
    const capture = startQaCapture(page, baseURL)

    try {
      await loginWithQaSession(page, session)
      await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
      await expect(page.locator('h1')).toHaveText('Dashboard')
      await logoutViaUserMenu(page)
      await expect(page.getByRole('heading', { level: 2, name: 'Bem-vindo de volta' })).toBeVisible()
      await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
      await expect(page).toHaveURL(/\/login/)
      capture.reset()
      await capture.assertNoUnexpected()
    } finally {
      capture.stop()
      await session.cleanup()
    }
  })
})

import { test, expect } from '@playwright/test'
import { closeAssistantIfVisible, getBrowserCreds, loginViaUi } from './helpers/e2e-auth'

test.describe('Homologação · Rodada 2', () => {
  test('login persiste sessão e não redireciona de volta para /login', async ({ page, baseURL }) => {
    const base = (baseURL || process.env.BASE_URL || 'http://localhost:3001').replace(/\/$/, '')
    const creds = await getBrowserCreds(base)
    try {
      await loginViaUi(page, base, creds)

      await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
      await page.waitForLoadState('networkidle').catch(() => null)
      expect(page.url()).not.toContain('/login')

      await page.goto('/recebedores', { waitUntil: 'domcontentloaded' })
      await page.waitForLoadState('networkidle').catch(() => null)
      expect(page.url()).not.toContain('/login')
    } finally {
      await creds.cleanup()
    }
  })

  test('Recebedores: modal de “Adicionar recebedor” não fecha durante digitação', async ({ page, baseURL }) => {
    const base = (baseURL || process.env.BASE_URL || 'http://localhost:3001').replace(/\/$/, '')
    const creds = await getBrowserCreds(base)
    try {
      await loginViaUi(page, base, creds)

      await page.goto('/recebedores', { waitUntil: 'domcontentloaded' })
      await closeAssistantIfVisible(page)

      const addReceiverButton = page.getByRole('button', { name: /Adicionar recebedor/i }).last()
      await expect(addReceiverButton).toBeEnabled({ timeout: 30_000 })
      await addReceiverButton.scrollIntoViewIfNeeded()
      await addReceiverButton.click()

      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()

      const input = dialog.locator('input').first()
      await input.click()
      await input.type('3')
      await expect(dialog).toBeVisible()
      await expect(input).toHaveValue(/3/)
    } finally {
      await creds.cleanup()
    }
  })
})

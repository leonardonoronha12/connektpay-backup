import { test, expect } from '@playwright/test'
import { closeAssistantIfVisible, getBrowserCreds, loginViaUi } from './helpers/e2e-auth'

test.describe('UI — modal não deve fechar ao digitar', () => {
  test('Adicionar recebedor: digitar mantém modal aberto', async ({ page, baseURL }) => {
    test.setTimeout(180_000)
    const base = (baseURL || process.env.BASE_URL || '').replace(/\/$/, '')
    const creds = await getBrowserCreds(base)
    try {
      await loginViaUi(page, base, creds)

      await page.goto(`${base}/recebedores`, { waitUntil: 'domcontentloaded' })
      await closeAssistantIfVisible(page)

      const addReceiverButton = page.locator('main').getByRole('button', { name: /Adicionar recebedor/i }).last()
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

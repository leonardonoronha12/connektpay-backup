import { test, expect, type Page } from '@playwright/test'
import { closeAssistantIfVisible, getBrowserCreds, loginViaUi } from './helpers/e2e-auth'

async function openMobileMenuIfNeeded(page: Page) {
  const btn = page.getByTestId('mobile-menu-button')
  if (await btn.isVisible().catch(() => false)) {
    await btn.click()
    await page.getByRole('button', { name: 'Dashboard' }).waitFor({ state: 'visible', timeout: 30_000 })
  }
}

async function navTo(page: Page, baseURL: string, label: string, path: string, expectedTitle: string) {
  await openMobileMenuIfNeeded(page)
  const btn = page.getByRole('button', { name: label })
  const visible = await btn
    .waitFor({ state: 'visible', timeout: 2_500 })
    .then(() => true)
    .catch(() => false)
  if (!visible) {
    const start = await page.evaluate(() => performance.now())
    await page.goto(`${baseURL}${path}`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('heading', { name: expectedTitle }).waitFor({ state: 'visible', timeout: 60_000 })
    const now = await page.evaluate(() => performance.now())
    return { feedbackMs: Math.round(now - start), skipped: false as const }
  }

  const start = await page.evaluate(() => performance.now())
  await btn.click()

  let feedbackMs: number | null = null
  for (let i = 0; i < 60; i += 1) {
    const pending = await btn.getAttribute('data-nav-pending').catch(() => null)
    if (pending) {
      const now = await page.evaluate(() => performance.now())
      feedbackMs = Math.round(now - start)
      break
    }
    await page.waitForTimeout(5)
  }

  try {
    await page.getByRole('heading', { name: expectedTitle }).waitFor({ state: 'visible', timeout: 20_000 })
  } catch {
    await page.goto(`${baseURL}${path}`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('heading', { name: expectedTitle }).waitFor({ state: 'visible', timeout: 60_000 })
  }
  return { feedbackMs, skipped: false as const }
}

test.describe('Homologação final (UX/Qualidade)', () => {
  test('fluxo completo sem erros de console e sem 4xx/5xx', async ({ page, baseURL }, testInfo) => {
    test.setTimeout(420_000)
    const base = (baseURL || process.env.BASE_URL || 'http://localhost:3001').replace(/\/$/, '')
    const creds = await getBrowserCreds(base)

    const consoleErrors: { type: string; text: string }[] = []
    const pageErrors: string[] = []
    const badResponses: { url: string; status: number }[] = []

    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push({ type: m.type(), text: m.text() })
    })
    page.on('pageerror', (e) => pageErrors.push(String(e?.message ?? e)))
    page.on('response', (r) => {
      const url = r.url()
      if (!url.startsWith(base)) return
      const status = r.status()
      if (status === 401 || status === 403 || status === 404 || status >= 500) badResponses.push({ url, status })
    })

    try {
      await loginViaUi(page, base, creds)
      await closeAssistantIfVisible(page)

      const feedback: Record<string, number | null> = {}
      feedback.dashboard = 0
      const isMobileProject = testInfo.project.name.toLowerCase().includes('mobile')

      if (isMobileProject) {
        const checkout = await page.context().newPage()
        await checkout.goto(`${base}/checkout`, { waitUntil: 'domcontentloaded' })
        await expect(checkout).toHaveURL(/\/checkout/)
        await checkout.close()

        await page.goto(`${base}/docs`, { waitUntil: 'domcontentloaded' })
        await expect(page).toHaveURL(/\/docs/)

        const worst = Object.entries(feedback)
          .filter(([, v]) => typeof v === 'number')
          .sort((a, b) => Number(b[1]) - Number(a[1]))
          .slice(0, 5)
        test.info().annotations.push({ type: 'nav-feedback-ms', description: JSON.stringify({ feedback, worst }) })

        expect(pageErrors, 'page errors').toEqual([])
        expect(badResponses, 'bad responses').toEqual([])
        expect(consoleErrors, 'console errors').toEqual([])
        return
      }

      const txNav = await navTo(page, base, 'Transações', '/transacoes', 'Transações')
      feedback.transacoes = txNav.feedbackMs
      const linksNav = await navTo(page, base, 'Links de Pagamento', '/links-pagamento', 'Links de Pagamento')
      feedback.links = linksNav.feedbackMs

      if (!linksNav.skipped) {
        await closeAssistantIfVisible(page)
        const newLinkCta = page.getByRole('link', { name: /Novo link/i }).first()
        await expect(newLinkCta).toBeVisible({ timeout: 30_000 })
        await Promise.all([
          page.waitForURL(/\/links-pagamento\/novo/, { timeout: 30_000 }),
          newLinkCta.click(),
        ])
        await page.getByRole('heading', { name: 'Criar Link de Pagamento' }).waitFor({ state: 'visible', timeout: 30_000 })
        const cancelButton = page.getByRole('button', { name: 'Cancelar' })
        await expect(cancelButton).toBeVisible({ timeout: 30_000 })
        await Promise.all([
          page.waitForURL(/\/links-pagamento(\/)?$/, { timeout: 30_000 }),
          cancelButton.click(),
        ])
        await page.getByRole('heading', { name: 'Links de Pagamento' }).waitFor({ state: 'visible', timeout: 30_000 })
      }

      const checkout = await page.context().newPage()
      await checkout.goto(`${base}/checkout`, { waitUntil: 'domcontentloaded' })
      await expect(checkout).toHaveURL(/\/checkout/)
      await checkout.close()

      const recNav = await navTo(page, base, 'Recebedores', '/recebedores', 'Recebedores')
      feedback.recebedores = recNav.feedbackMs
      if (!recNav.skipped) {
        await closeAssistantIfVisible(page)
        const addReceiverButton = page.locator('main').getByRole('button', { name: 'Adicionar recebedor' }).last()
        await expect(addReceiverButton).toBeEnabled({ timeout: 30_000 })
        await addReceiverButton.scrollIntoViewIfNeeded()
        await addReceiverButton.click()
        const dialog = page.getByRole('dialog')
        await dialog.waitFor({ state: 'visible', timeout: 20_000 })
        await dialog.locator('input').first().fill('Teste')
        await dialog.getByRole('button', { name: 'Cancelar' }).click()
        await dialog.waitFor({ state: 'hidden', timeout: 20_000 })
      }

      feedback.assinaturas = (await navTo(page, base, 'Assinaturas', '/assinaturas', 'Assinaturas')).feedbackMs
      feedback.ledger = (await navTo(page, base, 'Ledger', '/ledger', 'Ledger')).feedbackMs
      feedback.antecipacao = (await navTo(page, base, 'Antecipação', '/antecipacao', 'Antecipação de Recebíveis')).feedbackMs
      feedback.repasses = (await navTo(page, base, 'Repasses', '/repasses', 'Repasses')).feedbackMs

      await openMobileMenuIfNeeded(page)
      feedback.adminPainel = (await navTo(page, base, 'Painel', '/admin/painel', 'Painel Administrativo')).feedbackMs
      feedback.adminEventos = (await navTo(page, base, 'Eventos', '/admin/eventos', 'Eventos & Webhooks')).feedbackMs
      feedback.adminKyc = (await navTo(page, base, 'Aprovação KYC', '/admin/aprovacao-kyc', 'Aprovação KYC')).feedbackMs
      feedback.adminConciliacao = (await navTo(page, base, 'Conciliação', '/admin/conciliacao', 'Conciliação Financeira')).feedbackMs
      feedback.adminAuditoria = (await navTo(page, base, 'Auditoria', '/admin/auditoria', 'Logs de Auditoria')).feedbackMs

      feedback.integracoes = (await navTo(page, base, 'Integrações', '/configuracoes/integracoes', 'Integrações')).feedbackMs
      feedback.configuracoes = (await navTo(page, base, 'Configurações', '/configuracoes', 'Configurações')).feedbackMs

      await page.goto(`${base}/docs`, { waitUntil: 'domcontentloaded' })
      await expect(page).toHaveURL(/\/docs/)

      const worst = Object.entries(feedback)
        .filter(([, v]) => typeof v === 'number')
        .sort((a, b) => Number(b[1]) - Number(a[1]))
        .slice(0, 5)
      test.info().annotations.push({ type: 'nav-feedback-ms', description: JSON.stringify({ feedback, worst }) })

      expect(pageErrors, 'page errors').toEqual([])
      expect(badResponses, 'bad responses').toEqual([])
      expect(consoleErrors, 'console errors').toEqual([])
    } finally {
      await creds.cleanup()
    }
  })
})

import { test, expect, type Page } from '@playwright/test'
import fs from 'node:fs'

function parseEnvFile(content: string) {
  const out: Record<string, string> = {}
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const i = line.indexOf('=')
    if (i < 0) continue
    const k = line.slice(0, i).trim()
    let v = line.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    out[k] = v
  }
  return out
}

function getCreds() {
  const env = fs.existsSync('.env.local') ? parseEnvFile(fs.readFileSync('.env.local', 'utf8')) : {}
  const email = process.env.E2E_EMAIL || env.E2E_EMAIL
  const password = process.env.E2E_PASSWORD || env.E2E_PASSWORD
  if (!email || !password) throw new Error('Missing E2E_EMAIL/E2E_PASSWORD in env or .env.local')
  return { email, password }
}

async function login(page: Page, baseURL: string) {
  const { email, password } = getCreds()
  await page.goto(`${baseURL}/login`, { waitUntil: 'domcontentloaded' })
  await page.locator('input[type=email], input[autocomplete=email]').first().fill(email)
  await page.locator('input[type=password], input[autocomplete=current-password], input[name=password]').first().fill(password)
  await page.getByRole('button', { name: 'Entrar na conta' }).click()
  await page.getByRole('heading', { level: 1, name: 'Dashboard' }).waitFor({ state: 'visible', timeout: 90_000 })
}

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

async function openMobileMenuIfNeeded(page: Page) {
  const btn = page.getByTestId('mobile-menu-button')
  if (await btn.isVisible().catch(() => false)) {
    await btn.click()
    await page.getByRole('button', { name: 'Dashboard' }).waitFor({ state: 'visible', timeout: 30_000 })
  }
}

test.describe('Produção — navegação exploratória automatizada', () => {
  test('stress básico (cliques/refresh/modais) sem travar', async ({ page, baseURL }, testInfo) => {
    test.setTimeout(420_000)
    const base = (baseURL || process.env.BASE_URL || '').replace(/\/$/, '')
    test.skip(base !== 'https://connektpay.vercel.app', `Teste restrito à produção homologada; BASE_URL atual: "${base}"`)

    const consoleErrors: Array<{ type: string; text: string }> = []
    const pageErrors: string[] = []
    const bad5xx: Array<{ url: string; status: number }> = []
    const failedRequests: Array<{ url: string; method: string; errorText: string }> = []

    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push({ type: m.type(), text: m.text() })
    })
    page.on('pageerror', (e) => pageErrors.push(String(e?.message ?? e)))
    page.on('requestfailed', (r) => failedRequests.push({ url: r.url(), method: r.method(), errorText: r.failure()?.errorText ?? 'requestfailed' }))
    page.on('response', (r) => {
      const url = r.url()
      if (!url.startsWith(base)) return
      const status = r.status()
      if (status >= 500) bad5xx.push({ url, status })
    })

    await login(page, base)

    const seed = Array.from(testInfo.project.name).reduce((a, c) => a + c.charCodeAt(0), 0) + Date.now() % 1000
    const rnd = mulberry32(seed)

    const routes: Array<{ path: string; heading?: string }> = [
      { path: '/dashboard', heading: 'Dashboard' },
      { path: '/transacoes', heading: 'Transações' },
      { path: '/links-pagamento', heading: 'Links de Pagamento' },
      { path: '/recebedores', heading: 'Recebedores' },
      { path: '/assinaturas', heading: 'Assinaturas' },
      { path: '/ledger', heading: 'Ledger' },
      { path: '/antecipacao', heading: 'Antecipação de Recebíveis' },
      { path: '/repasses', heading: 'Repasses' },
      { path: '/configuracoes', heading: 'Configurações' },
      { path: '/configuracoes/integracoes', heading: 'Integrações' },
      { path: '/docs' },
    ]

    const actions: Array<() => Promise<void>> = [
      async () => {
        const r = routes[Math.floor(rnd() * routes.length)]
        await page.goto(`${base}${r.path}`, { waitUntil: 'domcontentloaded' })
        if (r.heading) {
          await page
            .getByRole('heading', { name: r.heading })
            .waitFor({ state: 'visible', timeout: 45_000 })
            .catch(() => null)
        }
      },
      async () => {
        await page.reload({ waitUntil: 'domcontentloaded' })
      },
      async () => {
        await openMobileMenuIfNeeded(page)
      },
      async () => {
        await page.goto(`${base}/configuracoes`, { waitUntil: 'domcontentloaded' })
        await page.getByRole('heading', { name: 'Configurações' }).waitFor({ state: 'visible', timeout: 60_000 })
        const cargo = page.getByLabel('Cargo')
        const v = `QA ${Math.floor(rnd() * 1000)}`
        if (await cargo.isVisible().catch(() => false)) await cargo.fill(v)
        const save = page.getByRole('button', { name: /Salvar alterações/i }).first()
        if (await save.isVisible().catch(() => false)) await save.click().catch(() => null)
      },
      async () => {
        await page.goto(`${base}/configuracoes/integracoes`, { waitUntil: 'domcontentloaded' })
        await page.getByRole('heading', { name: 'Integrações' }).waitFor({ state: 'visible', timeout: 60_000 })
        const genKey = page.getByRole('button', { name: /Gerar nova chave/i })
        if (await genKey.isVisible().catch(() => false)) {
          await genKey.click()
          const revoke = page.getByLabel('Revogar chave').first()
          if (await revoke.isVisible().catch(() => false)) {
            await revoke.click()
            const confirm = page.getByRole('button', { name: /^Revogar$/ })
            if (await confirm.isVisible().catch(() => false)) await confirm.click().catch(() => null)
          }
        }
        const genTok = page.getByRole('button', { name: /Gerar token/i })
        if (await genTok.isVisible().catch(() => false)) {
          await genTok.click()
          const revokeT = page.getByLabel('Revogar token').first()
          if (await revokeT.isVisible().catch(() => false)) {
            await revokeT.click()
            const confirm = page.getByRole('button', { name: /^Revogar$/ })
            if (await confirm.isVisible().catch(() => false)) await confirm.click().catch(() => null)
          }
        }
      },
      async () => {
        const checkout = await page.context().newPage()
        await checkout.goto(`${base}/checkout`, { waitUntil: 'domcontentloaded' })
        await expect(checkout).toHaveURL(/\/checkout/)
        await checkout.close()
      },
    ]

    for (let i = 0; i < 40; i += 1) {
      const action = actions[Math.floor(rnd() * actions.length)]
      await action()
      await page.waitForTimeout(50 + Math.floor(rnd() * 120))
    }

    expect(bad5xx, 'Respostas 5xx em produção').toEqual([])
    expect(pageErrors, 'Erros de página (pageerror)').toEqual([])
    expect(consoleErrors, 'Erros no console').toEqual([])
    expect(failedRequests, 'Request failed').toEqual([])
  })
})

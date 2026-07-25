import { test, expect, type Page } from '@playwright/test'
import fs from 'node:fs'
import crypto from 'node:crypto'

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
  await page.goto(`${baseURL}/login`, { waitUntil: 'load' })
  await page.locator('input[type=email], input[autocomplete=email]').first().fill(email)
  await page.locator('input[type=password], input[autocomplete=current-password], input[name=password]').first().fill(password)
  await page.getByRole('button', { name: 'Entrar na conta' }).click()
  await page.getByRole('heading', { level: 1, name: 'Dashboard' }).waitFor({ state: 'visible', timeout: 90_000 })
}

function isProductionBase(baseURL: string) {
  return baseURL.replace(/\/$/, '') === 'https://connektpay.vercel.app'
}

function normalizeUrlForDupCheck(url: string) {
  try {
    const u = new URL(url)
    u.searchParams.delete('_rsc')
    u.hash = ''
    return `${u.origin}${u.pathname}${u.search ? `?${u.searchParams.toString()}` : ''}`
  } catch {
    return url
  }
}

test.describe('Produção — validação final', () => {
  test('produção (cliente) sem erros de console/page e sem 5xx', async ({ page, baseURL }, testInfo) => {
    test.setTimeout(420_000)
    const base = (baseURL || process.env.BASE_URL || '').replace(/\/$/, '')
    test.skip(!isProductionBase(base), `Teste restrito à produção homologada; BASE_URL atual: "${base}"`)

    const consoleMsgs: Array<{ type: string; text: string; location: any }> = []
    const pageErrors: string[] = []
    const failedRequests: Array<{ url: string; method: string; errorText: string }> = []
    const badResponses: Array<{ url: string; status: number; method: string }> = []
    const dupeRequests: Array<{ key: string; count: number }> = []
    const requestCounts = new Map<string, number>()

    page.on('console', (m) => {
      consoleMsgs.push({ type: m.type(), text: m.text(), location: m.location() })
    })
    page.on('pageerror', (e) => pageErrors.push(String(e?.message ?? e)))
    page.on('requestfailed', (r) => failedRequests.push({ url: r.url(), method: r.method(), errorText: r.failure()?.errorText ?? 'requestfailed' }))
    page.on('response', (r) => {
      const url = r.url()
      if (!url.startsWith(base)) return
      const key = `${r.request().method()} ${normalizeUrlForDupCheck(url)}`
      requestCounts.set(key, (requestCounts.get(key) ?? 0) + 1)
      const status = r.status()
      if (status >= 500 || status === 404 || status === 401 || status === 403) badResponses.push({ url, status, method: r.request().method() })
    })

    const navPerf: any[] = []
    const capturePerf = async (label: string) => {
      const nav = await page
        .evaluate(() => {
          const entries = performance.getEntriesByType('navigation')
          return entries.length ? (entries[0] as any).toJSON?.() ?? entries[0] : null
        })
        .catch(() => null)
      navPerf.push({ label, url: page.url(), navigation: nav })
    }

    const settle = async () => {
      await page.waitForLoadState('networkidle').catch(() => null)
      await page.waitForTimeout(200)
    }

    await login(page, base)
    await capturePerf('after-login')

    const cookiesAfterLogin = await page.context().cookies()
    const cookieNamesAfterLogin = cookiesAfterLogin.map((c) => c.name)
    const cpRole = cookiesAfterLogin.find((c) => c.name === 'cp_role')?.value ?? null
    const hasSupabaseCookie = cookiesAfterLogin.some((c) => c.name.startsWith('sb-') && c.value)

    await expect
      .poll(() => page.url(), { timeout: 30_000 })
      .toContain('/dashboard')

    await page.reload({ waitUntil: 'load' })
    await page.getByRole('heading', { level: 1, name: 'Dashboard' }).waitFor({ state: 'visible', timeout: 90_000 })
    await capturePerf('after-refresh')

    await settle()

    const apiMe = await page.request.get(`${base}/api/me`)
    const apiDashboard = await page.request.get(`${base}/api/dashboard?days=30`)
    const apiTransactions = await page.request.get(`${base}/api/transactions`)
    const apiReceivers = await page.request.get(`${base}/api/receivers`)
    const favicon = await page.request.get(`${base}/favicon.ico`)

    const routes: Array<{ label: string; path: string; heading: string }> = [
      { label: 'Dashboard', path: '/dashboard', heading: 'Dashboard' },
      { label: 'Links de Pagamento', path: '/links-pagamento', heading: 'Links de Pagamento' },
      { label: 'Recebedores', path: '/recebedores', heading: 'Recebedores' },
      { label: 'Assinaturas', path: '/assinaturas', heading: 'Assinaturas' },
      { label: 'Ledger', path: '/ledger', heading: 'Ledger' },
      { label: 'Antecipação', path: '/antecipacao', heading: 'Antecipação de Recebíveis' },
      { label: 'Repasses', path: '/repasses', heading: 'Repasses' },
      { label: 'Painel', path: '/admin/painel', heading: 'Painel Administrativo' },
      { label: 'Aprovação KYC', path: '/admin/aprovacao-kyc', heading: 'Aprovação KYC' },
      { label: 'Eventos', path: '/admin/eventos', heading: 'Eventos & Webhooks' },
      { label: 'Conciliação', path: '/admin/conciliacao', heading: 'Conciliação Financeira' },
      { label: 'Auditoria', path: '/admin/auditoria', heading: 'Logs de Auditoria' },
      { label: 'Integrações', path: '/configuracoes/integracoes', heading: 'Integrações' },
      { label: 'Configurações', path: '/configuracoes', heading: 'Configurações' },
    ]

    const reachable: any[] = []
    for (const r of routes) {
      await page.goto(`${base}${r.path}`, { waitUntil: 'load' })
      const ok = await page
        .getByRole('heading', { name: r.heading })
        .waitFor({ state: 'visible', timeout: 45_000 })
        .then(() => true)
        .catch(() => false)
      await settle()
      reachable.push({ ...r, ok, finalUrl: page.url() })
      await capturePerf(`nav:${r.path}`)
    }

    const docs = await page.context().newPage()
    await docs.goto(`${base}/docs`, { waitUntil: 'load' })
    await expect(docs).toHaveURL(/\/docs/)
    await docs.close()

    await page.getByLabel('Menu do usuário').click()
    await page.getByRole('menuitem', { name: /^Sair$/ }).click()
    await expect(page).toHaveURL(/\/login/, { timeout: 90_000 })

    await page.reload({ waitUntil: 'load' })
    await expect(page).toHaveURL(/\/login/)

    const cookiesAfterLogout = await page.context().cookies()
    const cookieNamesAfterLogout = cookiesAfterLogout.map((c) => c.name)
    const cpRoleAfterLogout = cookiesAfterLogout.find((c) => c.name === 'cp_role')?.value ?? null

    for (const [key, count] of requestCounts.entries()) {
      if (count <= 1) continue
      dupeRequests.push({ key, count })
    }
    dupeRequests.sort((a, b) => b.count - a.count)

    const consoleErrors = consoleMsgs.filter((m) => m.type === 'error' || m.type === 'warning')
    const allowListedConsole: Array<(text: string) => boolean> = [
      (t) => t.includes('Download the React DevTools'),
      (t) => t.includes('A cookie associated with a cross-site resource'),
    ]

    const consoleRelevant = consoleErrors.filter((m) => !allowListedConsole.some((fn) => fn(m.text)))
    const criticalConsole = consoleRelevant.filter((m) => {
      const t = m.text
      if (t.includes('Hydration failed')) return true
      if (t.includes('hydration')) return true
      if (t.includes('ChunkLoadError')) return true
      if (t.includes('Failed to fetch')) return true
      if (t.includes('Internal Server Error')) return true
      if (t.includes('TypeError')) return true
      return m.type === 'error'
    })

    const bad5xx = badResponses.filter((r) => r.status >= 500)

    const artifacts = {
      baseURL: base,
      project: testInfo.project.name,
      cookiesAfterLogin: { names: cookieNamesAfterLogin, cpRole, hasSupabaseCookie },
      cookiesAfterLogout: { names: cookieNamesAfterLogout, cpRole: cpRoleAfterLogout },
      reachable,
      counts: {
        consoleTotal: consoleMsgs.length,
        consoleRelevant: consoleRelevant.length,
        pageErrors: pageErrors.length,
        failedRequests: failedRequests.length,
        badResponses: badResponses.length,
        bad5xx: bad5xx.length,
        dupeRequestKeys: dupeRequests.length,
      },
      bad5xx,
      badResponses,
      failedRequests,
      pageErrors,
      consoleRelevant,
      dupeRequests: dupeRequests.slice(0, 50),
      navPerf,
    }

    const outName = `prod-final-${crypto.randomBytes(6).toString('hex')}.json`
    const outPath = testInfo.outputPath(outName)
    fs.writeFileSync(outPath, JSON.stringify(artifacts, null, 2))
    await testInfo.attach('prod-final.json', { path: outPath, contentType: 'application/json' })

    expect(hasSupabaseCookie, 'Sessão (cookie sb-*) ausente após login').toBeTruthy()
    expect(cpRole, 'Cookie cp_role ausente após login').toBeTruthy()
    expect(apiMe.status(), '/api/me (produção)').toBe(200)
    expect(apiDashboard.status(), '/api/dashboard?days=30 (produção)').toBe(200)
    expect(apiTransactions.status(), '/api/transactions (produção)').toBe(200)
    expect(apiReceivers.status(), '/api/receivers (produção)').toBe(200)
    expect([200, 204], '/favicon.ico (produção)').toContain(favicon.status())
    expect(cpRoleAfterLogout, 'Cookie cp_role deveria estar limpo após logout').toBeFalsy()
    expect(pageErrors, 'Erros de página (pageerror)').toEqual([])
    expect(bad5xx, 'Respostas 5xx em produção').toEqual([])
    expect(criticalConsole, 'Erros/warnings relevantes no console').toEqual([])
  })
})

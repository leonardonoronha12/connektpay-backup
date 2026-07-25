import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

function parseEnvFile(content) {
  const out = {}
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const i = line.indexOf('=')
    if (i < 0) continue
    const k = line.slice(0, i).trim()
    let v = line.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (k) out[k] = v
  }
  return out
}

function getCreds() {
  const direct = { email: process.env.E2E_EMAIL ?? '', password: process.env.E2E_PASSWORD ?? '' }
  if (direct.email && direct.password) return direct
  if (!fs.existsSync('.env.local')) return direct
  const parsed = parseEnvFile(fs.readFileSync('.env.local', 'utf8'))
  return { email: direct.email || parsed.E2E_EMAIL || '', password: direct.password || parsed.E2E_PASSWORD || '' }
}

async function time(label, fn) {
  const start = Date.now()
  const out = await fn()
  const end = Date.now()
  return { label, ms: end - start, out }
}

async function waitForAppReady(page, title) {
  await page.waitForLoadState('domcontentloaded')
  if (title) {
    await page.getByRole('heading', { level: 1, name: title }).waitFor({ state: 'visible', timeout: 45_000 })
  } else {
    await page.waitForTimeout(250)
  }
}

async function run() {
  const baseURL = process.env.BASE_URL || 'https://connektpay.vercel.app'
  const { email, password } = getCreds()
  if (!email || !password) throw new Error('Missing E2E_EMAIL/E2E_PASSWORD')

  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const outDir = path.join(process.cwd(), 'test-results', `perf-ui-${ts}`)
  fs.mkdirSync(outDir, { recursive: true })

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  const page = await context.newPage()

  const events = { consoleErrors: [], pageErrors: [], httpErrors: [], requestsByUrl: {} }
  page.on('console', (m) => {
    if (m.type() === 'error') events.consoleErrors.push({ text: m.text(), location: m.location() })
  })
  page.on('pageerror', (e) => events.pageErrors.push({ message: String(e?.message ?? e) }))
  page.on('response', (r) => {
    const url = r.url()
    const status = r.status()
    if (url.startsWith(baseURL) && (status === 401 || status === 403 || status >= 500)) {
      events.httpErrors.push({ url, status })
    }
  })
  page.on('request', (r) => {
    const url = r.url()
    if (!url.startsWith(baseURL)) return
    events.requestsByUrl[url] = (events.requestsByUrl[url] || 0) + 1
  })

  await page.goto(`${baseURL}/login`, { waitUntil: 'domcontentloaded' })
  const emailInput = page.locator('input[type=email], input[autocomplete=email]').first()
  await emailInput.waitFor({ state: 'visible', timeout: 30_000 })
  await emailInput.fill(email)
  const inputCount = await page.locator('input').count().catch(() => -1)
  let pwInput = page.locator('input[type=password], input[autocomplete=current-password], input[name=password]').first()
  try {
    await pwInput.waitFor({ state: 'visible', timeout: 10_000 })
  } catch {
    pwInput = page.locator('input').nth(1)
    try {
      await pwInput.waitFor({ state: 'visible', timeout: 30_000 })
    } catch (e) {
      await page.screenshot({ path: path.join(outDir, 'login-debug.png'), fullPage: true }).catch(() => null)
      throw new Error(`PASSWORD_INPUT_NOT_VISIBLE count=${inputCount} url=${page.url()} err=${String(e?.message ?? e)}`)
    }
  }
  await pwInput.fill(password)
  const loginBtn = page.getByRole('button', { name: 'Entrar na conta' })
  await Promise.all([page.waitForResponse((r) => r.url().includes('/api/auth/login') && r.status() === 200, { timeout: 60_000 }), loginBtn.click()])
  await page.waitForURL((u) => u.toString().includes('/dashboard'), { timeout: 90_000 })
  if (page.url().includes('/login')) {
    await page.screenshot({ path: path.join(outDir, 'login-failed.png'), fullPage: true })
    throw new Error('LOGIN_FAILED_OR_SESSION_NOT_PERSISTED')
  }

  const results = {
    baseURL,
    generatedAt: new Date().toISOString(),
    timings: {},
    events,
    stats: {},
  }

  const navRoutes = [
    { key: 'dashboard', url: '/dashboard', title: 'Dashboard' },
    { key: 'links', url: '/links-pagamento', title: 'Links de Pagamento' },
    { key: 'antecipacao', url: '/antecipacao', title: 'Antecipação de Recebíveis' },
    { key: 'configuracoes', url: '/configuracoes', title: 'Configurações' },
  ]

  results.timings.routeLoads = []
  for (const r of navRoutes) {
    const t = await time(`goto:${r.key}`, async () => {
      await page.goto(`${baseURL}${r.url}`, { waitUntil: 'domcontentloaded' })
      await waitForAppReady(page, r.title)
    })
    results.timings.routeLoads.push({ key: r.key, url: r.url, ms: t.ms })
    await page.screenshot({ path: path.join(outDir, `route-${r.key}.png`), fullPage: true })
  }

  await page.goto(`${baseURL}/recebedores`, { waitUntil: 'domcontentloaded' })
  await waitForAppReady(page, 'Recebedores')

  const modalTiming = await time('modal:recebedor_open', async () => {
    const start = await page.evaluate(() => performance.now())
    await page.getByRole('button', { name: /Adicionar recebedor/i }).click()
    const dialog = page.getByRole('dialog')
    await dialog.waitFor({ state: 'visible', timeout: 15_000 })
    const end = await page.evaluate(() => performance.now())
    return Math.round(end - start)
  })
  results.timings.modalRecebedorOpenMs = modalTiming.out

  const dialog = page.getByRole('dialog')
  const input = dialog.locator('input').first()
  await input.click()

  const typingTiming = await time('input:masked_typing', async () => {
    const start = await page.evaluate(() => performance.now())
    await input.type('Joao da Silva 12345678900', { delay: 0 })
    const end = await page.evaluate(() => performance.now())
    return Math.round(end - start)
  })
  results.timings.maskTypingMs = typingTiming.out
  await page.screenshot({ path: path.join(outDir, 'recebedor-modal.png'), fullPage: true })

  results.timings.modalRecebedorCloseMs = await (async () => {
    const start = await page.evaluate(() => performance.now())
    await dialog.getByRole('button', { name: 'Cancelar' }).click()
    await dialog.waitFor({ state: 'hidden', timeout: 15_000 })
    const end = await page.evaluate(() => performance.now())
    return Math.round(end - start)
  })()

  results.timings.navClickToLinksMs = await (async () => {
    await page.goto(`${baseURL}/dashboard`, { waitUntil: 'domcontentloaded' })
    await waitForAppReady(page, 'Dashboard')
    const start = await page.evaluate(() => performance.now())
    const linkBtn = page.getByRole('button', { name: 'Links de Pagamento' })
    await linkBtn.click()
    const feedbackStart = await page.evaluate(() => performance.now())
    let feedbackMs = null
    for (let i = 0; i < 40; i += 1) {
      const pending = await linkBtn.getAttribute('data-nav-pending').catch(() => null)
      if (pending) {
        const now = await page.evaluate(() => performance.now())
        feedbackMs = Math.round(now - feedbackStart)
        break
      }
      await page.waitForTimeout(5)
    }
    results.timings.navClickFeedbackMs = feedbackMs
    await page.waitForURL((u) => u.toString().includes('/links-pagamento'), { timeout: 45_000 }).catch(() => null)
    await waitForAppReady(page, 'Links de Pagamento')
    const end = await page.evaluate(() => performance.now())
    return Math.round(end - start)
  })()

  results.timings.recebedoresEditMaskTypingMs = await (async () => {
    await page.goto(`${baseURL}/recebedores`, { waitUntil: 'domcontentloaded' })
    await waitForAppReady(page, 'Recebedores')
    const cards = page.locator('div[style*=\"cursor: pointer\"]').filter({ hasText: 'KYC:' })
    const count = await cards.count()
    if (count === 0) return null
    await cards.first().click()
    const overlay = page.locator('div[style*=\"position: fixed\"][style*=\"inset: 0\"]').first()
    await overlay.waitFor({ state: 'visible', timeout: 15_000 })
    const inputs = overlay.locator('input')
    if ((await inputs.count()) < 3) return null
    const docInput = inputs.nth(2)
    await docInput.click()
    await docInput.fill('')
    const start = await page.evaluate(() => performance.now())
    await docInput.type('12345678901', { delay: 0 })
    const end = await page.evaluate(() => performance.now())
    return Math.round(end - start)
  })()

  const dupes = Object.entries(events.requestsByUrl)
    .filter(([, n]) => n > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([url, count]) => ({ url, count }))

  results.stats = {
    consoleErrorCount: events.consoleErrors.length,
    pageErrorCount: events.pageErrors.length,
    httpErrorCount: events.httpErrors.length,
    uniqueRequestCount: Object.keys(events.requestsByUrl).length,
    topDuplicateRequests: dupes,
  }

  fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(results, null, 2))
  process.stdout.write(`${outDir}\n`)
  process.stdout.write(`${JSON.stringify(results.timings)}\n`)
  process.stdout.write(`${JSON.stringify(results.stats)}\n`)

  await context.close()
  await browser.close()
}

run().catch((e) => {
  console.error(String(e?.stack ?? e))
  process.exit(1)
})

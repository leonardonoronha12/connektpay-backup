import { test, expect } from '@playwright/test'
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

async function login(page: any, baseURL: string) {
  const { email, password } = getCreds()
  await page.goto(`${baseURL}/login`, { waitUntil: 'load' })
  await page.locator('input[type=email], input[autocomplete=email]').first().fill(email)
  await page.locator('input[type=password], input[autocomplete=current-password], input[name=password]').first().fill(password)
  await page.getByRole('button', { name: 'Entrar na conta' }).click()
  await page.getByRole('heading', { level: 1, name: 'Dashboard' }).waitFor({ state: 'visible', timeout: 90_000 })
}

test.describe('Produção — diagnose WebKit "due to access control checks"', () => {
  test('captura stacks e URLs reais dos fetches', async ({ page, baseURL }, testInfo) => {
    test.setTimeout(240_000)
    const base = (baseURL || process.env.BASE_URL || '').replace(/\/$/, '')
    test.skip(base !== 'https://connektpay.vercel.app', `Teste restrito à produção homologada; BASE_URL atual: "${base}"`)

    const pwPageErrors: string[] = []
    const pwConsole: Array<{ type: string; text: string; location: any }> = []
    const pwFailedRequests: Array<{ url: string; method: string; errorText: string }> = []
    const pwBadResponses: Array<{ url: string; status: number; method: string }> = []

    page.on('pageerror', (e) => pwPageErrors.push(String(e?.message ?? e)))
    page.on('console', (m) => pwConsole.push({ type: m.type(), text: m.text(), location: m.location() }))
    page.on('requestfailed', (r) => pwFailedRequests.push({ url: r.url(), method: r.method(), errorText: r.failure()?.errorText ?? 'requestfailed' }))
    page.on('response', (r) => {
      const url = r.url()
      if (!url.startsWith(base)) return
      const status = r.status()
      if (status >= 500 || status === 404 || status === 401 || status === 403) pwBadResponses.push({ url, status, method: r.request().method() })
    })

    await page.addInitScript(() => {
      ;(window as any).__cp = {
        fetchCalls: [] as any[],
        unhandled: [] as any[],
        errors: [] as any[],
      }

      window.addEventListener('unhandledrejection', (ev: any) => {
        ;(window as any).__cp.unhandled.push({
          message: String(ev?.reason?.message ?? ev?.reason ?? 'unhandledrejection'),
          stack: String(ev?.reason?.stack ?? ''),
        })
      })

      window.addEventListener('error', (ev: any) => {
        ;(window as any).__cp.errors.push({
          message: String(ev?.message ?? ev?.error?.message ?? ev?.error ?? 'error'),
          filename: String(ev?.filename ?? ''),
          lineno: Number(ev?.lineno ?? 0),
          colno: Number(ev?.colno ?? 0),
          stack: String(ev?.error?.stack ?? ''),
        })
      })

      const origFetch = window.fetch.bind(window)
      window.fetch = async (...args: any[]) => {
        const input = args[0]
        const init = (args[1] ?? {}) as any
        const url = typeof input === 'string' ? input : String(input?.url ?? input)
        const track =
          url.includes('/api/me') ||
          url.includes('/api/dashboard') ||
          url.includes('/api/transactions') ||
          url.includes('/api/receivers') ||
          url.includes('connektpay.vercel.app/api/')

        const entry: any = track
          ? {
              at: Date.now(),
              url,
              method: String(init?.method ?? 'GET'),
              credentials: init?.credentials ?? '(default)',
              mode: init?.mode ?? '(default)',
              redirect: init?.redirect ?? '(default)',
              referrer: init?.referrer ?? '(default)',
              referrerPolicy: init?.referrerPolicy ?? '(default)',
              stack: String(new Error('fetch').stack ?? ''),
            }
          : null

        try {
          const [resource, options] = args as [RequestInfo | URL, RequestInit | undefined]
          const res = await origFetch(resource, options)
          if (entry) {
            entry.result = { ok: res.ok, status: res.status, redirected: res.redirected, type: (res as any).type }
            ;(window as any).__cp.fetchCalls.push(entry)
          }
          return res
        } catch (e: any) {
          if (entry) {
            entry.error = { message: String(e?.message ?? e), name: String(e?.name ?? ''), stack: String(e?.stack ?? '') }
            ;(window as any).__cp.fetchCalls.push(entry)
          }
          throw e
        }
      }
    })

    await login(page, base)
    await page.waitForTimeout(800)

    const routes = [
      '/dashboard',
      '/links-pagamento',
      '/recebedores',
      '/assinaturas',
      '/ledger',
      '/antecipacao',
      '/repasses',
      '/admin/painel',
      '/admin/aprovacao-kyc',
      '/admin/eventos',
      '/admin/conciliacao',
      '/admin/auditoria',
      '/configuracoes/integracoes',
      '/configuracoes',
    ]

    const reachable: Array<{ path: string; url: string; ok: boolean }> = []
    for (const path of routes) {
      await page.goto(`${base}${path}`, { waitUntil: 'load' })
      await page.waitForTimeout(250)
      const ok = await page
        .getByRole('heading')
        .first()
        .waitFor({ state: 'visible', timeout: 15_000 })
        .then(() => true)
        .catch(() => false)
      reachable.push({ path, url: page.url(), ok })
      await page.waitForTimeout(250)
    }

    const cookies = await page.context().cookies()
    const cpRole = cookies.find((c: any) => c.name === 'cp_role')?.value ?? null
    const sbCookies = cookies.filter((c: any) => String(c.name).startsWith('sb-')).map((c: any) => ({ name: c.name, domain: c.domain, path: c.path, secure: c.secure, sameSite: c.sameSite }))

    const diag = await page.evaluate(() => (window as any).__cp)

    const out = {
      base,
      project: testInfo.project.name,
      cookies: { cpRole, sbCookies },
      playwright: {
        pageErrors: pwPageErrors,
        console: pwConsole,
        failedRequests: pwFailedRequests,
        badResponses: pwBadResponses,
      },
      reachable,
      diag,
    }

    const outName = `prod-webkit-diag-${crypto.randomBytes(6).toString('hex')}.json`
    const outPath = testInfo.outputPath(outName)
    fs.writeFileSync(outPath, JSON.stringify(out, null, 2))
    await testInfo.attach('prod-webkit-diag.json', { path: outPath, contentType: 'application/json' })

    expect(Array.isArray(diag?.errors), 'diag.errors inválido').toBeTruthy()
    expect(Array.isArray(diag?.unhandled), 'diag.unhandled inválido').toBeTruthy()
    expect(Array.isArray(diag?.fetchCalls), 'diag.fetchCalls inválido').toBeTruthy()
  })
})

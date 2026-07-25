import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

function nowId() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

function normalizeBaseUrl(input) {
  const base = String(input || '').trim().replace(/\/+$/, '')
  return base || 'https://connektpay.vercel.app'
}

async function fetchJsonSafe(url, init) {
  const res = await fetch(url, init).catch((e) => ({ __fetch_error: String(e) }))
  if (res && res.__fetch_error) return { ok: false, fetch_error: res.__fetch_error, status: 0, headers: null, body: null }
  const headers = Object.fromEntries(res.headers.entries())
  const text = await res.text().catch(() => '')
  let body = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text || null
  }
  return { ok: res.ok, status: res.status, headers, body }
}

async function runAttempt({ baseUrl, email, password, label, outDir }) {
  const attempt = {
    label,
    baseUrl,
    email,
    startedAt: new Date().toISOString(),
    console: [],
    pageErrors: [],
    requestFailed: [],
    requests: [],
    finalUrl: null,
    dashboardOpened: false,
  }

  const browser = await chromium.launch({ headless: true })
  fs.mkdirSync(outDir, { recursive: true })

  try {
    const context = await browser.newContext()
    const page = await context.newPage()

    page.on('console', (m) => {
      attempt.console.push({ type: m.type(), text: m.text(), location: m.location() })
    })
    page.on('pageerror', (e) => attempt.pageErrors.push({ message: String(e) }))
    page.on('requestfailed', (r) => {
      attempt.requestFailed.push({ url: r.url(), method: r.method(), failure: r.failure()?.errorText ?? null })
    })
    page.on('response', async (r) => {
      const url = r.url()
      if (!url.startsWith(baseUrl) && !url.includes('/auth/v1/token')) return
      const status = r.status()
      if (url.includes('/auth/v1/token') || url.includes('/api/me') || url.includes('/api/onboarding/ensure') || url.includes('/api/dashboard')) {
        const headers = await r.allHeaders().catch(() => ({}))
        let body = null
        try {
          body = await r.json()
        } catch {
          body = null
        }
        if (url.includes('/auth/v1/token') && status === 200 && body && typeof body === 'object') {
          const safe = {
            token_type: body.token_type ?? null,
            expires_in: body.expires_in ?? null,
            expires_at: body.expires_at ?? null,
            user: body.user ? { id: body.user.id ?? null, email: body.user.email ?? null, user_metadata: body.user.user_metadata ?? null } : null,
          }
          attempt.requests.push({ url, status, headers, body: safe })
          return
        }
        attempt.requests.push({ url, status, headers, body })
      }
    })

    const loginUrl = `${baseUrl}/login`
    await page.goto(loginUrl, { waitUntil: 'domcontentloaded' })
    const formInputs = page.locator('form input')
    try {
      await formInputs.nth(0).waitFor({ state: 'visible', timeout: 45_000 })
      await formInputs.nth(0).fill(email)
      await formInputs.nth(1).waitFor({ state: 'visible', timeout: 45_000 })
      await formInputs.nth(1).fill(password)
    } catch (e) {
      const html = await page.content().catch(() => null)
      attempt.domSnapshot = html ? String(html).slice(0, 20_000) : null
      await page.screenshot({ path: path.join(outDir, `${label.replace(/\W+/g, '_').toLowerCase()}-dom-timeout.png`), fullPage: true }).catch(() => {})
      throw e
    }

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => null),
      page.getByRole('button', { name: /Entrar na conta/i }).click(),
    ])

    await page.waitForURL((u) => u.toString().includes('/dashboard') || u.toString().includes('/login'), { timeout: 45_000 }).catch(() => null)
    attempt.finalUrl = page.url()
    attempt.dashboardOpened = attempt.finalUrl.includes('/dashboard')
    if (!attempt.dashboardOpened) {
      await page.screenshot({ path: path.join(outDir, `${label.replace(/\W+/g, '_').toLowerCase()}-failed.png`), fullPage: true }).catch(() => {})
    }

    await context.close().catch(() => {})
  } finally {
    await browser.close().catch(() => {})
  }

  return attempt
}

const baseUrl = normalizeBaseUrl(process.env.BASE_URL || 'https://connektpay.vercel.app')
const outDir = path.join(process.cwd(), 'test-results', `prod-login-diagnostics-${nowId()}`)
fs.mkdirSync(outDir, { recursive: true })

const validEmail = process.env.LOGIN_EMAIL || 'qa.owner@connektpay.com'
const validPassword = process.env.LOGIN_PASSWORD || 'QaOwner@2026!'

const invalidEmail = process.env.INVALID_EMAIL || `invalid.${Date.now()}@connektpay.com`
const invalidPassword = process.env.INVALID_PASSWORD || 'Invalid@123!'

const preflight = {
  baseUrl,
  startedAt: new Date().toISOString(),
  loginPage: await fetchJsonSafe(`${baseUrl}/login`, { redirect: 'manual' }),
  apiMe: await fetchJsonSafe(`${baseUrl}/api/me`, { redirect: 'manual', headers: { accept: 'application/json' } }),
  apiDashboard: await fetchJsonSafe(`${baseUrl}/api/dashboard`, { redirect: 'manual', headers: { accept: 'application/json' } }),
  apiEnsure: await fetchJsonSafe(`${baseUrl}/api/onboarding/ensure`, { redirect: 'manual', method: 'POST', headers: { accept: 'application/json' } }),
}

const attempts = []
attempts.push(await runAttempt({ baseUrl, label: 'invalid_credentials', email: invalidEmail, password: invalidPassword, outDir }))
attempts.push(await runAttempt({ baseUrl, label: 'valid_credentials', email: validEmail, password: validPassword, outDir }))

const summary = { preflight, attempts }
fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2))
process.stdout.write(`PROD_LOGIN_DIAGNOSTICS_DONE\n${outDir}\n`)

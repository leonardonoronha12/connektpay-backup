import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

function parseEnvLocal(filePath) {
  const txt = fs.readFileSync(filePath, 'utf8')
  const env = {}
  for (const raw of txt.split(/\r?\n/)) {
    const m = raw.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!m) continue
    const key = m[1]
    let val = m[2].trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1)
    env[key] = val
  }
  return env
}

function normalizeBaseUrl(input) {
  const base = String(input || '').trim().replace(/\/+$/, '')
  return base || 'https://connektpay.vercel.app'
}

const env = parseEnvLocal(path.join(process.cwd(), '.env.local'))
const baseUrl = normalizeBaseUrl(process.env.BASE_URL || env.BASE_URL || 'https://connektpay.vercel.app')
const email = env.E2E_EMAIL
const password = env.E2E_PASSWORD

if (!email || !password) {
  process.stderr.write('Missing E2E_EMAIL or E2E_PASSWORD in .env.local\n')
  process.exit(2)
}

const endpoints = [
  '/api/ledger',
  '/api/anticipation',
  '/api/payouts',
  '/api/kyc-requests',
  '/api/events',
  '/api/admin/anticipation',
  '/api/reconciliation',
  '/api/audit-logs',
  '/api/organization',
  '/api/integrations/api-keys',
  '/api/integrations/tokens',
  '/api/provider-settings',
]

const routes = [
  '/dashboard',
  '/ledger',
  '/antecipacao',
  '/repasses',
  '/admin/aprovacao-kyc',
  '/admin/eventos',
  '/admin/anticipation',
  '/admin/conciliacao',
  '/admin/auditoria',
  '/configuracoes',
  '/configuracoes/integracoes',
]

const errorTexts = [
  'Ocorreu um erro',
  'Falha ao carregar',
  'Internal Server Error',
  'Não foi possível concluir sua solicitação',
  'Não foi possível carregar',
]

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext()
const page = await context.newPage()

try {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' })
  const emailInput = page.locator('input[type="email"], input[name="email"], input[autocomplete="email"]').first()
  const passwordInput = page.locator('input[type="password"], input[name="password"], input[autocomplete="current-password"]').first()
  await emailInput.waitFor({ timeout: 30_000 })
  await emailInput.fill(email)
  await passwordInput.fill(password)

  const submit =
    page.getByRole('button', { name: /Entrar|Login/i }).first().or(page.locator('button[type="submit"]').first())
  await submit.click()
  await page.waitForURL(new RegExp(`${baseUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/(dashboard|ledger|antecipacao|repasses|admin|configuracoes)`), {
    timeout: 30_000,
  })

  const ui = []
  for (const r of routes) {
    await page.goto(`${baseUrl}${r}`, { waitUntil: 'domcontentloaded' })
    const hits = []
    for (const t of errorTexts) {
      const n = await page.locator(`text=${t}`).count()
      if (n > 0) hits.push(t)
    }
    ui.push({ route: r, ok: hits.length === 0, hits })
  }

  const results = []
  for (const ep of endpoints) {
    const url = `${baseUrl}${ep}`
    const res = await context.request.get(url)
    const status = res.status()
    let body = null
    try {
      const ct = (res.headers()['content-type'] || '').toLowerCase()
      if (ct.includes('application/json')) body = await res.json()
    } catch {
      body = null
    }
    results.push({ endpoint: ep, status, bodyKeys: body && typeof body === 'object' ? Object.keys(body) : [] })
  }

  const lines = []
  lines.push(`BASE_URL ${baseUrl}`)
  lines.push('')
  lines.push('UI')
  lines.push(`ROUTES ${ui.length}/${routes.length}`)
  for (const r of ui) {
    lines.push(`${r.ok ? 'OK' : 'FAIL'} ${r.route}${r.hits.length ? ` | ${r.hits.join(' | ')}` : ''}`)
  }
  lines.push('')
  lines.push('API')
  lines.push(`ENDPOINTS ${results.length}/${endpoints.length}`)
  const anticipation = results.find((r) => r.endpoint === '/api/anticipation') || null
  if (anticipation) lines.push(`ANTICIPATION_STATUS ${anticipation.status}`)
  let i = 1
  for (const r of results) {
    lines.push(`${i}. ${r.status} GET ${r.endpoint}${r.bodyKeys.length ? ` | keys: ${r.bodyKeys.join(', ')}` : ''}`)
    i += 1
  }
  process.stdout.write(lines.join('\n'))
} finally {
  await browser.close()
}

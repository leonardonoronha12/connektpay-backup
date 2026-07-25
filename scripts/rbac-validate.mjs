import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'

function parseEnvLocal(filePath) {
  const txt = fs.readFileSync(filePath, 'utf8')
  const env = {}
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const i = line.indexOf('=')
    if (i < 0) continue
    const key = line.slice(0, i).trim()
    let val = line.slice(i + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1)
    env[key] = val
  }
  return env
}

function normalizeBaseUrl(input) {
  const base = String(input || '').trim().replace(/\/+$/, '')
  return base || 'https://connektpay.vercel.app'
}

function parseSupabaseRef(supabaseUrl) {
  const u = new URL(supabaseUrl)
  const host = u.hostname
  const ref = host.split('.')[0]
  if (!ref) throw new Error('Invalid NEXT_PUBLIC_SUPABASE_URL (missing project ref)')
  return ref
}

function cookieNameForSupabase(supabaseUrl) {
  const ref = parseSupabaseRef(supabaseUrl)
  return `sb-${ref}-auth-token`
}

function cookieValueFromSession(session) {
  const expires_at = typeof session?.expires_at === 'number' ? session.expires_at : Math.floor(Date.now() / 1000) + 3600
  const expires_in = typeof session?.expires_in === 'number' ? session.expires_in : Math.max(0, expires_at - Math.floor(Date.now() / 1000))
  const payload = {
    access_token: session?.access_token,
    refresh_token: session?.refresh_token,
    expires_in,
    expires_at,
    token_type: session?.token_type || 'bearer',
    user: null,
  }
  return { value: `base64-${Buffer.from(JSON.stringify(payload)).toString('base64')}`, expires: expires_at }
}

async function sessionCookieForEmail({ admin, anon, email, cookieName, baseUrl }) {
  const gen = await admin.auth.admin.generateLink({ type: 'magiclink', email, options: { redirectTo: `${baseUrl}/login` } })
  if (gen.error) throw gen.error
  const token_hash = gen.data?.properties?.hashed_token
  if (!token_hash) throw new Error(`Missing hashed_token for ${email}`)

  const verified = await anon.auth.verifyOtp({ type: 'magiclink', token_hash })
  if (verified.error) throw verified.error
  const session = verified.data?.session
  if (!session?.access_token || !session?.refresh_token) throw new Error(`Missing session tokens for ${email}`)

  const { value, expires } = cookieValueFromSession(session)
  return { name: cookieName, value, expires }
}

function classifyAccess(expected, gotOk) {
  if (expected === gotOk) return 'OK'
  if (expected && !gotOk) return 'ALERTA (deveria acessar)'
  if (!expected && gotOk) return 'ALERTA (acesso indevido)'
  return 'ALERTA'
}

const env = parseEnvLocal(path.join(process.cwd(), '.env.local'))
const baseUrl = normalizeBaseUrl(process.env.BASE_URL || env.BASE_URL || 'https://connektpay.vercel.app')
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceKey || !anonKey) {
  process.stderr.write('Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY in .env.local\n')
  process.exit(2)
}

const cookieName = cookieNameForSupabase(supabaseUrl)
const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
const anon = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })

const users = {
  Owner: 'qa.owner@connektpay.com',
  Admin: 'qa.admin@connektpay.com',
  Financeiro: 'qa.financeiro@connektpay.com',
}

const screens = [
  { tela: 'Dashboard', path: '/dashboard' },
  { tela: 'Transações', path: '/transacoes' },
  { tela: 'Links de Pagamento', path: '/links-pagamento' },
  { tela: 'Novo Link de Pagamento', path: '/links-pagamento/novo' },
  { tela: 'Recebedores', path: '/recebedores' },
  { tela: 'Assinaturas (Resumo)', path: '/assinaturas' },
  { tela: 'Assinaturas', path: '/subscriptions' },
  { tela: 'Planos', path: '/subscriptions/plans' },
  { tela: 'Novo Plano', path: '/subscriptions/new' },
  { tela: 'Ledger', path: '/ledger' },
  { tela: 'Antecipação', path: '/antecipacao' },
  { tela: 'Repasses', path: '/repasses' },
  { tela: 'Configurações', path: '/configuracoes' },
  { tela: 'Configurações · Integrações', path: '/configuracoes/integracoes' },
  { tela: 'Configurações · Provedor', path: '/configuracoes/provedor' },
  { tela: 'Admin · Painel', path: '/admin/painel' },
  { tela: 'Admin · Aprovação KYC', path: '/admin/aprovacao-kyc' },
  { tela: 'Admin · Eventos', path: '/admin/eventos' },
  { tela: 'Admin · Antecipações', path: '/admin/anticipation' },
  { tela: 'Admin · Conciliação', path: '/admin/conciliacao' },
  { tela: 'Admin · Auditoria', path: '/admin/auditoria' },
  { tela: 'Admin · Provedor Financeiro', path: '/admin/provedor-financeiro' },
]

const expectedScreens = {
  Owner: new Set(screens.map((s) => s.path)),
  Admin: new Set([
    '/dashboard',
    '/transacoes',
    '/links-pagamento',
    '/links-pagamento/novo',
    '/recebedores',
    '/assinaturas',
    '/subscriptions',
    '/subscriptions/plans',
    '/subscriptions/new',
    '/admin/painel',
    '/admin/aprovacao-kyc',
    '/admin/eventos',
    '/admin/anticipation',
    '/admin/conciliacao',
    '/admin/auditoria',
  ]),
  Financeiro: new Set([
    '/dashboard',
    '/transacoes',
    '/assinaturas',
    '/subscriptions',
    '/ledger',
    '/antecipacao',
    '/repasses',
    '/admin/conciliacao',
  ]),
}

const apiChecks = [
  { api: '/api/provider-settings', method: 'GET' },
  { api: '/api/integrations/api-keys', method: 'GET' },
  { api: '/api/integrations/tokens', method: 'GET' },
  { api: '/api/audit-logs', method: 'GET' },
  { api: '/api/events', method: 'GET' },
  { api: '/api/kyc-requests', method: 'GET' },
  { api: '/api/anticipation', method: 'GET' },
  { api: '/api/anticipation/simulate', method: 'POST', body: {} },
  { api: '/api/ledger', method: 'GET' },
  { api: '/api/reconciliation', method: 'GET' },
  { api: '/api/receivers', method: 'GET' },
  { api: '/api/payment-links', method: 'GET' },
  { api: '/api/payouts', method: 'GET' },
]

const expectedApis = {
  Owner: {
    '/api/provider-settings': 200,
    '/api/integrations/api-keys': 200,
    '/api/integrations/tokens': 200,
    '/api/audit-logs': 200,
    '/api/events': 200,
    '/api/kyc-requests': 200,
    '/api/anticipation': 200,
    '/api/anticipation/simulate': 200,
    '/api/ledger': 200,
    '/api/reconciliation': 200,
    '/api/receivers': 200,
    '/api/payment-links': 200,
    '/api/payouts': 200,
  },
  Admin: {
    '/api/provider-settings': 403,
    '/api/integrations/api-keys': 403,
    '/api/integrations/tokens': 403,
    '/api/audit-logs': 200,
    '/api/events': 200,
    '/api/kyc-requests': 200,
    '/api/anticipation': 403,
    '/api/anticipation/simulate': 403,
    '/api/ledger': 403,
    '/api/reconciliation': 200,
    '/api/receivers': 200,
    '/api/payment-links': 200,
    '/api/payouts': 403,
  },
  Financeiro: {
    '/api/provider-settings': 403,
    '/api/integrations/api-keys': 403,
    '/api/integrations/tokens': 403,
    '/api/audit-logs': 403,
    '/api/events': 403,
    '/api/kyc-requests': 403,
    '/api/anticipation': 200,
    '/api/anticipation/simulate': 200,
    '/api/ledger': 200,
    '/api/reconciliation': 200,
    '/api/receivers': 403,
    '/api/payment-links': 403,
    '/api/payouts': 200,
  },
}

const browser = await chromium.launch({ headless: true })
const roleResults = {}

for (const [roleName, email] of Object.entries(users)) {
  const cookie = await sessionCookieForEmail({ admin, anon, email, cookieName, baseUrl })
  const context = await browser.newContext()

  const page = await context.newPage()
  await context.addCookies([
    {
      name: cookie.name,
      value: cookie.value,
      domain: new URL(baseUrl).hostname,
      path: '/',
      httpOnly: false,
      secure: new URL(baseUrl).protocol === 'https:',
      sameSite: 'Lax',
      expires: cookie.expires,
    },
  ])
  await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'domcontentloaded' })
  await page.waitForURL((u) => u.pathname === '/dashboard' || u.pathname === '/login', { timeout: 45000 }).catch(() => null)
  if (page.url().includes('/login')) throw new Error(`Login failed for ${roleName}`)

  const sidebarMustHave =
    roleName === 'Owner'
      ? ['Configurações', 'Integrações', 'Provedor Financeiro']
      : roleName === 'Admin'
        ? ['Transações', 'Recebedores', 'Painel']
        : ['Ledger', 'Antecipação', 'Repasses']

  await page.waitForFunction(() => document.querySelectorAll('aside nav button').length > 0, null, { timeout: 15000 }).catch(() => null)
  await page
    .waitForFunction(
      (expected) => {
        const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        const text = Array.from(document.querySelectorAll('aside nav button'))
          .map((b) => norm(b.textContent || ''))
          .join('\n')
        return Array.isArray(expected) && expected.every((t) => text.includes(norm(t)))
      },
      sidebarMustHave,
      { timeout: 15000 },
    )
    .catch(() => null)

  const sidebarItems = await page
    .evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('aside nav button'))
      return buttons.map((b) => (b.textContent || '').trim()).filter(Boolean)
    })
    .catch(() => [])

  const matrix = {}
  for (const s of screens) {
    const url = `${baseUrl}${s.path}`
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle').catch(() => null)
    const finalUrl = page.url()
    const finalPath = (() => {
      try {
        return new URL(finalUrl).pathname
      } catch {
        return finalUrl
      }
    })()

    const ok = finalPath === s.path || finalPath.startsWith(`${s.path}/`)
    matrix[s.path] = { ok, finalPath }
  }

  const apiStatuses = {}
  for (const check of apiChecks) {
    const url = `${baseUrl}${check.api}`
    const res =
      check.method === 'POST'
        ? await context.request
            .post(url, { data: JSON.stringify(check.body ?? {}), headers: { 'content-type': 'application/json' } })
            .catch(() => null)
        : await context.request.get(url).catch(() => null)
    apiStatuses[check.api] = { status: res ? res.status() : 0 }
  }

  roleResults[roleName] = { sidebar: sidebarItems, matrix, apis: apiStatuses }
  await context.close()
}

await browser.close()

const rows = screens.map((s) => {
  const out = { tela: `${s.tela} (${s.path})` }
  for (const roleName of Object.keys(users)) {
    out[roleName] = roleResults[roleName]?.matrix?.[s.path]?.ok ? 'SIM' : 'NÃO'
  }

  const exp = {
    Owner: expectedScreens.Owner.has(s.path),
    Admin: expectedScreens.Admin.has(s.path),
    Financeiro: expectedScreens.Financeiro.has(s.path),
  }
  const got = {
    Owner: roleResults.Owner.matrix[s.path].ok,
    Admin: roleResults.Admin.matrix[s.path].ok,
    Financeiro: roleResults.Financeiro.matrix[s.path].ok,
  }

  const status = [classifyAccess(exp.Owner, got.Owner), classifyAccess(exp.Admin, got.Admin), classifyAccess(exp.Financeiro, got.Financeiro)]
  const resultado = status.every((x) => x === 'OK')
    ? 'OK'
    : `ALERTA (${status.filter((x) => x !== 'OK').join('; ')} | final: Owner=${roleResults.Owner.matrix[s.path].finalPath}, Admin=${roleResults.Admin.matrix[s.path].finalPath}, Financeiro=${roleResults.Financeiro.matrix[s.path].finalPath})`

  return { tela: out.tela, Owner: out.Owner, Admin: out.Admin, Financeiro: out.Financeiro, Resultado: resultado }
})

const apiRows = apiChecks.map((check) => {
  const api = check.api
  const gotOwner = roleResults.Owner.apis[api]?.status ?? 0
  const gotAdmin = roleResults.Admin.apis[api]?.status ?? 0
  const gotFin = roleResults.Financeiro.apis[api]?.status ?? 0
  const expOwner = expectedApis.Owner[api]
  const expAdmin = expectedApis.Admin[api]
  const expFin = expectedApis.Financeiro[api]
  const ok = gotOwner === expOwner && gotAdmin === expAdmin && gotFin === expFin
  return { api, Owner: gotOwner, Admin: gotAdmin, Financeiro: gotFin, Resultado: ok ? 'OK' : `ALERTA (esperado: ${expOwner}/${expAdmin}/${expFin})` }
})

const sidebarOk = (() => {
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const finance = norm(roleResults.Financeiro.sidebar.join('\n'))
  const admin = norm(roleResults.Admin.sidebar.join('\n'))
  const owner = norm(roleResults.Owner.sidebar.join('\n'))

  const financeForbidden = ['integrações', 'configurações', 'recebedores', 'links de pagamento', 'aprovação kyc', 'eventos', 'auditoria', 'provedor financeiro', 'painel', 'antecipações'].map(norm)
  const adminForbidden = ['integrações', 'provedor financeiro', 'ledger', 'antecipação', 'repasses'].map(norm)

  const financeOk = financeForbidden.every((t) => !finance.includes(t))
  const adminOk = adminForbidden.every((t) => !admin.includes(t))
  const ownerOk = ['configurações', 'integrações', 'provedor financeiro'].map(norm).every((t) => owner.includes(t))

  return { ok: financeOk && adminOk && ownerOk, details: { financeOk, adminOk, ownerOk } }
})()

const pageAlerts = rows.filter((r) => r.Resultado !== 'OK')
const apiAlerts = apiRows.filter((r) => r.Resultado !== 'OK')

const rbacReady = pageAlerts.length === 0 && apiAlerts.length === 0 && sidebarOk.ok

const mdLines = []
mdLines.push('# RBAC - Validação (QA)')
mdLines.push('')
mdLines.push(`Matriz gerada a partir de validação automatizada no ambiente (\`${baseUrl}\`) com os usuários:`)
mdLines.push('')
mdLines.push(`- ${users.Owner}`)
mdLines.push(`- ${users.Admin}`)
mdLines.push(`- ${users.Financeiro}`)
mdLines.push('')
mdLines.push('## Matriz de Telas')
mdLines.push('')
mdLines.push('Tela | Owner | Admin | Financeiro | Resultado')
mdLines.push('---|---|---|---|---')
for (const r of rows) mdLines.push(`${r.tela} | ${r.Owner} | ${r.Admin} | ${r.Financeiro} | ${r.Resultado}`)
mdLines.push('')
mdLines.push('## Sidebar')
mdLines.push('')
mdLines.push(`- Sidebar muda conforme o perfil: ${sidebarOk.ok ? 'SIM' : 'NÃO'}`)
mdLines.push(`- Owner items: ${roleResults.Owner.sidebar.join(', ') || '—'}`)
mdLines.push(`- Admin items: ${roleResults.Admin.sidebar.join(', ') || '—'}`)
mdLines.push(`- Financeiro items: ${roleResults.Financeiro.sidebar.join(', ') || '—'}`)
mdLines.push('')
mdLines.push('## APIs (RBAC)')
mdLines.push('')
mdLines.push('API | Owner | Admin | Financeiro | Resultado')
mdLines.push('---|---|---|---|---')
for (const r of apiRows) mdLines.push(`${r.api} | ${r.Owner} | ${r.Admin} | ${r.Financeiro} | ${r.Resultado}`)
mdLines.push('')

fs.writeFileSync(path.join(process.cwd(), 'RBAC-VALIDACAO.md'), `${mdLines.join('\n')}\n`)

process.stdout.write(
  JSON.stringify(
    {
      baseUrl,
      screensChecked: screens.length,
      apisChecked: apiChecks.length,
      sidebarOk,
      alerts: { pages: pageAlerts.length, apis: apiAlerts.length },
      rbacReady,
    },
    null,
    2,
  ) + '\n',
)

process.exit(rbacReady ? 0 : 1)

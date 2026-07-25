import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'

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

async function findUserByEmail(admin, email) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const list = Array.isArray(data?.users) ? data.users : []
    const hit = list.find((u) => String(u.email || '').toLowerCase() === String(email).toLowerCase())
    if (hit) return hit
    if (list.length < 200) break
  }
  return null
}

const env = parseEnvLocal(path.join(process.cwd(), '.env.local'))
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY

const baseUrl = normalizeBaseUrl(process.env.BASE_URL || env.BASE_URL || 'https://connektpay.vercel.app')

const qaOwnerEmail = process.env.QA_OWNER_EMAIL || env.QA_OWNER_EMAIL || 'qa.owner@connektpay.com'
const qaAdminEmail = process.env.QA_ADMIN_EMAIL || env.QA_ADMIN_EMAIL || 'qa.admin@connektpay.com'
const qaFinanceiroEmail = process.env.QA_FINANCEIRO_EMAIL || env.QA_FINANCEIRO_EMAIL || 'qa.financeiro@connektpay.com'

const qaOwnerPassword = process.env.QA_OWNER_PASSWORD || env.QA_OWNER_PASSWORD || 'QaOwner@2026!'
const qaAdminPassword = process.env.QA_ADMIN_PASSWORD || env.QA_ADMIN_PASSWORD || 'QaAdmin@2026!'
const qaFinanceiroPassword = process.env.QA_FINANCEIRO_PASSWORD || env.QA_FINANCEIRO_PASSWORD || 'QaFin@2026!'

if (!supabaseUrl || !serviceKey) {
  process.stderr.write('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local\n')
  process.exit(2)
}

const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

const users = [
  { label: 'Owner', email: qaOwnerEmail, password: qaOwnerPassword, role: 'owner', fullName: 'QA Owner' },
  { label: 'Admin', email: qaAdminEmail, password: qaAdminPassword, role: 'admin', fullName: 'QA Admin' },
  { label: 'Financeiro', email: qaFinanceiroEmail, password: qaFinanceiroPassword, role: 'financeiro', fullName: 'QA Financeiro' },
]

const results = []
let ownerOrgId = null

for (const u of users) {
  const existing = await findUserByEmail(admin, u.email)

  const before = existing
    ? {
        id: existing.id,
        email_confirmed_at: existing.email_confirmed_at ?? null,
        banned_until: existing.banned_until ?? null,
        last_sign_in_at: existing.last_sign_in_at ?? null,
      }
    : null

  let userId = existing?.id ?? null
  if (!existing) {
    const created = await admin.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
      user_metadata: { role: u.role, full_name: u.fullName },
    })
    if (created.error || !created.data?.user?.id) {
      results.push({ label: u.label, email: u.email, ok: false, error: created.error?.message ?? 'create_failed' })
      continue
    }
    userId = created.data.user.id
  } else {
    const upd = await admin.auth.admin.updateUserById(existing.id, {
      password: u.password,
      email_confirm: true,
      user_metadata: { ...(existing.user_metadata || {}), role: u.role, full_name: u.fullName },
    })
    if (upd.error) {
      results.push({ label: u.label, email: u.email, ok: false, error: upd.error.message ?? String(upd.error) })
      continue
    }
  }

  const afterUser = await findUserByEmail(admin, u.email)
  if (afterUser?.id) {
    const bannedUntil = afterUser.banned_until ?? null
    if (bannedUntil) {
      await admin.auth.admin.updateUserById(afterUser.id, { ban_duration: 'none' }).catch(() => {})
      await admin.auth.admin.updateUserById(afterUser.id, { banned_until: null }).catch(() => {})
    }
  }

  const { data: profile } = await admin.from('profiles').select('id, organization_id, role, email').eq('id', userId).maybeSingle()
  let organizationId = profile?.organization_id ?? null
  if (u.role === 'owner') {
    if (!organizationId) {
      const { data: org, error: orgErr } = await admin
        .from('organizations')
        .insert({ name: 'Connekt Pay — QA', document: null, legal_name: null, segment: null, website: null, status: 'active' })
        .select('id')
        .single()
      if (orgErr) {
        results.push({ label: u.label, email: u.email, ok: false, error: `org_create_failed: ${orgErr.message}` })
        continue
      }
      organizationId = org.id
    }
    ownerOrgId = organizationId
  }

  results.push({
    label: u.label,
    email: u.email,
    ok: true,
    userId,
    before,
    after: {
      id: afterUser?.id ?? userId,
      email_confirmed_at: afterUser?.email_confirmed_at ?? null,
      banned_until: afterUser?.banned_until ?? null,
      last_sign_in_at: afterUser?.last_sign_in_at ?? null,
    },
    profile: { organization_id: organizationId, role: profile?.role ?? null },
  })
}

if (!ownerOrgId) {
  process.stderr.write('Could not detect owner organization_id. Check profiles/organizations.\n')
  process.exit(4)
}

for (const u of users) {
  const r = results.find((x) => x.email === u.email)
  if (!r?.ok || !r.userId) continue
  await admin
    .from('profiles')
    .upsert(
      {
        id: r.userId,
        organization_id: ownerOrgId,
        email: u.email,
        full_name: u.fullName,
        role: u.role,
        phone: null,
      },
      { onConflict: 'id' },
    )
    .throwOnError()

  await admin.auth.admin.updateUserById(r.userId, { user_metadata: { role: u.role, organization_id: ownerOrgId } }).catch(() => {})

  r.profile = { organization_id: ownerOrgId, role: u.role }
}

await admin.from('provider_settings').upsert({ organization_id: ownerOrgId }, { onConflict: 'organization_id' }).throwOnError()

const testOutDir = path.join(process.cwd(), 'test-results', `qa-login-fix-${new Date().toISOString().replace(/[:.]/g, '-')}`)
fs.mkdirSync(testOutDir, { recursive: true })
const browser = await chromium.launch({ headless: true })
try {
  for (const u of users) {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    let loginTested = false
    let dashboardOpened = false
    try {
      await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' })
      await page.locator('input[type="email"]').fill(u.email)
      await page.locator('input[type="password"]').first().fill(u.password)
      loginTested = true
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => null),
        page.getByRole('button', { name: /Entrar na conta/i }).click(),
      ])
      await page.waitForURL((url) => url.toString().includes('/dashboard') || url.toString().includes('/login'), { timeout: 45_000 })
      dashboardOpened = page.url().includes('/dashboard')
      if (!dashboardOpened) {
        await page.screenshot({ path: path.join(testOutDir, `login-failed-${u.role}.png`), fullPage: true }).catch(() => {})
      }
    } catch {
      await page.screenshot({ path: path.join(testOutDir, `login-error-${u.role}.png`), fullPage: true }).catch(() => {})
    } finally {
      const r = results.find((x) => x.email === u.email)
      if (r?.ok) {
        r.login = { tested: loginTested, dashboardOpened }
      }
      await ctx.close().catch(() => {})
    }
  }
} finally {
  await browser.close()
}

process.stdout.write(
  JSON.stringify(
    {
      baseUrl,
      organization_id: ownerOrgId,
      ok: results.every((r) => r.ok) && results.every((r) => r.login?.tested && r.login?.dashboardOpened),
      users: results.map((r) => ({
        email: r.email,
        role: r.profile?.role ?? null,
        organization_id: r.profile?.organization_id ?? null,
        confirmed: !!r.after?.email_confirmed_at,
        banned_until: r.after?.banned_until ?? null,
        login_tested: r.login?.tested ?? false,
        dashboard_opened: r.login?.dashboardOpened ?? false,
      })),
      passwords: {
        [qaOwnerEmail]: qaOwnerPassword,
        [qaAdminEmail]: qaAdminPassword,
        [qaFinanceiroEmail]: qaFinanceiroPassword,
      },
    },
    null,
    2,
  ) + '\n',
)

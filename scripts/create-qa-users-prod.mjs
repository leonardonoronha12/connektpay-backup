import crypto from 'node:crypto'
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

function randomPassword(prefix) {
  const core = crypto.randomBytes(12).toString('base64url')
  return `${prefix}${core}!`
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

async function waitForProfile(admin, userId) {
  for (let i = 0; i < 30; i += 1) {
    const { data } = await admin.from('profiles').select('id, organization_id, role, email, full_name').eq('id', userId).maybeSingle()
    if (data?.id) return data
    await new Promise((r) => setTimeout(r, 300))
  }
  return null
}

async function ensureProviderSettings(admin, organizationId) {
  await admin.from('provider_settings').upsert({ organization_id: organizationId }, { onConflict: 'organization_id' })
}

const env = parseEnvLocal(path.join(process.cwd(), '.env.local'))
const baseUrl = normalizeBaseUrl(process.env.BASE_URL || env.BASE_URL || 'https://connektpay.vercel.app')
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceKey) {
  process.stderr.write('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local\n')
  process.exit(2)
}

const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

const users = [
  { email: 'qa.owner@connektpay.com', role: 'owner', full_name: 'QA Owner' },
  { email: 'qa.admin@connektpay.com', role: 'admin', full_name: 'QA Admin' },
  { email: 'qa.financeiro@connektpay.com', role: 'financeiro', full_name: 'QA Financeiro' },
]

const created = []

let ownerOrgId = null

for (const u of users) {
  const password = randomPassword('Qa@')
  const existing = await findUserByEmail(admin, u.email)

  let user = existing
  if (!user) {
    const res = await admin.auth.admin.createUser({
      email: u.email,
      password,
      email_confirm: true,
      user_metadata: { role: u.role, full_name: u.full_name },
    })
    if (res.error) throw res.error
    user = res.data.user
  } else {
    await admin.auth.admin
      .updateUserById(user.id, { password, email_confirm: true, user_metadata: { ...(user.user_metadata || {}), role: u.role, full_name: u.full_name } })
      .catch(() => {})
  }

  const profile = await waitForProfile(admin, user.id)
  if (!profile?.organization_id) throw new Error(`Profile/org not created for ${u.email}`)

  if (u.role === 'owner') ownerOrgId = profile.organization_id

  created.push({ email: u.email, password, role: u.role, userId: user.id, profileOrgId: profile.organization_id })
}

if (!ownerOrgId) throw new Error('Owner org not created')

for (const u of created) {
  await admin
    .from('profiles')
    .upsert(
      {
        id: u.userId,
        organization_id: ownerOrgId,
        email: u.email,
        full_name: users.find((x) => x.email === u.email)?.full_name ?? null,
        role: u.role,
        phone: null,
      },
      { onConflict: 'id' },
    )
    .throwOnError()

  await admin.from('profiles').update({ organization_id: ownerOrgId, role: u.role }).eq('id', u.userId).throwOnError()

  await admin.auth.admin
    .updateUserById(u.userId, { user_metadata: { role: u.role, organization_id: ownerOrgId } })
    .catch(() => {})
}

await ensureProviderSettings(admin, ownerOrgId)

const shouldValidate = process.env.VALIDATE_UI !== '0'

if (shouldValidate) {
  const browser = await chromium.launch({ headless: true })
  try {
    for (const u of created) {
      const ctx = await browser.newContext()
      const page = await ctx.newPage()
      await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' })
      await page.locator('input[type="email"]').fill(u.email)
      await page.locator('input[type="password"]').first().fill(u.password)
      const tokenWait = page.waitForResponse((r) => r.url().includes('/auth/v1/token') && r.request().method() === 'POST', { timeout: 30_000 })
      await page.getByRole('button', { name: /Entrar/i }).click()
      const tokenRes = await tokenWait
      if (tokenRes.status() >= 400) throw new Error(`Login failed for ${u.email}: token ${tokenRes.status()}`)

      await page.waitForURL('**/dashboard', { waitUntil: 'domcontentloaded', timeout: 60_000 })
      const dash = await page.waitForResponse((r) => r.url().includes('/api/dashboard') && r.request().method() === 'GET', { timeout: 30_000 })
      if (dash.status() === 401) throw new Error(`Dashboard API 401 for ${u.email}`)

      const targetRoute =
        u.role === 'owner'
          ? '/admin/provedor-financeiro'
          : u.role === 'admin'
            ? '/admin/eventos'
            : u.role === 'financeiro'
              ? '/ledger'
              : '/dashboard'
      await page.goto(`${baseUrl}${targetRoute}`, { waitUntil: 'domcontentloaded' })
      if (!page.url().includes(targetRoute)) {
        throw new Error(`Role gate failed for ${u.email}. Expected ${targetRoute} but got ${page.url()}`)
      }
      await ctx.close()
    }
  } finally {
    await browser.close()
  }
}

const printable = created.map((u) => ({ email: u.email, password: u.password, role: u.role, organization_id: ownerOrgId }))
const { data: profiles } = await admin
  .from('profiles')
  .select('id, email, role, organization_id')
  .in(
    'email',
    created.map((u) => u.email),
  )
process.stdout.write(JSON.stringify({ baseUrl, organization_id: ownerOrgId, users: printable, profiles: profiles ?? [] }, null, 2))

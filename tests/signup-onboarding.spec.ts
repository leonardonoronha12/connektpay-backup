import fs from 'node:fs'
import path from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

function loadEnvLocalIfNeeded() {
  const file = path.resolve(process.cwd(), '.env.local')
  if (!fs.existsSync(file)) return
  const raw = fs.readFileSync(file, 'utf8')
  for (const lineRaw of raw.split('\n')) {
    const line = lineRaw.trim()
    if (!line || line.startsWith('#')) continue
    const idx = line.indexOf('=')
    if (idx < 1) continue
    const k = line.slice(0, idx)
    const v = line.slice(idx + 1)
    if (!process.env[k]) process.env[k] = v
  }
}

async function waitFor<T>(fn: () => Promise<T | null>, opts?: { timeoutMs?: number; intervalMs?: number }) {
  const timeoutMs = typeof opts?.timeoutMs === 'number' ? opts.timeoutMs : 15_000
  const intervalMs = typeof opts?.intervalMs === 'number' ? opts.intervalMs : 300
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    const v = await fn().catch(() => null)
    if (v) return v
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  return null
}

async function expectAuthenticatedRequest(page: Page, base: string, method: 'GET' | 'POST', route: string) {
  const url = new URL(route, base).toString()
  const response = method === 'POST'
    ? await page.request.post(url)
    : await page.request.get(url, { headers: { 'cache-control': 'no-store' } })
  expect(response.status(), `${method} ${route} não deve retornar 401`).not.toBe(401)
  return response
}

async function loginForSignup(page: Page, base: string, creds: { email: string; password: string }) {
  const loginResponse = await page.request.post(new URL('/api/auth/login', base).toString(), {
    data: creds,
  })
  const loginPayload = await loginResponse.json().catch(() => null)
  expect(loginResponse.status(), `POST /api/auth/login: ${String(loginPayload?.error ?? '')}`.trim()).toBe(200)

  await expect
    .poll(
      async () => {
        const meResponse = await page.request.get(new URL('/api/me', base).toString(), {
          headers: { 'cache-control': 'no-store' },
        })
        if (!meResponse.ok()) return null
        const mePayload = await meResponse.json().catch(() => null)
        return mePayload?.me?.organizationId ? mePayload.me : null
      },
      { timeout: 30_000, intervals: [250, 500, 1_000] },
    )
    .toBeTruthy()

  const ensureResponse = await page.request.post(new URL('/api/onboarding/ensure', base).toString())
  const ensurePayload = await ensureResponse.json().catch(() => null)
  expect(ensureResponse.status(), `POST /api/onboarding/ensure: ${String(ensurePayload?.error ?? '')}`.trim()).toBe(200)

  await page.goto(`${base}/dashboard`, { waitUntil: 'domcontentloaded' })
  await expect(page).toHaveURL(/\/dashboard/)
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible()
}

test('Cadastro cria profiles + organization (idempotente) e permite abrir Dashboard sem 401', async ({ page }) => {
  test.setTimeout(90_000)
  loadEnvLocalIfNeeded()

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  test.skip(!supabaseUrl || !serviceKey, 'SUPABASE_SERVICE_ROLE_KEY/NEXT_PUBLIC_SUPABASE_URL não configurados para o teste.')

  const admin = createClient(supabaseUrl!, serviceKey!, { auth: { persistSession: false, autoRefreshToken: false } })

  const email = `e2e.signup.${Date.now()}@connektpay.local`
  const password = `Senha@${Date.now()}`

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: 'E2E Signup', role: 'owner' },
  })
  expect(createErr, createErr?.message).toBeNull()
  const user = created.user
  expect(user?.id).toBeTruthy()
  if (!user) throw new Error('Falha ao criar usuário de teste')

  let orgId: string | null = null
  try {
    const profile = await waitFor(async () => {
      const { data } = await admin.from('profiles').select('id, organization_id, role, email').eq('id', user.id).maybeSingle()
      return data ?? null
    })
    expect(profile).toBeTruthy()
    expect(profile?.email).toBe(email)
    expect(String(profile?.role)).toBe('owner')
    expect(profile?.organization_id).toBeTruthy()
    orgId = profile?.organization_id ?? null

    const org = await waitFor(async () => {
      const { data } = await admin.from('organizations').select('id, name, status').eq('id', orgId).maybeSingle()
      return data ?? null
    })
    expect(org).toBeTruthy()

    const base = (process.env.BASE_URL || 'http://localhost:3001').replace(/\/$/, '')
    await loginForSignup(page, base, { email, password })
    await expectAuthenticatedRequest(page, base, 'POST', '/api/onboarding/ensure')
    await expectAuthenticatedRequest(page, base, 'GET', '/api/dashboard')
    await expectAuthenticatedRequest(page, base, 'GET', '/api/transactions')
    await expectAuthenticatedRequest(page, base, 'GET', '/api/receivers')
  } finally {
    if (orgId) {
      await admin.from('organizations').delete().eq('id', orgId)
    } else {
      await admin.from('profiles').delete().eq('id', user.id)
    }
    await admin.auth.admin.deleteUser(user.id)
  }
})

import fs from 'node:fs'
import path from 'node:path'
import { expect, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

type AppRole = 'owner' | 'admin' | 'financeiro' | 'operacional' | 'super_admin'

type BrowserCreds = {
  email: string
  password: string
  cleanup: () => Promise<void>
}

let envLoaded = false

function parseEnvFile(content: string) {
  const out: Record<string, string> = {}
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const idx = line.indexOf('=')
    if (idx < 0) continue
    const key = line.slice(0, idx).trim()
    let value = line.slice(idx + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (key) out[key] = value
  }
  return out
}

export function loadEnvLocalIfNeeded() {
  if (envLoaded) return
  envLoaded = true
  const file = path.resolve(process.cwd(), '.env.local')
  if (!fs.existsSync(file)) return
  const parsed = parseEnvFile(fs.readFileSync(file, 'utf8'))
  for (const [key, value] of Object.entries(parsed)) {
    if (!process.env[key]) process.env[key] = value
  }
}

function readEnv(key: string) {
  loadEnvLocalIfNeeded()
  const value = process.env[key]
  return typeof value === 'string' ? value.trim() : ''
}

async function waitFor<T>(fn: () => Promise<T | null>, opts?: { timeoutMs?: number; intervalMs?: number }) {
  const timeoutMs = typeof opts?.timeoutMs === 'number' ? opts.timeoutMs : 15_000
  const intervalMs = typeof opts?.intervalMs === 'number' ? opts.intervalMs : 250
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const value = await fn().catch(() => null)
    if (value) return value
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  return null
}

async function fillStable(locator: Page['locator'] extends (...args: any[]) => infer T ? T : any, value: string) {
  await locator.waitFor({ state: 'visible', timeout: 30_000 })
  await locator.scrollIntoViewIfNeeded()
  await locator.focus()
  await locator.press('Control+A').catch(() => null)
  await locator.press('Delete').catch(() => null)
  await locator.pressSequentially(value, { delay: 20 })
  await expect.poll(() => locator.inputValue().catch(() => ''), { timeout: 5_000 }).toBe(value)
  await locator.press('Tab').catch(() => null)
  await expect.poll(() => locator.inputValue().catch(() => ''), { timeout: 5_000 }).toBe(value)
}

export function isProductionBase(baseURL: string) {
  return baseURL.replace(/\/$/, '') === 'https://connektpay.vercel.app'
}

export function canAcquireBrowserCreds(baseURL: string) {
  const normalizedBase = baseURL.replace(/\/$/, '')
  if (isProductionBase(normalizedBase)) {
    return Boolean(readEnv('E2E_EMAIL') && readEnv('E2E_PASSWORD'))
  }
  return Boolean(getAdminClient() || (readEnv('E2E_EMAIL') && readEnv('E2E_PASSWORD')))
}

export function getAdminClient() {
  const supabaseUrl = readEnv('NEXT_PUBLIC_SUPABASE_URL')
  const serviceKey = readEnv('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) return null
  return createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

function getAnonClient() {
  const supabaseUrl = readEnv('NEXT_PUBLIC_SUPABASE_URL')
  const anonKey = readEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  if (!supabaseUrl || !anonKey) return null
  return createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function isAppLoginReady(baseURL: string, email: string, password: string) {
  const response = await fetch(new URL('/api/auth/login', baseURL).toString(), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  }).catch(() => null)

  if (!response) return null
  if (!response.ok) return null

  const payload = await response.json().catch(() => null)
  return payload?.ok === true ? true : null
}

export async function getBrowserCreds(baseURL: string, role: AppRole = 'owner'): Promise<BrowserCreds> {
  const normalizedBase = baseURL.replace(/\/$/, '')
  if (isProductionBase(normalizedBase)) {
    const email = readEnv('E2E_EMAIL')
    const password = readEnv('E2E_PASSWORD')
    if (!email || !password) {
      throw new Error('E2E_EMAIL/E2E_PASSWORD não configurados para homologação em produção.')
    }
    return { email, password, cleanup: async () => {} }
  }

  const admin = getAdminClient()
  if (!admin) {
    const email = readEnv('E2E_EMAIL')
    const password = readEnv('E2E_PASSWORD')
    if (!email || !password) {
      throw new Error('Sem credenciais E2E válidas e sem SUPABASE_SERVICE_ROLE_KEY para provisionar usuário temporário.')
    }
    return { email, password, cleanup: async () => {} }
  }

  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const email = `e2e.${role}.${nonce}@connektpay.local`
  const password = `Senha@${Date.now()}`
  const fullName = `E2E ${role} ${nonce}`

  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, role },
  })
  if (created.error || !created.data.user?.id) {
    throw new Error(`Falha ao provisionar usuário E2E temporário: ${created.error?.message ?? 'sem user id'}`)
  }

  const userId = created.data.user.id
  const profile = await waitFor(async () => {
    const response = await admin.from('profiles').select('id, organization_id, role').eq('id', userId).maybeSingle()
    return (response.data as { id: string; organization_id: string | null; role?: string } | null) ?? null
  })
  if (!profile?.organization_id) {
    await admin.auth.admin.deleteUser(userId).catch(() => null)
    throw new Error('Usuário E2E temporário não recebeu profile/organization_id a tempo.')
  }

  if (String(profile.role ?? '') !== role) {
    await admin.from('profiles').update({ role }).eq('id', userId)
  }

  await admin.auth.admin.updateUserById(userId, {
    user_metadata: { full_name: fullName, role },
    app_metadata: { role },
  }).catch(() => null)

  const anon = getAnonClient()
  const ready = await waitFor(async () => {
    if (anon) {
      const result = await anon.auth.signInWithPassword({ email, password })
      if (result.error || !result.data.session) return null
      await anon.auth.signOut().catch(() => null)
    }
    return isAppLoginReady(normalizedBase, email, password)
  }, { timeoutMs: 20_000, intervalMs: 500 })
  if (!ready) {
    try {
      await admin.from('organizations').delete().eq('id', profile.organization_id)
    } catch {
    }
    try {
      await admin.from('profiles').delete().eq('id', userId)
    } catch {
    }
    await admin.auth.admin.deleteUser(userId).catch(() => null)
    throw new Error('Usuário E2E temporário não ficou autenticável pelo contrato real do app a tempo.')
  }

  const organizationId = profile.organization_id
  return {
    email,
    password,
    cleanup: async () => {
      // Cleanup is best-effort: these users and orgs are uniquely generated per run,
      // so the functional test must not block on slow cascade deletions.
      void (async () => {
        await admin.auth.admin.deleteUser(userId).catch(() => null)
        try {
          await admin.from('profiles').delete().eq('id', userId)
        } catch {
        }
        try {
          await admin.from('organizations').delete().eq('id', organizationId)
        } catch {
        }
      })()
    },
  }
}

export async function loginViaUi(
  page: Page,
  baseURL: string,
  creds: { email: string; password: string },
  timeoutMs = 90_000,
  opts?: { allowDashboardFallback?: boolean },
) {
  const base = baseURL.replace(/\/$/, '')
  await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' })
  const emailInput = page.locator('input[type=email], input[autocomplete=email]').first()
  const passwordInput = page.locator('input[type=password], input[autocomplete=current-password], input[name=password]').first()
  const passwordToggle = page.getByRole('button', { name: /Mostrar senha|Ocultar senha/i }).first()
  await passwordToggle.waitFor({ state: 'visible', timeout: 30_000 })
  const hydrated = await waitFor(async () => {
    const emailReady = await emailInput.isEnabled().catch(() => false)
    const passwordReady = await passwordInput.isEnabled().catch(() => false)
    if (!emailReady || !passwordReady) return null
    const before = await passwordToggle.getAttribute('aria-label').catch(() => null)
    if (before === 'Ocultar senha') return true
    await passwordToggle.click().catch(() => null)
    const after = await passwordToggle.getAttribute('aria-label').catch(() => null)
    return after === 'Ocultar senha' || after === 'Mostrar senha' ? true : null
  }, { timeoutMs: 30_000, intervalMs: 250 })
  expect(hydrated, 'Tela de login hidratada antes do submit').toBeTruthy()
  const toggledLabel = await passwordToggle.getAttribute('aria-label')
  if (toggledLabel === 'Ocultar senha') {
    await passwordToggle.click()
    await expect(passwordToggle).toHaveAttribute('aria-label', 'Mostrar senha')
  }
  await fillStable(emailInput, creds.email)
  await fillStable(passwordInput, creds.password)

  const waitForServerSession = async (timeout: number) => {
    const sessionReady = await waitFor(async () => {
      const mePayload = await page.evaluate(async () => {
        const response = await fetch('/api/me', {
          method: 'GET',
          cache: 'no-store',
          headers: { 'cache-control': 'no-store' },
        }).catch(() => null)
        if (!response?.ok) return null
        const json = await response.json().catch(() => null)
        return json?.me?.organizationId ? json.me : null
      }).catch(() => null)
      return mePayload
    }, { timeoutMs: timeout, intervalMs: 500 })
    return Boolean(sessionReady)
  }

  await page.getByRole('button', { name: 'Entrar na conta' }).click()

  try {
    await expect
      .poll(() => page.url(), { timeout: opts?.allowDashboardFallback ? Math.min(timeoutMs, 12_000) : timeoutMs })
      .toContain('/dashboard')
  } catch (error) {
    if (!opts?.allowDashboardFallback) throw error

    const sessionReady = await waitForServerSession(Math.min(timeoutMs, 20_000))
    if (!sessionReady) throw error

    const ensureResult = await page.evaluate(async () => {
      const res = await fetch('/api/onboarding/ensure', { method: 'POST' }).catch(() => null)
      const json = await res?.json().catch(() => null)
      return { ok: Boolean(res?.ok), status: res?.status ?? 0, json }
    })
    if (!ensureResult.ok) {
      throw new Error(`Login aceito, mas /api/onboarding/ensure falhou com status ${ensureResult.status}: ${String(ensureResult.json?.error ?? 'sem detalhe')}`)
    }

    await page.goto(`${base}/dashboard`, { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/dashboard/, { timeout: timeoutMs })
  }
  await page.getByRole('heading', { level: 1, name: 'Dashboard' }).waitFor({ state: 'visible', timeout: timeoutMs })
}

export async function closeAssistantIfVisible(page: Page, opts?: { waitForAutoOpen?: boolean }) {
  const minimize = page.getByLabel('Minimizar assistente')
  if (opts?.waitForAutoOpen) {
    const deadline = Date.now() + 1_500
    while (Date.now() < deadline) {
      if (await minimize.isVisible().catch(() => false)) break
      await page.waitForTimeout(100)
    }
  }
  if (await minimize.isVisible().catch(() => false)) {
    await minimize.click()
    await minimize.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => null)
    await page.waitForTimeout(150)
  }
}

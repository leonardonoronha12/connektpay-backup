import { test, expect, type Page } from '@playwright/test'
import fs from 'node:fs'

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
  await page.goto(`${baseURL}/login`, { waitUntil: 'domcontentloaded' })
  await page.locator('input[type=email], input[autocomplete=email]').first().fill(email)
  await page.locator('input[type=password], input[autocomplete=current-password], input[name=password]').first().fill(password)
  await page.getByRole('button', { name: 'Entrar na conta' }).click()
  await page.getByRole('heading', { level: 1, name: 'Dashboard' }).waitFor({ state: 'visible', timeout: 90_000 })
}

test.describe('Homologação Cezar - Login', () => {
  test('login funciona e /login redireciona com sessão ativa', async ({ page, baseURL }) => {
    test.setTimeout(180_000)
    const base = (baseURL || process.env.BASE_URL || '').replace(/\/$/, '')
    test.skip(base !== 'https://connektpay.vercel.app', `Teste restrito à produção homologada; BASE_URL atual: "${base}"`)

    await login(page, base)
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 90_000 })

    await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 })
    await page.getByRole('heading', { level: 1, name: 'Dashboard' }).waitFor({ state: 'visible', timeout: 30_000 })
  })
})

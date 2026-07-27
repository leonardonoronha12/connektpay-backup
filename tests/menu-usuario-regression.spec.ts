import { expect, test, type Page } from '@playwright/test'
import { closeAssistantIfVisible, getBrowserCreds } from './helpers/e2e-auth'
import { clickUserMenuActionItem, clickUserMenuItemAndWaitForUrl, expectUserMenuClosed, loginWithQaSession, logoutViaUserMenu, openUserMenu, openUserMenuWithKeyboard, pressUserMenuItemAndWaitForUrl } from './helpers/qa-suite'

type AppRole = 'owner' | 'admin' | 'financeiro'
const NEXT_DEV_CLIENT_REFERENCE_MANIFEST_ERROR = 'Invariant: Expected clientReferenceManifest to be defined. This is a bug in Next.js.'

function usesDevRoleCookie(baseURL: string) {
  try {
    const url = new URL(baseURL)
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  } catch {
    return false
  }
}

function isRelevantConsoleMessage(text: string) {
  return text.includes('hydration') || text.includes('Hydration failed') || text.includes('preventDefault')
}

function filterKnownDevRuntimeNoise(pageErrors: string[]) {
  return pageErrors.filter((entry) => !entry.includes(NEXT_DEV_CLIENT_REFERENCE_MANIFEST_ERROR))
}

async function settle(page: Page) {
  await page.waitForLoadState('domcontentloaded').catch(() => null)
  await page.locator('main').waitFor({ state: 'visible', timeout: 15_000 }).catch(() => null)
}

async function expectMyAccountSectionVisible(page: Page) {
  const sectionAnchor = page.locator('#perfil-da-conta')
  const sectionHeading = page.getByText(/^Perfil da conta$/).first()
  await expect
    .poll(
      async () => {
        if (await sectionAnchor.isVisible().catch(() => false)) return true
        return sectionHeading.isVisible().catch(() => false)
      },
      { timeout: 20_000, intervals: [100, 250, 500, 1_000] },
    )
    .toBe(true)
}

async function loginForMenuRegression(
  page: Page,
  baseURL: string,
  creds: { email: string; password: string },
  timeoutMs = 90_000,
) {
  await loginWithQaSession(
    page,
    {
      baseURL,
      email: creds.email,
      password: creds.password,
      cleanup: async () => {},
    },
    timeoutMs,
  )
}

async function assumeRole(page: Page, baseURL: string, role: AppRole) {
  const useDevCookie = usesDevRoleCookie(baseURL)
  await page.context().addCookies([
    useDevCookie
      ? {
          name: 'cp_dev_role',
          value: role,
          url: baseURL,
          sameSite: 'Lax' as const,
        }
      : {
          name: 'cp_role',
          value: role,
          url: baseURL,
          httpOnly: true,
          secure: true,
          sameSite: 'Lax' as const,
        },
  ])
  await page.goto(`${baseURL}/dashboard`, { waitUntil: 'domcontentloaded' })
  await expect
    .poll(
      async () => {
        return page
          .evaluate(async () => {
            const response = await fetch('/api/me', {
              method: 'GET',
              cache: 'no-store',
              headers: { 'cache-control': 'no-store' },
            }).catch(() => null)
            if (!response?.ok) return null
            const json = await response.json().catch(() => null)
            return json?.me?.organizationId ? json.me : null
          })
          .catch(() => null)
      },
      { timeout: 30_000, intervals: [250, 500, 1_000] },
    )
    .toBeTruthy()
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect
    .poll(
      async () => {
        return page
          .evaluate(async () => {
            const response = await fetch('/api/me', {
              method: 'GET',
              cache: 'no-store',
              headers: { 'cache-control': 'no-store' },
            }).catch(() => null)
            if (!response?.ok) return null
            const json = await response.json().catch(() => null)
            return json?.me?.organizationId ? json.me : null
          })
          .catch(() => null)
      },
      { timeout: 30_000, intervals: [250, 500, 1_000] },
    )
    .toBeTruthy()
  await page.locator('main').waitFor({ state: 'visible', timeout: 60_000 }).catch(() => null)
  await page.getByRole('heading', { level: 1, name: 'Dashboard' }).waitFor({ state: 'visible', timeout: 60_000 })
  await expect
    .poll(async () => {
      const cookies = await page.context().cookies()
      if (useDevCookie) return cookies.find((cookie) => cookie.name === 'cp_dev_role')?.value ?? null
      return cookies.find((cookie) => cookie.name === 'cp_role')?.value ?? null
    })
    .toBe(role)
  await settle(page)
}

async function goToDashboard(page: Page, baseURL: string, role: AppRole) {
  await assumeRole(page, baseURL, role)
  await page.getByRole('heading', { level: 1, name: 'Dashboard' }).waitFor({ state: 'visible', timeout: 60_000 })
}

async function assertNoClientErrors(page: Page, errors: string[], pageErrors: string[]) {
  await page.waitForTimeout(250)
  expect(filterKnownDevRuntimeNoise(pageErrors), 'Erros de runtime da página').toEqual([])
  expect(errors, 'Mensagens relevantes de console').toEqual([])
}

test.describe('Menu do usuário — regressão', () => {
  test('owner: ações do menu abrem guia e tour', async ({ page, baseURL }) => {
    test.setTimeout(240_000)
    const base = (baseURL || process.env.BASE_URL || 'http://localhost:3001').replace(/\/$/, '')
    const consoleErrors: string[] = []
    const pageErrors: string[] = []
    const creds = await getBrowserCreds(base)

    page.on('console', (msg) => {
      if (msg.type() !== 'error' && msg.type() !== 'warning') return
      const text = msg.text()
      if (text.includes('Download the React DevTools')) return
      if (isRelevantConsoleMessage(text)) consoleErrors.push(text)
    })
    page.on('pageerror', (error) => pageErrors.push(String(error?.message ?? error)))

    try {
      await loginForMenuRegression(page, base, creds)
      await settle(page)
      await assumeRole(page, base, 'owner')
      await closeAssistantIfVisible(page)

      await openUserMenu(page)
      await clickUserMenuActionItem(page, 'Reabrir guia')
      await expect(page.getByText('Copiloto Connekt')).toBeVisible()

      await openUserMenu(page)
      await clickUserMenuActionItem(page, 'Ver tour guiado')
      await expect(page.getByText(/^Tour guiado:/)).toBeVisible()
      await page.getByRole('button', { name: 'Fechar' }).click()
      await settle(page)

      await assertNoClientErrors(page, consoleErrors, pageErrors)
    } finally {
      await creds.cleanup()
    }
  })

  test('owner: Minha conta e Configurações navegam por mouse e teclado', async ({ page, baseURL }) => {
    test.setTimeout(240_000)
    const base = (baseURL || process.env.BASE_URL || 'http://localhost:3001').replace(/\/$/, '')
    const consoleErrors: string[] = []
    const pageErrors: string[] = []
    const creds = await getBrowserCreds(base)

    page.on('console', (msg) => {
      if (msg.type() !== 'error' && msg.type() !== 'warning') return
      const text = msg.text()
      if (text.includes('Download the React DevTools')) return
      if (isRelevantConsoleMessage(text)) consoleErrors.push(text)
    })
    page.on('pageerror', (error) => pageErrors.push(String(error?.message ?? error)))

    try {
      await loginForMenuRegression(page, base, creds)
      await settle(page)
      await assumeRole(page, base, 'owner')
      await closeAssistantIfVisible(page)

      await openUserMenu(page)
      await clickUserMenuItemAndWaitForUrl(page, 'Minha conta', (url) => url.pathname === '/configuracoes')
      await expectMyAccountSectionVisible(page)

      await goToDashboard(page, base, 'owner')
      await openUserMenu(page)
      await clickUserMenuItemAndWaitForUrl(page, 'Configurações', /\/configuracoes\/integracoes$/)
      await expect(page.getByRole('heading', { level: 1, name: 'Integrações' })).toBeVisible({ timeout: 20_000 })
      await expect.poll(() => page.evaluate(() => window.location.pathname)).toBe('/configuracoes/integracoes')

      await goToDashboard(page, base, 'owner')
      await openUserMenuWithKeyboard(page)
      await pressUserMenuItemAndWaitForUrl(page, 'Minha conta', (url) => url.pathname === '/configuracoes')
      await expectMyAccountSectionVisible(page)

      await assertNoClientErrors(page, consoleErrors, pageErrors)
    } finally {
      await creds.cleanup()
    }
  })

  for (const role of ['admin', 'financeiro'] as const) {
    test(`${role}: Minha conta e Configurações não aparecem`, async ({ page, baseURL }) => {
      test.setTimeout(180_000)
      const base = (baseURL || process.env.BASE_URL || 'http://localhost:3001').replace(/\/$/, '')
      const consoleErrors: string[] = []
      const pageErrors: string[] = []
      const creds = await getBrowserCreds(base)

      page.on('console', (msg) => {
        if (msg.type() !== 'error' && msg.type() !== 'warning') return
        const text = msg.text()
        if (text.includes('Download the React DevTools')) return
        if (isRelevantConsoleMessage(text)) consoleErrors.push(text)
      })
      page.on('pageerror', (error) => pageErrors.push(String(error?.message ?? error)))

      try {
        await loginForMenuRegression(page, base, creds)
        await settle(page)
        await assumeRole(page, base, role)
        await closeAssistantIfVisible(page)

        await openUserMenu(page)
        await expect(page.getByRole('menuitem', { name: 'Minha conta' })).toHaveCount(0)
        await expect(page.getByRole('menuitem', { name: 'Configurações' })).toHaveCount(0)
        await expect(page).toHaveURL(/\/dashboard/)

        await goToDashboard(page, base, role)
        await openUserMenuWithKeyboard(page)
        await expect(page.getByRole('menuitem', { name: 'Minha conta' })).toHaveCount(0)
        await expect(page.getByRole('menuitem', { name: 'Configurações' })).toHaveCount(0)

        await assertNoClientErrors(page, consoleErrors, pageErrors)
      } finally {
        await creds.cleanup()
      }
    })
  }

  test('sair encerra a sessão pelo menu', async ({ page, baseURL }) => {
    test.setTimeout(120_000)
    const base = (baseURL || process.env.BASE_URL || 'http://localhost:3001').replace(/\/$/, '')
    const creds = await getBrowserCreds(base)
    try {
      await loginForMenuRegression(page, base, creds)
      await settle(page)
      await assumeRole(page, base, 'admin')
      await logoutViaUserMenu(page)
      await expect(page.getByRole('heading', { level: 2, name: 'Bem-vindo de volta' })).toBeVisible({ timeout: 90_000 })
    } finally {
      await creds.cleanup()
    }
  })
})

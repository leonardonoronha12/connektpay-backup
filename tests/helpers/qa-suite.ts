import { randomUUID } from 'node:crypto'
import { expect, type Page, type TestInfo } from '@playwright/test'
import { closeAssistantIfVisible, getAdminClient, getBrowserCreds, loadEnvLocalIfNeeded, loginViaUi } from './e2e-auth'

type AppRole = 'owner' | 'admin' | 'financeiro' | 'operacional' | 'super_admin'

export type QaSession = {
  baseURL: string
  email: string
  password: string
  cleanup: () => Promise<void>
}

type QaCapture = {
  consoleErrors: string[]
  pageErrors: string[]
  httpErrors: string[]
  reset: () => void
  stop: () => void
  assertNoUnexpected: (opts?: { allowCheckoutProviderNoise?: boolean }) => Promise<void>
}

type UrlMatcher = string | RegExp | ((url: URL) => boolean)

function normalizeBaseURL(baseURL?: string) {
  const raw = String(baseURL || process.env.BASE_URL || 'http://localhost:3001').replace(/\/$/, '')
  try {
    const parsed = new URL(raw)
    if (parsed.hostname === '127.0.0.1') parsed.hostname = 'localhost'
    return parsed.toString().replace(/\/$/, '')
  } catch {
    return raw
  }
}

async function waitForBrowserSessionReady(page: Page, timeoutMs: number) {
  return expect
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
      { timeout: timeoutMs, intervals: [250, 500, 1_000] },
    )
    .toBeTruthy()
}

export function isMobileProject(testInfo: TestInfo) {
  return testInfo.project.name.toLowerCase().includes('mobile')
}

export function uniqueSuffix() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function uniqueEmail(prefix = 'cliente.demo') {
  return `${prefix}.${uniqueSuffix()}@exemplo.com`
}

export function uniqueName(prefix: string) {
  return `${prefix} ${uniqueSuffix()}`
}

export async function createQaSession(baseURL?: string, role: AppRole = 'owner', opts?: { preferStaticCreds?: boolean }): Promise<QaSession> {
  const normalizedBaseURL = normalizeBaseURL(baseURL)
  if (opts?.preferStaticCreds) {
    loadEnvLocalIfNeeded()
    const email = String(process.env.E2E_EMAIL ?? '').trim()
    const password = String(process.env.E2E_PASSWORD ?? '').trim()
    if (email && password) {
      return {
        baseURL: normalizedBaseURL,
        email,
        password,
        cleanup: async () => {},
      }
    }
  }
  const creds = await getBrowserCreds(normalizedBaseURL, role)
  return {
    baseURL: normalizedBaseURL,
    email: creds.email,
    password: creds.password,
    cleanup: creds.cleanup,
  }
}

export async function loginWithQaSession(page: Page, session: QaSession, timeoutMs = 90_000) {
  const loginResponse = await page.request.post(new URL('/api/auth/login', session.baseURL).toString(), {
    data: {
      email: session.email,
      password: session.password,
    },
  })
  const loginPayload = await loginResponse.json().catch(() => null)
  expect(loginResponse.status(), `POST /api/auth/login: ${String(loginPayload?.error ?? '')}`.trim()).toBe(200)

  const meReady = await expect
    .poll(async () => {
      const meResponse = await page.request.get(new URL('/api/me', session.baseURL).toString(), {
        headers: { 'cache-control': 'no-store' },
      })
      if (!meResponse.ok()) return null
      const mePayload = await meResponse.json().catch(() => null)
      return mePayload?.me?.organizationId ? mePayload.me : null
    }, { timeout: Math.min(timeoutMs, 30_000), intervals: [250, 500, 1_000] })
    .toBeTruthy()

  const ensureResponse = await page.request.post(new URL('/api/onboarding/ensure', session.baseURL).toString())
  const ensurePayload = await ensureResponse.json().catch(() => null)
  expect(ensureResponse.status(), `POST /api/onboarding/ensure: ${String(ensurePayload?.error ?? '')}`.trim()).toBe(200)
  await page.goto(new URL('/dashboard', session.baseURL).toString(), { waitUntil: 'domcontentloaded' })
  await waitForBrowserSessionReady(page, Math.min(timeoutMs, 30_000))
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForBrowserSessionReady(page, Math.min(timeoutMs, 30_000))
  await closeAssistantIfVisible(page)
}

export async function ensureGuestContext(page: Page) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' }).catch(async () => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
  })
  await page.evaluate(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
  }).catch(() => {})
  await page.context().clearCookies()
}

function matchesUrl(currentUrl: string, matcher: UrlMatcher) {
  if (typeof matcher === 'string') return currentUrl.includes(matcher)
  if (matcher instanceof RegExp) return matcher.test(currentUrl)
  try {
    return matcher(new URL(currentUrl))
  } catch {
    return false
  }
}

async function waitForHeaderInteractive(page: Page) {
  const trigger = page.getByLabel('Menu do usuário')
  const main = page.locator('main')
  const guideItem = page.getByRole('menuitem', { name: 'Reabrir guia' })
  await expect
    .poll(
      async () => {
        const mainVisible = await main.isVisible().catch(() => false)
        const visible = await trigger.isVisible().catch(() => false)
        const enabled = await trigger.isEnabled().catch(() => false)
        const hasPopup = await trigger.getAttribute('aria-haspopup').catch(() => null)
        const menuTexts = await trigger.locator('p').allTextContents().catch(() => [])
        const identityReady = menuTexts
          .map((entry) => entry.trim())
          .some((entry) => entry && entry !== 'Minha conta' && entry !== 'Conta ativa' && entry !== '—')
        return mainVisible && visible && enabled && hasPopup === 'menu' && identityReady
      },
      { timeout: 20_000, intervals: [100, 250, 500, 1_000] },
    )
    .toBe(true)
  await expect(main).toBeVisible()
  await expect(trigger).toBeVisible()
  await expect(trigger).toBeEnabled()

  const initialAttempts = Number.parseInt((await trigger.getAttribute('data-user-menu-attempts').catch(() => '0')) ?? '0', 10) || 0
  const alreadyOpen = (await trigger.getAttribute('aria-expanded').catch(() => null)) === 'true' || (await guideItem.isVisible().catch(() => false))
  if (alreadyOpen) return

  await trigger.scrollIntoViewIfNeeded()
  await trigger.click().catch(() => null)

  const becameInteractive = await expect
    .poll(
      async () => {
        const expanded = await trigger.getAttribute('aria-expanded').catch(() => null)
        const attempts = Number.parseInt((await trigger.getAttribute('data-user-menu-attempts').catch(() => '0')) ?? '0', 10) || 0
        const guideVisible = await guideItem.isVisible().catch(() => false)
        return expanded === 'true' || guideVisible || attempts > initialAttempts
      },
      { timeout: 10_000, intervals: [100, 250, 500, 1_000] },
    )
    .toBe(true)
    .then(() => true)
    .catch(() => false)

  if (!becameInteractive) return

  const openedDuringProbe = (await trigger.getAttribute('aria-expanded').catch(() => null)) === 'true' || (await guideItem.isVisible().catch(() => false))
  if (!openedDuringProbe) return

  await page.keyboard.press('Escape').catch(() => null)
  await expect
    .poll(
      async () => {
        const expanded = await trigger.getAttribute('aria-expanded').catch(() => null)
        const guideVisible = await guideItem.isVisible().catch(() => false)
        return expanded === 'false' && !guideVisible
      },
      { timeout: 5_000, intervals: [100, 250, 500, 1_000] },
    )
    .toBe(true)
}

async function waitForCreateLinkScreenInteractive(page: Page) {
  const paymentToggle = page.locator('main button[aria-pressed]').first()
  await expect
    .poll(
      async () => {
        const before = await paymentToggle.getAttribute('aria-pressed').catch(() => null)
        if (before == null) return false
        await paymentToggle.click().catch(() => null)
        const flipped = await paymentToggle.getAttribute('aria-pressed').catch(() => null)
        if (flipped === before || flipped == null) return false
        await paymentToggle.click().catch(() => null)
        const restored = await paymentToggle.getAttribute('aria-pressed').catch(() => null)
        return restored === before
      },
      { timeout: 15_000, intervals: [100, 250, 500, 1_000] },
    )
    .toBe(true)
}

async function waitForUserMenuOpen(trigger: ReturnType<Page['getByLabel']>, guideItem: ReturnType<Page['getByRole']>) {
  await expect
    .poll(
      async () => {
        const expanded = await trigger.getAttribute('aria-expanded').catch(() => null)
        const guideVisible = await guideItem.isVisible().catch(() => false)
        return expanded === 'true' || guideVisible
      },
      { timeout: 3_000, intervals: [100, 250, 500] },
    )
    .toBe(true)
}

async function getVisibleUserMenuRoot(page: Page) {
  const trigger = page.getByLabel('Menu do usuário')
  const userRoot = trigger.locator('xpath=ancestor::*[@data-menu-root][1]')
  const visibleMenu = userRoot.locator('[role="menu"]').last()
  await expect(visibleMenu).toBeVisible()
  return visibleMenu
}

export async function openUserMenu(page: Page) {
  await closeAssistantIfVisible(page, { waitForAutoOpen: true })
  await waitForHeaderInteractive(page)
  const trigger = page.getByLabel('Menu do usuário')
  if ((await trigger.getAttribute('aria-expanded').catch(() => null)) === 'true') {
    await expect(await getVisibleUserMenuRoot(page)).toBeVisible()
    return
  }
  const deadline = Date.now() + 15_000
  let lastExpanded = await trigger.getAttribute('aria-expanded').catch(() => null)
  let lastAttempts = await trigger.getAttribute('data-user-menu-attempts').catch(() => null)
  while (Date.now() < deadline) {
    await trigger.scrollIntoViewIfNeeded()
    await trigger.click()
    const guideItem = page.getByRole('menuitem', { name: 'Reabrir guia' })
    const openedByClick = await waitForUserMenuOpen(trigger, guideItem)
      .then(() => true)
      .catch(() => false)
    if (openedByClick) {
      await expect(await getVisibleUserMenuRoot(page)).toBeVisible()
      return
    }
    await trigger.focus()
    await trigger.press('Enter').catch(() => null)
    const openedByEnter = await waitForUserMenuOpen(trigger, guideItem)
      .then(() => true)
      .catch(() => false)
    if (openedByEnter) {
      await expect(await getVisibleUserMenuRoot(page)).toBeVisible()
      return
    }
    await trigger.press('Space').catch(() => null)
    const openedBySpace = await waitForUserMenuOpen(trigger, guideItem)
      .then(() => true)
      .catch(() => false)
    if (openedBySpace) {
      await expect(await getVisibleUserMenuRoot(page)).toBeVisible()
      return
    }
    await trigger.dispatchEvent('mousedown').catch(() => null)
    await trigger.dispatchEvent('mouseup').catch(() => null)
    await trigger.dispatchEvent('click').catch(() => null)
    const openedByDomEvent = await waitForUserMenuOpen(trigger, guideItem)
      .then(() => true)
      .catch(() => false)
    if (openedByDomEvent) {
      await expect(await getVisibleUserMenuRoot(page)).toBeVisible()
      return
    }
    lastExpanded = await trigger.getAttribute('aria-expanded').catch(() => null)
    lastAttempts = await trigger.getAttribute('data-user-menu-attempts').catch(() => null)
    await page.waitForTimeout(150)
  }
  throw new Error(`Menu do usuário não abriu a tempo. aria-expanded final=${String(lastExpanded)} attempts=${String(lastAttempts)}`)
}

export async function openUserMenuWithKeyboard(page: Page) {
  await closeAssistantIfVisible(page)
  await openUserMenu(page)
}

export async function expectUserMenuClosed(page: Page) {
  await expect
    .poll(
      async () => {
        const trigger = page.getByLabel('Menu do usuário')
        const triggerVisible = await trigger.isVisible().catch(() => false)
        const expanded = await trigger.getAttribute('aria-expanded').catch(() => null)
        const guideVisible = await page.getByRole('menuitem', { name: 'Reabrir guia' }).isVisible().catch(() => false)
        if (!triggerVisible) return !guideVisible
        return expanded === 'false' && !guideVisible
      },
      { timeout: 5_000, intervals: [100, 250, 500, 1_000] },
    )
    .toBe(true)
}

async function getVisibleUserMenuItem(page: Page, itemName: string) {
  const visibleMenu = await getVisibleUserMenuRoot(page)
  const menuItem = visibleMenu.getByRole('menuitem', { name: itemName })
  await expect(menuItem).toBeVisible()
  return menuItem
}

export async function clickUserMenuActionItem(page: Page, itemName: string) {
  const menuItem = await getVisibleUserMenuItem(page, itemName)
  await menuItem.click()
  await expectUserMenuClosed(page)
}

export async function clickUserMenuItemAndWaitForUrl(page: Page, itemName: string, urlMatcher: UrlMatcher) {
  const menuItem = await getVisibleUserMenuItem(page, itemName)
  const href = (await menuItem.getAttribute('href').catch(() => null)) ?? (await menuItem.getAttribute('data-href').catch(() => null))
  const clickedUrl = page.url()
  const waitForMatchedUrl = async (timeout: number) => {
    await expect.poll(() => matchesUrl(page.url(), urlMatcher), { timeout, intervals: [100, 250, 500, 1_000] }).toBe(true)
  }
  const waitForNavigationCommit = (timeout: number) =>
    page.waitForURL((url) => matchesUrl(url.toString(), urlMatcher), { timeout, waitUntil: 'commit' }).catch(() => null)

  await Promise.all([menuItem.click(), waitForNavigationCommit(20_000), waitForMatchedUrl(20_000)]).catch(async () => {
    if (matchesUrl(page.url(), urlMatcher)) return
    if (!href || page.url() !== clickedUrl) {
      await waitForMatchedUrl(5_000)
      return
    }

    const retriedMenuItem = await openUserMenu(page)
      .then(() => getVisibleUserMenuItem(page, itemName))
      .catch(() => null)
    if (retriedMenuItem) {
      const retried = await Promise.all([retriedMenuItem.click().catch(() => null), waitForNavigationCommit(5_000), waitForMatchedUrl(5_000)])
        .then(() => true)
        .catch(() => false)
      if (retried || matchesUrl(page.url(), urlMatcher)) return
    }

    const fallbackUrl = new URL(href, clickedUrl).toString()
    await page.evaluate((url) => {
      window.location.assign(url)
    }, fallbackUrl)
    await waitForMatchedUrl(10_000)
  })
  await page.waitForLoadState('domcontentloaded').catch(() => null)
  await expectUserMenuClosed(page)
}

export async function pressUserMenuItemAndWaitForUrl(page: Page, itemName: string, urlMatcher: UrlMatcher) {
  const menuItem = await getVisibleUserMenuItem(page, itemName)
  const href = (await menuItem.getAttribute('href').catch(() => null)) ?? (await menuItem.getAttribute('data-href').catch(() => null))
  const startingUrl = page.url()
  await menuItem.focus()
  const waitForMatchedUrl = async (timeout: number) => {
    await expect.poll(() => matchesUrl(page.url(), urlMatcher), { timeout, intervals: [100, 250, 500, 1_000] }).toBe(true)
  }
  const waitForNavigationCommit = (timeout: number) =>
    page.waitForURL((url) => matchesUrl(url.toString(), urlMatcher), { timeout, waitUntil: 'commit' }).catch(() => null)

  const navigatedByEnter = await Promise.all([
    menuItem.press('Enter').catch(() => null),
    waitForNavigationCommit(3_000),
    waitForMatchedUrl(3_000),
  ])
    .then(() => true)
    .catch(() => false)
  if (!navigatedByEnter && !matchesUrl(page.url(), urlMatcher)) {
    const visibleAfterEnter = await menuItem.isVisible().catch(() => false)
    const clickTarget = visibleAfterEnter ? menuItem : await openUserMenu(page).then(() => getVisibleUserMenuItem(page, itemName))
    const navigatedByClick = await Promise.all([
      clickTarget.click().catch(() => null),
      waitForNavigationCommit(3_000),
      waitForMatchedUrl(3_000),
    ])
      .then(() => true)
      .catch(() => false)
    if (!navigatedByClick && !matchesUrl(page.url(), urlMatcher)) {
      if (!href || page.url() !== startingUrl) {
        await waitForMatchedUrl(5_000)
      } else {
        const fallbackUrl = new URL(href, startingUrl).toString()
        await page.evaluate((url) => {
          window.location.assign(url)
        }, fallbackUrl)
        await waitForMatchedUrl(10_000)
      }
    }
  }
  await page.waitForLoadState('domcontentloaded').catch(() => null)
  await expectUserMenuClosed(page)
}

async function waitForLoggedOutUi(page: Page) {
  const loginHeading = page.getByRole('heading', { level: 2, name: 'Bem-vindo de volta' })
  const loginButton = page.getByRole('button', { name: 'Entrar na conta' })
  await expect
    .poll(
      async () => {
        if (/\/login(?:[?#]|$)/.test(page.url())) return 'login-url'
        const headingVisible = await loginHeading.isVisible().catch(() => false)
        const buttonVisible = await loginButton.isVisible().catch(() => false)
        return headingVisible && buttonVisible ? 'login-ui' : 'pending'
      },
      { timeout: 20_000, intervals: [100, 250, 500, 1_000] },
    )
    .not.toBe('pending')
}

export async function logoutViaUserMenu(page: Page) {
  await closeAssistantIfVisible(page)
  const performLogout = async (trigger: ReturnType<Page['getByRole']>) => {
    const logoutRequestPromise = page
      .waitForRequest((request) => request.url().includes('/api/auth/logout') && request.method() === 'POST', {
        timeout: 5_000,
      })
      .catch(() => null)
    await trigger.click()
    const logoutRequest = await logoutRequestPromise
    if (!logoutRequest) {
      throw new Error('Clique de logout não iniciou POST /api/auth/logout.')
    }
    await expect
      .poll(async () => (await logoutRequest.response().catch(() => null))?.status() ?? null, {
        timeout: 20_000,
        intervals: [100, 250, 500, 1_000],
      })
      .not.toBeNull()
    const logoutResponse = await logoutRequest.response()
    if (!logoutResponse) {
      throw new Error('POST /api/auth/logout iniciado, mas nenhuma resposta HTTP foi recebida.')
    }
    await waitForLoggedOutUi(page)
    await page.waitForLoadState('domcontentloaded').catch(() => {})
  }
  const userMenuButton = page.getByLabel('Menu do usuário')
  const sidebarLogout = page.locator('aside, [role="complementary"]').getByRole('button', { name: /^Sair$/ }).first()
  const userMenuVisible = await userMenuButton
    .waitFor({ state: 'visible', timeout: 5_000 })
    .then(() => true)
    .catch(() => false)
  if (userMenuVisible) {
    const openedUserMenu = await openUserMenu(page)
      .then(() => true)
      .catch(() => false)
    if (openedUserMenu) {
      const menuLogout = page.getByRole('menuitem', { name: /^Sair/i })
      await menuLogout.waitFor({ state: 'visible', timeout: 3_000 })
      await performLogout(menuLogout)
      return
    }
  }
  await expect(sidebarLogout).toBeVisible({ timeout: 10_000 })
  await sidebarLogout.scrollIntoViewIfNeeded()
  await performLogout(sidebarLogout)
}

export function startQaCapture(page: Page, baseURL?: string): QaCapture {
  const base = normalizeBaseURL(baseURL)
  const consoleErrors: string[] = []
  const pageErrors: string[] = []
  const httpErrors: string[] = []

  const onConsole = (msg: any) => {
    if (msg.type() !== 'error') return
    const text = msg.text()
    if (text.includes('Download the React DevTools')) return
    consoleErrors.push(text)
  }
  const onPageError = (error: any) => pageErrors.push(String(error?.message ?? error))
  const onResponse = (response: any) => {
    const url = response.url()
    if (!url.startsWith(base)) return
    const status = response.status()
    if (status === 401 || status === 403 || status === 404 || status >= 500) {
      httpErrors.push(`${status} ${response.request().method()} ${url}`)
    }
  }

  page.on('console', onConsole)
  page.on('pageerror', onPageError)
  page.on('response', onResponse)

  const stop = () => {
    page.off('console', onConsole)
    page.off('pageerror', onPageError)
    page.off('response', onResponse)
  }

  return {
    consoleErrors,
    pageErrors,
    httpErrors,
    reset() {
      consoleErrors.length = 0
      pageErrors.length = 0
      httpErrors.length = 0
    },
    stop,
    async assertNoUnexpected(opts?: { allowCheckoutProviderNoise?: boolean }) {
      const allowCheckoutProviderNoise = Boolean(opts?.allowCheckoutProviderNoise)
      const filteredPageErrors = allowCheckoutProviderNoise
        ? pageErrors.filter((entry) => {
            if (
              entry.includes('Loading chunk _app-pages-browser_node_modules_next_dist_client_dev_noop-turbopack-hmr_js failed') &&
              entry.includes('http://localhost:')
            ) {
              return false
            }
            return true
          })
        : pageErrors
      const filteredConsoleErrors = allowCheckoutProviderNoise
        ? consoleErrors.filter((entry) => {
            if (entry.includes('The resource') && entry.includes('/_next/image?url=%2Fbrand%2Flogo-purple.png')) return false
            if (entry.includes('CheckoutPublic: create failed') && entry.includes('Falha ao processar o split no provedor financeiro.')) return false
            if (entry.includes('CheckoutPublic: create failed') && entry.includes('Split inválido: nenhuma regra ativa e nenhum recebedor padrão aprovado.')) return false
            if (entry.includes('Failed to load resource: the server responded with a status of 400 (Bad Request)')) return false
            if (entry.includes('Failed to load resource') && entry.includes('/api/payments')) return false
            if (entry.includes('downloadable font: download failed') && entry.includes('https://fonts.gstatic.com/')) return false
            return true
          })
        : consoleErrors
      const filteredHttpErrors = allowCheckoutProviderNoise
        ? httpErrors.filter((entry) => !(entry.includes('502 POST ') && entry.includes('/api/payments')))
        : httpErrors

      expect(filteredPageErrors, 'Erros de runtime da página').toEqual([])
      expect(filteredConsoleErrors, 'Mensagens de console inesperadas').toEqual([])
      expect(filteredHttpErrors, 'Respostas HTTP inesperadas').toEqual([])
    },
  }
}

export async function gotoAndExpectHeading(page: Page, path: string, heading: string | RegExp, opts?: { timeoutMs?: number }) {
  const timeoutMs = typeof opts?.timeoutMs === 'number' ? opts.timeoutMs : 30_000
  await page.goto(path, { waitUntil: 'domcontentloaded' })
  await expect
    .poll(
      async () => {
        const currentUrl = page.url()
        let pathname = ''
        try {
          pathname = new URL(currentUrl).pathname
        } catch {
          pathname = currentUrl
        }
        const headings = (await page.getByRole('heading', { level: 1 }).allTextContents().catch(() => [])).map((entry) => entry.trim())
        const matchedHeading =
          typeof heading === 'string'
            ? headings.some((entry) => entry === heading)
            : headings.some((entry) => {
                heading.lastIndex = 0
                return heading.test(entry)
              })
        return pathname === path && matchedHeading
      },
      { timeout: timeoutMs, intervals: [100, 250, 500, 1_000] },
    )
    .toBe(true)
  await expect(page.getByRole('heading', { level: 1, name: heading as any }).first()).toBeVisible({ timeout: Math.min(timeoutMs, 10_000) })
}

export async function createPaymentLinkViaUi(
  page: Page,
  opts?: {
    name?: string
    description?: string
    amountBRL?: string
  },
) {
  const name = opts?.name ?? uniqueName('Produto Demo')
  const description = opts?.description ?? 'Produto fictício para auditoria E2E (Playwright).'
  const amountBRL = opts?.amountBRL ?? '19,90'
  const fillControlledInput = async (locator: ReturnType<Page['locator']>, value: string, opts?: { sequential?: boolean }) => {
    await locator.waitFor({ state: 'visible', timeout: 30_000 })
    await locator.scrollIntoViewIfNeeded()
    await locator.focus()
    await locator.fill('')
    if (opts?.sequential) {
      await locator.pressSequentially(value, { delay: 20 })
    } else {
      await locator.fill(value)
    }
    await locator.press('Tab').catch(() => {})
    await expect.poll(async () => locator.inputValue().catch(() => ''), { timeout: 5_000 }).toBe(value)
  }

  await page.goto('/links-pagamento/novo', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('h1')).toHaveText('Criar Link de Pagamento')
  await waitForCreateLinkScreenInteractive(page)
  const nameInput = page.getByPlaceholder('Ex: Consultoria Premium')
  const descriptionInput = page.getByPlaceholder('Descreva o que está sendo oferecido...')
  const amountInput = page.getByPlaceholder('0,00')
  await fillControlledInput(nameInput, name)
  await fillControlledInput(descriptionInput, description)
  await fillControlledInput(amountInput, amountBRL, { sequential: true })
  await expect(nameInput).toHaveValue(name)
  await expect(descriptionInput).toHaveValue(description)
  await expect(amountInput).toHaveValue(amountBRL)
  await closeAssistantIfVisible(page, { waitForAutoOpen: true })
  await expect(page.getByText('Informe nome e valor do produto.')).toHaveCount(0)

  const submitButton = page.locator('button[data-create-link-attempts]')
  await expect(submitButton).toBeEnabled()
  await submitButton.scrollIntoViewIfNeeded()
  const createRequestPromise = page
    .waitForRequest((request) => request.url().includes('/api/payment-links') && request.method() === 'POST', {
      timeout: 5_000,
    })
    .catch(() => null)
  await submitButton.click()
  const createRequest = await createRequestPromise
  if (!createRequest) {
    const attempts = await submitButton.getAttribute('data-create-link-attempts').catch(() => null)
    const buttonText = await submitButton.textContent().catch(() => null)
    const validationVisible = await page.getByText('Informe nome e valor do produto.').isVisible().catch(() => false)
    const validationMessage = validationVisible ? await page.getByText('Informe nome e valor do produto.').textContent().catch(() => null) : null
    const assistantVisible = await page.getByLabel('Minimizar assistente').isVisible().catch(() => false)
    throw new Error(
      `Nenhum POST /api/payment-links após clique. attempts=${String(attempts)} buttonText=${String(buttonText).trim()} validationVisible=${String(validationVisible)} validationMessage=${String(validationMessage)} assistantVisible=${String(assistantVisible)}`,
    )
  }
  await expect
    .poll(async () => (await createRequest.response().catch(() => null))?.status() ?? null, {
      timeout: 30_000,
      intervals: [100, 250, 500, 1_000],
    })
    .not.toBeNull()
  const createResponse = await createRequest.response()
  if (!createResponse) {
    throw new Error('POST /api/payment-links iniciado, mas nenhuma resposta HTTP foi recebida.')
  }
  const createPayload = await createResponse.json().catch(() => null)
  if (!createResponse.ok()) {
    throw new Error(`Falha ao criar link via /api/payment-links: ${createResponse.status()} ${String(createPayload?.error ?? '')}`.trim())
  }

  const splitConfirmDialog = page.getByRole('dialog').filter({ hasText: /Configurar split agora\?/i })
  await expect
    .poll(
      async () => {
        if (await splitConfirmDialog.isVisible().catch(() => false)) return 'dialog'
        return /\/checkout\?slug=/.test(page.url()) ? 'checkout' : 'pending'
      },
      { timeout: 10_000, intervals: [100, 250, 500, 1_000] },
    )
    .not.toBe('pending')
  if (await splitConfirmDialog.isVisible().catch(() => false)) {
    await splitConfirmDialog.getByRole('button', { name: 'Cancelar' }).click()
  }

  const slug = String(createPayload?.paymentLink?.slug ?? '').trim() || new URL(page.url()).searchParams.get('slug')
  if (!slug) throw new Error('Não foi possível obter o slug do link recém-criado.')
  if (!page.url().includes(`/checkout?slug=${slug}`)) {
    const reachedCheckout = await expect
      .poll(() => page.url().includes(`/checkout?slug=${slug}`), {
        timeout: 10_000,
        intervals: [100, 250, 500, 1_000],
      })
      .toBe(true)
      .then(() => true)
      .catch(() => false)
    if (!reachedCheckout) {
      await page.goto(`/checkout?slug=${encodeURIComponent(slug)}`, { waitUntil: 'domcontentloaded' })
    }
  }
  await expect
    .poll(() => page.url().includes(`/checkout?slug=${slug}`), {
      timeout: 30_000,
      intervals: [100, 250, 500, 1_000],
    })
    .toBe(true)
  await expect(page.getByRole('heading', { name: /Finalizar pagamento/i })).toBeVisible()
  return { slug, name, description, amountBRL }
}

export async function createPaymentLinkViaApi(
  page: Page,
  opts?: {
    name?: string
    description?: string
    amountBRL?: string
  },
) {
  const payload = {
    name: opts?.name ?? uniqueName('Produto Demo'),
    description: opts?.description ?? 'Produto fictício para auditoria E2E (Playwright).',
    amountBRL: opts?.amountBRL ?? '19,90',
    pix: true,
    card: true,
    maxInstallments: 12,
    type: 'one_time',
  }

  const response = await page.request.post(new URL('/api/payment-links', normalizeBaseURL()).toString(), {
    data: payload,
  })
  const json = await response.json().catch(() => null)

  if (!response.ok()) {
    throw new Error(`Falha ao criar link via API autenticada: ${response.status()} ${String(json?.error ?? '')}`.trim())
  }

  const slug = String(json?.paymentLink?.slug ?? '').trim()
  if (!slug) throw new Error('A resposta de /api/payment-links não retornou slug.')
  return { slug, name: payload.name, description: payload.description, amountBRL: payload.amountBRL }
}

export async function fillCheckoutCustomer(page: Page, opts?: { name?: string; email?: string; document?: string; phone?: string }) {
  await page.getByPlaceholder('Seu nome').fill(opts?.name ?? 'Cliente Demo')
  await page.getByPlaceholder('voce@exemplo.com').fill(opts?.email ?? uniqueEmail())
  await page.getByPlaceholder('000.000.000-00').fill(opts?.document ?? '123.456.789-09')
  const phoneField = page.getByPlaceholder('(11) 99999-0000')
  if (await phoneField.count()) {
    await phoneField.fill(opts?.phone ?? '(11) 99999-0000')
  }
}

export async function submitCheckout(page: Page, testInfo: TestInfo) {
  const button = page.getByRole('button', { name: /Finalizar pagamento/i })
  await expect(button).toBeEnabled()
  await button.scrollIntoViewIfNeeded()
  if (isMobileProject(testInfo)) {
    await button.focus()
    await button.press('Enter')
    return
  }
  await button.click()
}

export async function createPixTransactionViaApi(page: Page, slug: string, baseURL?: string) {
  const response = await page.request.post(new URL('/api/payments', normalizeBaseURL(baseURL)).toString(), {
    data: {
      paymentLinkSlug: slug,
      method: 'pix',
      customer: {
        name: 'Cliente Demo',
        email: uniqueEmail(),
        document: '123.456.789-09',
        phone: '(11) 99999-0000',
      },
    },
  })
  return response
}

export async function seedQaTransaction(page: Page, input: { paymentLinkSlug: string; amount?: number; method?: 'pix' | 'card'; status?: 'created' | 'paid' | 'failed' | 'refunded' }) {
  const admin = getAdminClient()
  if (!admin) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY é obrigatório para semear transações QA sem depender do provider.')
  }

  const { data: link, error: linkError } = await admin
    .from('payment_links')
    .select('id, organization_id, amount, currency')
    .eq('slug', input.paymentLinkSlug)
    .single()

  if (linkError || !link?.id || !link.organization_id) {
    throw new Error(`Não foi possível localizar o payment link QA pelo slug ${input.paymentLinkSlug}.`)
  }

  const customerName = uniqueName('Cliente QA')
  const customerEmail = uniqueEmail('cliente.qa')
  const providerReference = `qa-tx-${uniqueSuffix()}`
  const { data: customer, error: customerError } = await admin
    .from('customers')
    .insert({
      organization_id: link.organization_id,
      name: customerName,
      email: customerEmail,
      document: '123.456.789-09',
    })
    .select('id')
    .single()

  if (customerError || !customer?.id) {
    throw new Error('Não foi possível criar o cliente QA para a transação.')
  }

  const amount = typeof input.amount === 'number' ? input.amount : Number(link.amount)
  const method = input.method ?? 'pix'
  const status = input.status ?? 'paid'
  const transactionPayload = {
    seededBy: 'qa-suite',
    pix: method === 'pix' ? { copyPaste: `qa-pix-${uniqueSuffix()}` } : undefined,
  }

  const { data: transaction, error: transactionError } = await admin
    .from('transactions')
    .insert({
      organization_id: link.organization_id,
      customer_id: customer.id,
      payment_link_id: link.id,
      amount,
      currency: typeof link.currency === 'string' ? link.currency : 'BRL',
      method,
      status,
      provider_reference: providerReference,
      provider_payload: transactionPayload,
      public_token: randomUUID(),
    })
    .select('id')
    .single()

  if (transactionError || !transaction?.id) {
    throw new Error(`Não foi possível criar a transação QA: ${transactionError?.message ?? 'sem id retornado'}`)
  }

  await page.evaluate(() => {
    try {
      window.localStorage.removeItem('screen-cache')
      window.sessionStorage.removeItem('screen-cache')
    } catch {}
  }).catch(() => {})

  return {
    id: String(transaction.id),
    customerName,
    customerEmail,
    providerReference,
    amount,
    status,
  }
}

export async function openMobileDrawerLink(page: Page, linkName: string) {
  await closeAssistantIfVisible(page)
  const mobileMenuButton = page.getByTestId('mobile-menu-button')
  await expect(mobileMenuButton).toBeVisible()
  const link = page.locator('aside').getByRole('link', { name: linkName }).last()
  await mobileMenuButton.click()
  await page.waitForLoadState('networkidle').catch(() => {})
  if (!(await link.isVisible().catch(() => false))) {
    await mobileMenuButton.click()
  }
  await expect(link).toBeVisible({ timeout: 10_000 })
  return link
}

export function generateValidCPF() {
  const digits: number[] = []
  for (let i = 0; i < 9; i += 1) digits.push(Math.floor(Math.random() * 10))
  if (digits.every((digit) => digit === digits[0])) digits[8] = (digits[8] + 1) % 10

  const calc = (len: number) => {
    let sum = 0
    for (let i = 0; i < len; i += 1) sum += digits[i] * (len + 1 - i)
    const mod = sum % 11
    return mod < 2 ? 0 : 11 - mod
  }

  digits.push(calc(9))
  digits.push(calc(10))
  return digits.join('')
}

export function generateValidCNPJ() {
  const digits: number[] = []
  for (let i = 0; i < 12; i += 1) digits.push(Math.floor(Math.random() * 10))
  if (digits.every((digit) => digit === digits[0])) digits[11] = (digits[11] + 1) % 10

  const calc = (weights: number[]) => {
    let sum = 0
    for (let i = 0; i < weights.length; i += 1) sum += digits[i] * weights[i]
    const mod = sum % 11
    return mod < 2 ? 0 : 11 - mod
  }

  digits.push(calc([5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]))
  digits.push(calc([6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]))
  return digits.join('')
}

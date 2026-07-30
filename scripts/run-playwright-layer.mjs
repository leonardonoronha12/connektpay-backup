import { spawn } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'

const rootDir = process.cwd()
const cliPath = path.join(rootDir, 'node_modules', 'playwright', 'cli.js')

if (!fs.existsSync(cliPath)) {
  console.error('Playwright CLI não encontrado em node_modules.')
  process.exit(1)
}

const mode = String(process.argv[2] || '').trim()
const rawArgs = process.argv.slice(3)
const dryRun = rawArgs.includes('--dry-run')
const explicitRunId = rawArgs.find((arg) => arg.startsWith('--run-id='))?.slice('--run-id='.length).trim() || ''
const passthroughArgs = rawArgs.filter((arg) => arg !== '--dry-run' && !arg.startsWith('--run-id='))

const LOCAL_REGRESSION_BASE_URL = 'http://localhost:3001'
const LOCAL_REGRESSION_BASE_URL_ERROR =
  'LOCAL_BASE_URL para a suíte local-regression deve apontar explicitamente para localhost/127.0.0.1.'
const LOCAL_REGRESSION_SERVER_START_ERROR =
  'Não foi possível iniciar o servidor local da suíte local-regression.'
const LOCAL_REGRESSION_SERVER_OCCUPIED_ERROR =
  'A porta da suíte local-regression já está ocupada por outro processo. Encerre a instância externa antes de usar o runner automático.'
const LOCAL_REGRESSION_SERVER_READY_TIMEOUT_MS = 120_000
const LOCAL_REGRESSION_SERVER_STOP_TIMEOUT_MS = 10_000
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const LOCAL_PAGARME_WEBHOOK_TEST_ENV = {
  FINANCIAL_PROVIDER: 'pagarme',
  PAGARME_ENVIRONMENT: 'sandbox',
  PAGARME_WEBHOOK_USERNAME: 'webhook-user',
  PAGARME_WEBHOOK_PASSWORD: 'sup3r:s3cret!',
}
const LOCAL_PAGARME_CHECKOUT_TEST_ENV = {
  FINANCIAL_PROVIDER: 'pagarme',
  PAGARME_ENVIRONMENT: 'sandbox',
}

const criticalDesktopSpecs = [
  'tests/qa-auth.spec.ts',
  'tests/rbac.spec.ts',
  'tests/qa-dashboard.spec.ts',
  'tests/menu-usuario-regression.spec.ts',
  'tests/qa-payment-links.spec.ts',
  'tests/qa-checkout.spec.ts',
  'tests/qa-transactions.spec.ts',
  'tests/qa-admin.spec.ts',
  'tests/smoke.spec.ts',
  'tests/payouts-internal.spec.ts',
  'tests/anticipation.spec.ts',
]

const criticalMobileSpecs = ['tests/qa-mobile.spec.ts']

const reconciliationSpecs = ['tests/reconciliation.spec.ts']
const notificationsSpecs = ['tests/notifications.spec.ts']

const directSpecMap = new Map([
  ['tests/pagarme-webhook-route.spec.ts', ['tests/pagarme-webhook-route.spec.ts']],
  ['pagarme-webhook-route.spec.ts', ['tests/pagarme-webhook-route.spec.ts']],
  ['tests/qa-auth.spec.ts', ['tests/qa-auth.spec.ts']],
  ['tests/qa-dashboard.spec.ts', ['tests/qa-dashboard.spec.ts']],
  ['tests/qa-payment-links.spec.ts', ['tests/qa-payment-links.spec.ts']],
  ['tests/qa-checkout.spec.ts', ['tests/qa-checkout.spec.ts']],
  ['tests/qa-transactions.spec.ts', ['tests/qa-transactions.spec.ts']],
  ['tests/qa-admin.spec.ts', ['tests/qa-admin.spec.ts']],
  ['tests/qa-mobile.spec.ts', ['tests/qa-mobile.spec.ts']],
  ['tests/menu-usuario-regression.spec.ts', ['tests/menu-usuario-regression.spec.ts']],
  ['tests/rbac.spec.ts', ['tests/rbac.spec.ts']],
  ['tests/smoke.spec.ts', ['tests/smoke.spec.ts']],
  ['tests/payouts-internal.spec.ts', ['tests/payouts-internal.spec.ts']],
  ['tests/anticipation.spec.ts', ['tests/anticipation.spec.ts']],
  ['tests/split-internal.spec.ts', ['tests/split-internal.spec.ts']],
  ['tests/subscriptions-internal.spec.ts', ['tests/subscriptions-internal.spec.ts']],
  ['tests/kyc.spec.ts', ['tests/kyc.spec.ts']],
  ['tests/reconciliation.spec.ts', reconciliationSpecs],
  ['reconciliation.spec.ts', reconciliationSpecs],
  ['tests/notifications.spec.ts', notificationsSpecs],
  ['notifications.spec.ts', notificationsSpecs],
  ['tests/mygateway.spec.ts', ['tests/mygateway.spec.ts']],
  ['tests/webhook-billing-lifecycle.spec.ts', ['tests/webhook-billing-lifecycle.spec.ts']],
  ['lib/acquirer/myg-provider.ts', ['tests/mygateway.spec.ts']],
  ['lib/webhook-processor.ts', ['tests/webhook-billing-lifecycle.spec.ts']],
].map(([target, specs]) => [normalizeInputPath(target), specs]))

const relatedRules = [
  {
    match: /tests[\\/]+helpers[\\/]+qa-suite\.ts$/i,
    specs: [
      'tests/qa-auth.spec.ts',
      'tests/qa-dashboard.spec.ts',
      'tests/qa-payment-links.spec.ts',
      'tests/qa-checkout.spec.ts',
      'tests/qa-transactions.spec.ts',
      'tests/qa-admin.spec.ts',
      'tests/qa-mobile.spec.ts',
      'tests/menu-usuario-regression.spec.ts',
    ],
  },
  {
    match: /tests[\\/]+helpers[\\/]+e2e-auth\.ts$/i,
    specs: ['tests/qa-auth.spec.ts', 'tests/menu-usuario-regression.spec.ts'],
  },
  {
    match: /components[\\/]+layout[\\/]+(Header|Sidebar|AppShell)\.tsx$/i,
    specs: ['tests/qa-auth.spec.ts', 'tests/menu-usuario-regression.spec.ts', 'tests/qa-dashboard.spec.ts', 'tests/qa-mobile.spec.ts'],
  },
  {
    match: /services[\\/]+auth\.ts$/i,
    specs: ['tests/qa-auth.spec.ts', 'tests/menu-usuario-regression.spec.ts'],
  },
  {
    match: /app[\\/]+api[\\/]+auth[\\/].+\.(ts|tsx)$/i,
    specs: ['tests/qa-auth.spec.ts'],
  },
  {
    match: /(dashboard|home|metrics|kpi)/i,
    specs: ['tests/qa-dashboard.spec.ts'],
  },
  {
    match: /(payment-links|checkout|public[\\/]payment-links|api[\\/]payment-links)/i,
    specs: ['tests/qa-payment-links.spec.ts', 'tests/qa-checkout.spec.ts', 'tests/qa-mobile.spec.ts'],
  },
  {
    match: /(transactions|transacoes|payments)/i,
    specs: ['tests/qa-transactions.spec.ts'],
  },
  {
    match: /(receivers|recebedores|kyc|admin[\\/](painel|eventos|auditoria|conciliacao)|provider-settings)/i,
    specs: ['tests/qa-admin.spec.ts', 'tests/kyc.spec.ts'],
  },
  {
    match: /(reconciliation|conciliation|conciliacao)/i,
    specs: reconciliationSpecs,
  },
  {
    match: /(notifications?|notification_preferences|notification-preferences|alerts?|notificacoes)/i,
    specs: notificationsSpecs,
  },
  {
    match: /(rbac|roles?|permissions?)/i,
    specs: ['tests/rbac.spec.ts', 'tests/qa-admin.spec.ts'],
  },
  {
    match: /(mobile|drawer)/i,
    specs: ['tests/qa-mobile.spec.ts'],
  },
  {
    match: /(ledger|payout|repasse|anticipation|antecipacao)/i,
    specs: ['tests/payouts-internal.spec.ts', 'tests/anticipation.spec.ts'],
  },
  {
    match: /(split)/i,
    specs: ['tests/split-internal.spec.ts'],
  },
  {
    match: /(subscription|assinatura|recurrence)/i,
    specs: ['tests/subscriptions-internal.spec.ts'],
  },
]

function normalizeInputPath(filePath) {
  return String(filePath || '').trim().replace(/^\.?[\\/]/, '').replaceAll('/', path.sep).replaceAll('\\', path.sep)
}

function resolveChangedTargets(args) {
  if (args.length > 0) return args.map(normalizeInputPath).filter(Boolean)

  const envTargets = String(process.env.CHANGED_FILES || '')
    .split(/[\r\n,;]+/)
    .map(normalizeInputPath)
    .filter(Boolean)
  if (envTargets.length > 0) return envTargets

  try {
    const gitHeadPath = path.join(rootDir, '.git')
    if (!fs.existsSync(gitHeadPath)) return []
  } catch {}

  return []
}

function collectChangedSpecs(changedTargets) {
  const specs = new Set()

  for (const target of changedTargets) {
    const direct = directSpecMap.get(target)
    if (direct) {
      for (const spec of direct) specs.add(spec)
      continue
    }

    for (const rule of relatedRules) {
      if (!rule.match.test(target)) continue
      for (const spec of rule.specs) specs.add(spec)
    }
  }

  return [...specs]
}

function buildRunId(prefix) {
  const stamp = new Date().toISOString().replaceAll(':', '').replaceAll('.', '').replace('T', '-').replace('Z', '')
  return `${prefix}-${stamp}`
}

function pickRunId(prefix) {
  return explicitRunId || buildRunId(prefix)
}

function normalizeBaseUrl(input) {
  const raw = String(input || '').trim()
  if (!raw) return ''
  try {
    const parsed = new URL(raw)
    if (parsed.hostname === '127.0.0.1') parsed.hostname = 'localhost'
    return parsed.toString().replace(/\/$/, '')
  } catch {
    return raw.replace(/\/$/, '')
  }
}

function isLoopbackBaseUrl(input) {
  try {
    const parsed = new URL(input)
    return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'
  } catch {
    return input.includes('localhost') || input.includes('127.0.0.1')
  }
}

function isPlaceholderBaseUrl(input) {
  try {
    const parsed = new URL(input)
    return /(^|\.)example\.vercel\.app$/i.test(parsed.hostname)
  } catch {
    return /example\.vercel\.app/i.test(input)
  }
}

function resolveLocalRegressionBaseUrl(env) {
  const explicitLocalBaseUrl = normalizeBaseUrl(env.LOCAL_BASE_URL)
  if (explicitLocalBaseUrl) {
    if (!isLoopbackBaseUrl(explicitLocalBaseUrl)) {
      throw new Error(LOCAL_REGRESSION_BASE_URL_ERROR)
    }
    return explicitLocalBaseUrl
  }

  const inheritedBaseUrl = normalizeBaseUrl(env.BASE_URL)
  if (!inheritedBaseUrl) return LOCAL_REGRESSION_BASE_URL
  if (isLoopbackBaseUrl(inheritedBaseUrl)) return inheritedBaseUrl

  const reason = isPlaceholderBaseUrl(inheritedBaseUrl) ? 'placeholder' : 'remota'
  console.warn(`[local-regression] Ignorando BASE_URL ${reason} (${inheritedBaseUrl}) e usando ${LOCAL_REGRESSION_BASE_URL}.`)
  return LOCAL_REGRESSION_BASE_URL
}

function shouldInjectLocalPagarmeWebhookEnv(args) {
  const targetPaths = new Set([
    normalizeInputPath('tests/pagarme-webhook-route.spec.ts'),
    normalizeInputPath('pagarme-webhook-route.spec.ts'),
  ])
  return args
    .map((arg) => normalizeInputPath(arg))
    .some((arg) => targetPaths.has(arg))
}

function shouldInjectLocalPagarmeCheckoutEnv(args) {
  const targetPaths = new Set([
    normalizeInputPath('tests/qa-checkout.spec.ts'),
    normalizeInputPath('qa-checkout.spec.ts'),
  ])
  return args
    .map((arg) => normalizeInputPath(arg))
    .some((arg) => targetPaths.has(arg))
}

function logCommand(label, args, env) {
  const display = [`node ${path.relative(rootDir, cliPath)}`, ...args].join(' ')
  const suite = env.PW_SUITE ? ` PW_SUITE=${env.PW_SUITE}` : ''
  const runId = env.PW_RUN_ID ? ` PW_RUN_ID=${env.PW_RUN_ID}` : ''
  console.log(`\n[${label}]${suite}${runId}\n${display}`)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function isPortBusy(hostname, port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: hostname, port })
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => resolve(false))
  })
}

async function waitForHttpReady(baseURL, child, label) {
  const loginUrl = new URL('/login', baseURL).toString()
  const deadline = Date.now() + LOCAL_REGRESSION_SERVER_READY_TIMEOUT_MS

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`${LOCAL_REGRESSION_SERVER_START_ERROR} ${label} encerrou prematuramente com código ${child.exitCode}.`)
    }

    try {
      const response = await fetch(loginUrl, {
        redirect: 'manual',
        signal: AbortSignal.timeout(5_000),
      })
      if (response.status < 500) return
    } catch {}

    await sleep(1_000)
  }

  throw new Error(`${LOCAL_REGRESSION_SERVER_START_ERROR} Timeout aguardando readiness HTTP em ${loginUrl}.`)
}

async function warmLocalRegressionRoutes(baseURL) {
  const requests = [
    { path: '/login', method: 'GET' },
    { path: '/dashboard', method: 'GET' },
    { path: '/api/me', method: 'GET' },
    { path: '/api/notifications?limit=6', method: 'GET' },
    { path: '/api/transactions', method: 'GET' },
    { path: '/api/receivers', method: 'GET' },
    { path: '/api/dashboard?days=30', method: 'GET' },
    { path: '/api/onboarding/ensure', method: 'POST' },
  ]

  for (const request of requests) {
    try {
      await fetch(new URL(request.path, baseURL), {
        method: request.method,
        redirect: 'manual',
        signal: AbortSignal.timeout(10_000),
        headers: request.method === 'POST' ? { 'content-type': 'application/json' } : undefined,
        body: request.method === 'POST' ? '{}' : undefined,
      })
    } catch {}
  }

  await sleep(1_000)
}

async function stopChildProcess(child) {
  if (!child || child.exitCode !== null) return

  if (process.platform === 'win32') {
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, LOCAL_REGRESSION_SERVER_STOP_TIMEOUT_MS)
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        cwd: rootDir,
        stdio: 'ignore',
        shell: true,
      })

      killer.once('exit', () => {
        clearTimeout(timer)
        resolve()
      })
      killer.once('error', () => {
        clearTimeout(timer)
        resolve()
      })
    })
    return
  }

  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      resolve()
    }, LOCAL_REGRESSION_SERVER_STOP_TIMEOUT_MS)

    child.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })

    child.kill('SIGTERM')
  })
}

async function withLocalRegressionServer(env, run) {
  const baseURL = env.BASE_URL
  const parsedBaseURL = new URL(baseURL)

  if (await isPortBusy(parsedBaseURL.hostname, Number(parsedBaseURL.port || 80))) {
    throw new Error(`${LOCAL_REGRESSION_SERVER_OCCUPIED_ERROR} Porta ${parsedBaseURL.port || 80} em ${baseURL}.`)
  }

  const serverEnv = {
    ...process.env,
    ...env,
  }
  const serverArgs = ['run', 'dev', '--', '--hostname', parsedBaseURL.hostname, '--port', String(parsedBaseURL.port || 80)]
  console.log(`\n[local-regression-server]\n${npmCommand} ${serverArgs.join(' ')}`)

  const child = spawn(npmCommand, serverArgs, {
    cwd: rootDir,
    env: serverEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  })

  child.stdout.on('data', (chunk) => process.stdout.write(String(chunk)))
  child.stderr.on('data', (chunk) => process.stderr.write(String(chunk)))

  try {
    await waitForHttpReady(baseURL, child, 'Servidor local')
    await warmLocalRegressionRoutes(baseURL)
    return await run()
  } finally {
    await stopChildProcess(child)
  }
}

async function runPlaywright(label, args, extraEnv = {}) {
  const env = {
    ...process.env,
    PW_SUITE: 'local-regression',
    ...extraEnv,
  }

  if ((env.PW_SUITE || 'local-regression') === 'local-regression') {
    env.BASE_URL = resolveLocalRegressionBaseUrl(env)
    if (shouldInjectLocalPagarmeCheckoutEnv(args)) {
      for (const [key, value] of Object.entries(LOCAL_PAGARME_CHECKOUT_TEST_ENV)) {
        if (!String(env[key] || '').trim()) env[key] = value
      }
    }
    if (shouldInjectLocalPagarmeWebhookEnv(args)) {
      for (const [key, value] of Object.entries(LOCAL_PAGARME_WEBHOOK_TEST_ENV)) {
        if (!String(env[key] || '').trim()) env[key] = value
      }
    }
  }

  logCommand(label, args, env)

  if (dryRun) return Promise.resolve()

  const execute = () =>
    new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [cliPath, ...args], {
        cwd: rootDir,
        env,
        stdio: 'inherit',
      })

      child.on('exit', (code, signal) => {
        if (signal) {
          reject(new Error(`${label} interrompido por sinal ${signal}.`))
          return
        }
        if (code !== 0) {
          reject(new Error(`${label} falhou com código ${code}.`))
          return
        }
        resolve()
      })
      child.on('error', reject)
    })

  if ((env.PW_SUITE || 'local-regression') === 'local-regression') {
    return withLocalRegressionServer(env, execute)
  }

  return execute()
}

async function runCritical() {
  await runPlaywright(
    'critical-desktop',
    ['test', ...criticalDesktopSpecs, '--project=Desktop Chrome', '--workers=1', '--retries=0', ...passthroughArgs],
    { PW_RUN_ID: pickRunId('critical-desktop') },
  )

  await runPlaywright(
    'critical-mobile',
    ['test', ...criticalMobileSpecs, '--project=Mobile Android', '--workers=1', '--retries=0', ...passthroughArgs],
    { PW_RUN_ID: pickRunId('critical-mobile') },
  )
}

async function runChanged() {
  const changedTargets = resolveChangedTargets(passthroughArgs)
  if (changedTargets.length === 0) {
    console.error('Nenhum arquivo alterado foi informado. Use `npm run test:changed -- caminho/do/arquivo.ts` ou defina CHANGED_FILES.')
    process.exit(1)
  }

  const specs = collectChangedSpecs(changedTargets)
  if (specs.length === 0) {
    console.error('Nenhuma spec relacionada foi mapeada para os arquivos informados.')
    console.error(`Arquivos recebidos: ${changedTargets.join(', ')}`)
    process.exit(1)
  }

  const desktopSpecs = specs.filter((spec) => spec !== 'tests/qa-mobile.spec.ts')
  const mobileSpecs = specs.filter((spec) => spec === 'tests/qa-mobile.spec.ts')

  console.log(`Arquivos alterados: ${changedTargets.join(', ')}`)
  console.log(`Specs relacionadas: ${specs.join(', ')}`)

  if (desktopSpecs.length > 0) {
    await runPlaywright(
      'changed-desktop',
      ['test', ...desktopSpecs, '--project=Desktop Chrome', '--workers=1', '--retries=0'],
      { PW_RUN_ID: pickRunId('changed-desktop') },
    )
  }

  if (mobileSpecs.length > 0) {
    await runPlaywright(
      'changed-mobile',
      ['test', ...mobileSpecs, '--project=Mobile Android', '--workers=1', '--retries=0'],
      { PW_RUN_ID: pickRunId('changed-mobile') },
    )
  }
}

async function runFull() {
  await runPlaywright('full', ['test', '--workers=1', '--retries=0', ...passthroughArgs], {
    PW_SUITE: 'local-regression',
    PW_RUN_ID: pickRunId('full'),
  })
}

async function runHomologation() {
  await runPlaywright('homologation', ['test', '--workers=1', '--retries=0', ...passthroughArgs], {
    PW_SUITE: 'homologation',
    PW_RUN_ID: pickRunId('homologation'),
  })
}

async function runProductionSmoke() {
  await runPlaywright('production-smoke', ['test', '--workers=1', '--retries=0', ...passthroughArgs], {
    PW_SUITE: 'production-smoke',
    PW_RUN_ID: pickRunId('production-smoke'),
  })
}

async function main() {
  switch (mode) {
    case 'changed':
      await runChanged()
      break
    case 'critical':
      await runCritical()
      break
    case 'full':
      await runFull()
      break
    case 'homologation':
      await runHomologation()
      break
    case 'production-smoke':
      await runProductionSmoke()
      break
    default:
      console.error('Uso: node scripts/run-playwright-layer.mjs <changed|critical|full|homologation|production-smoke> [args]')
      process.exit(1)
  }
}

await main()

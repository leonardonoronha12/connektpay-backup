import { spawn } from 'node:child_process'
import fs from 'node:fs'
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

function logCommand(label, args, env) {
  const display = [`node ${path.relative(rootDir, cliPath)}`, ...args].join(' ')
  const suite = env.PW_SUITE ? ` PW_SUITE=${env.PW_SUITE}` : ''
  const runId = env.PW_RUN_ID ? ` PW_RUN_ID=${env.PW_RUN_ID}` : ''
  console.log(`\n[${label}]${suite}${runId}\n${display}`)
}

function runPlaywright(label, args, extraEnv = {}) {
  const env = {
    ...process.env,
    PW_SUITE: 'local-regression',
    ...extraEnv,
  }

  logCommand(label, args, env)

  if (dryRun) return Promise.resolve()

  return new Promise((resolve, reject) => {
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

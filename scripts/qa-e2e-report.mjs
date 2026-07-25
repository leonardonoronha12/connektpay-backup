import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

function stripAnsi(s) {
  return String(s).replace(/\u001b\[[0-9;]*m/g, '')
}

function log(msg) {
  process.stdout.write(`${msg}\n`)
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return
  const raw = fs.readFileSync(filePath, 'utf8')
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx <= 0) continue
    const key = trimmed.slice(0, idx).trim()
    const value = trimmed.slice(idx + 1).trim()
    if (!key) continue
    if (typeof process.env[key] === 'undefined') process.env[key] = value
  }
}

function readEnvFileKeys(filePath, keys) {
  const wanted = new Set(Array.isArray(keys) ? keys : [])
  const out = {}
  if (!fs.existsSync(filePath)) return out
  const raw = fs.readFileSync(filePath, 'utf8')
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx <= 0) continue
    const key = trimmed.slice(0, idx).trim()
    if (!wanted.has(key)) continue
    const value = trimmed.slice(idx + 1).trim()
    out[key] = value
  }
  return out
}

function upsertEnvLines(existingText, updates) {
  const lines = String(existingText || '').split(/\r?\n/g)
  const out = []
  const seen = new Set()
  for (const line of lines) {
    const idx = line.indexOf('=')
    if (idx <= 0) {
      out.push(line)
      continue
    }
    const key = line.slice(0, idx).trim()
    if (!key || !(key in updates)) {
      out.push(line)
      continue
    }
    out.push(`${key}=${updates[key]}`)
    seen.add(key)
  }
  for (const [k, v] of Object.entries(updates)) {
    if (seen.has(k)) continue
    out.push(`${k}=${v}`)
  }
  return out.filter((l, i, arr) => !(i === arr.length - 1 && l === '')).join('\n') + '\n'
}

function statusPt(status) {
  const s = String(status || '').toLowerCase()
  if (s === 'passed') return 'SUCESSO'
  if (s === 'failed') return 'FALHOU'
  if (s === 'skipped') return 'IGNORADO'
  if (s === 'not-run') return 'NÃO EXECUTADO'
  return status ? String(status).toUpperCase() : '—'
}

function prioridadePt(t) {
  const baseUrl = process.env.BASE_URL || 'http://localhost:3001'
  const status = String(t?.status || '')
  if (status === 'failed') return 'ALTA'
  const ce = summarizeLines(t?.consoleText, 50).total
  const pe = summarizeLines(t?.pageErrorsText, 50).total
  const rf = splitRequestFailures(t?.requestFailuresText, baseUrl).app.length
  if (ce || pe) return 'MÉDIA'
  if (rf) return 'BAIXA'
  if (status === 'skipped' || status === 'not-run') return 'ALTA'
  return 'BAIXA'
}

function explicacaoSimples(t) {
  const status = String(t?.status || '')
  const notes = stripAnsi(String(t?.notesText || ''))
  const consoleText = stripAnsi(String(t?.consoleText || ''))
  if (status === 'skipped') return 'Fluxo ignorado porque a autenticação/dados do ambiente não estavam disponíveis.'
  if (status === 'not-run') return 'Fluxo não executado (sem artefatos de teste para este item).'
  if (status !== 'failed') {
    if (consoleText.includes('500')) return 'Fluxo passou, mas houve erro 500 no console durante a execução.'
    return 'Fluxo executou sem falhas relevantes.'
  }
  if (/autentica/i.test(notes) || /login/i.test(notes)) return 'Falha de autenticação: o login não redirecionou para o dashboard.'
  if (/timeout/i.test(notes)) return 'Falha por timeout: a tela/redirect esperado não ocorreu no tempo limite.'
  if (consoleText.includes('500')) return 'Falha por erro 500 no servidor durante a navegação.'
  return 'Falha durante a execução do fluxo. Ver evidências (screenshot/trace/vídeo) para detalhes.'
}

function mdEscape(s) {
  return stripAnsi(String(s)).replace(/\|/g, '\\|')
}

function groupByStatus(items) {
  const map = new Map()
  for (const it of items) map.set(it.status, (map.get(it.status) ?? 0) + 1)
  return map
}

function readTextIfExists(filePath) {
  if (!fs.existsSync(filePath)) return ''
  return fs.readFileSync(filePath, 'utf8')
}

function readJsonIfExists(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback
  try {
    const raw = fs.readFileSync(filePath, 'utf8')
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function listFiles(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isFile()).map((d) => d.name)
  } catch {
    return []
  }
}

const FLOW_NAME_MAP = new Map([
  [1, 'Login'],
  [2, 'Logout'],
  [3, 'Dashboard'],
  [4, 'Payment Links'],
  [5, 'Checkout público'],
  [6, 'Transações'],
  [7, 'Assinaturas'],
  [8, 'Planos'],
  [9, 'Recebedores'],
  [10, 'KYC (admin)'],
  [11, 'Ledger'],
  [12, 'Antecipação'],
  [13, 'Repasses'],
  [14, 'Conciliação'],
  [15, 'Auditoria'],
  [16, 'Configurações'],
  [17, 'Admin · Painel'],
  [18, 'Admin · Eventos & Webhooks'],
  [19, 'Admin · Antecipações'],
  [20, 'Configurações · Integrações'],
  [21, 'Configurações · Provedor'],
  [22, 'Navegação mobile'],
])

function normalizeFlowKey(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function parseFlowFromDirName(dirName) {
  const clean = String(dirName).replace(/-+$/g, '')
  const m = clean.match(/-(\d+)-([^-]+)$/)
  if (m) {
    const idx = Number(m[1])
    const rawName = String(m[2])
    return { idx, rawName }
  }
  const normalized = normalizeFlowKey(clean)
  const candidates = [...FLOW_NAME_MAP.entries()]
    .map(([idx, flowName]) => ({ idx, flowName, key: normalizeFlowKey(flowName) }))
    .filter((x) => x.key)
    .sort((a, b) => b.key.length - a.key.length)
  for (const c of candidates) {
    if (normalized.includes(c.key)) return { idx: c.idx, rawName: c.flowName }
  }
  return null
}

function canonicalFlowName(idx, rawName) {
  const fromMap = FLOW_NAME_MAP.get(idx)
  if (fromMap) return fromMap
  return rawName.replaceAll('-', ' ')
}

function summarizeLines(text, maxLines) {
  const lines = stripAnsi(String(text || ''))
    .split(/\r?\n/g)
    .map((l) => l.trimEnd())
    .filter(Boolean)
  if (!lines.length) return { lines: [], total: 0 }
  return { lines: lines.slice(0, maxLines), total: lines.length }
}

function expectedFlows() {
  const out = []
  for (let i = 1; i <= 22; i += 1) out.push({ idx: i, flowName: canonicalFlowName(i, String(i)) })
  return out
}

function safeUrl(s) {
  try {
    return new URL(String(s))
  } catch {
    return null
  }
}

function inferAppBaseUrl(items) {
  const env = safeUrl(process.env.BASE_URL)
  if (env) return env.origin

  for (const it of items) {
    const candidates = [it?.navigationsText, it?.notesText].filter(Boolean)
    for (const t of candidates) {
      const m = String(t).match(/https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?/i)
      if (m && m[0]) {
        const u = safeUrl(m[0])
        if (u) return u.origin
      }
    }
  }

  return 'http://localhost:3001'
}

function splitRequestFailures(text, appBaseUrl) {
  const appOrigin = safeUrl(appBaseUrl)?.origin ?? null
  const app = []
  const external = []

  const lines = stripAnsi(String(text || ''))
    .split(/\r?\n/g)
    .map((l) => l.trim())
    .filter(Boolean)

  for (const l of lines) {
    const urlMatch = l.match(/\bhttps?:\/\/[^\s]+/i)
    const url = urlMatch?.[0] ?? null
    const u = url ? safeUrl(url) : null
    const origin = u?.origin ?? null
    const isExternal = Boolean(appOrigin && origin && origin !== appOrigin)

    if (isExternal) external.push(l)
    else app.push(l)
  }

  return { app, external }
}

function msToHuman(ms) {
  const n = Number(ms)
  if (!Number.isFinite(n) || n < 0) return '—'
  if (n < 1000) return `${Math.round(n)} ms`
  const s = n / 1000
  if (s < 60) return `${s.toFixed(1)} s`
  const m = Math.floor(s / 60)
  const rs = Math.round(s % 60)
  return `${m}m ${rs}s`
}

async function ensureDemoUserAndSeed() {
  // Objetivo: garantir um usuário demo e dados mínimos no Supabase para que a suíte E2E execute
  // como um usuário real (login ok, dashboard/admin acessíveis, dados mínimos existindo).
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) throw new Error('Supabase não está configurado (NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY).')

  const email = process.env.E2E_EMAIL
  const password = process.env.E2E_PASSWORD
  if (!email || !email.trim()) throw new Error('E2E_EMAIL não definido. Configure em .env.local (E2E_EMAIL=...).')
  if (!password || !password.trim()) throw new Error('E2E_PASSWORD não definido. Configure em .env.local (E2E_PASSWORD=...).')

  log('Verificando usuário demo no Supabase...')
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

  async function findUserByEmail(targetEmail) {
    for (let page = 1; page <= 30; page += 1) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 })
      if (error) throw error
      const users = Array.isArray(data?.users) ? data.users : []
      const found = users.find((u) => String(u?.email || '').toLowerCase() === String(targetEmail).toLowerCase())
      if (found) return found
      if (users.length < 200) break
    }
    return null
  }

  let user = await findUserByEmail(email)
  if (!user) {
    const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true })
    if (error) throw error
    user = data?.user ?? null
  } else {
    await supabase.auth.admin.updateUserById(user.id, { password, email_confirm: true }).catch(() => {})
  }
  if (!user?.id) throw new Error('Não foi possível criar/obter o usuário demo no Supabase.')

  log('Garantindo perfil/organização/role (owner) para o usuário demo...')
  const { data: profile } = await supabase.from('profiles').select('id, organization_id, role').eq('id', user.id).maybeSingle()
  let organizationId = profile?.organization_id ?? null
  if (!organizationId) {
    const { data: org, error: orgErr } = await supabase
      .from('organizations')
      .insert({ name: 'Connekt Pay — Demo E2E', document: '12.345.678/0001-90' })
      .select('id')
      .single()
    if (orgErr) throw orgErr
    organizationId = org.id
  }

  await supabase
    .from('profiles')
    .upsert({
      id: user.id,
      organization_id: organizationId,
      email,
      full_name: 'Admin Demo',
      role: 'owner',
      phone: null,
    })
    .throwOnError()

  await supabase.auth.admin
    .updateUserById(user.id, {
      user_metadata: { ...(user.user_metadata || {}), role: 'owner', organization_id: organizationId },
    })
    .catch(() => {})

  await supabase.from('provider_settings').upsert({ organization_id: organizationId }, { onConflict: 'organization_id' }).throwOnError()

  log('Criando dados mínimos para testes (idempotente)...')

  const { data: receiverExisting } = await supabase.from('receivers').select('id').eq('organization_id', organizationId).limit(1)
  let receiverId = receiverExisting?.[0]?.id ?? null
  if (!receiverId) {
    const { data, error } = await supabase
      .from('receivers')
      .insert({
        organization_id: organizationId,
        name: 'Recebedor Demo',
        document: '12.345.678/0001-90',
        bank_account: { bank: '000', agency: '0001', account: '000000-0', holder: 'Recebedor Demo' },
        kyc_status: 'approved',
        status: 'active',
      })
      .select('id')
      .single()
    if (error) throw error
    receiverId = data.id
  }

  const { data: kycExisting } = await supabase.from('kyc_requests').select('id').eq('organization_id', organizationId).limit(1)
  if (!kycExisting?.length) {
    await supabase
      .from('kyc_requests')
      .insert({
        organization_id: organizationId,
        receiver_id: receiverId,
        status: 'approved',
        risk: 'low',
        submitted_at: new Date().toISOString(),
        reviewed_at: new Date().toISOString(),
        decision_reason: 'Seed demo E2E',
        evidence: { source: 'seed' },
      })
      .throwOnError()
  }

  const { data: customerExisting } = await supabase.from('customers').select('id').eq('organization_id', organizationId).limit(1)
  let customerId = customerExisting?.[0]?.id ?? null
  if (!customerId) {
    const { data, error } = await supabase
      .from('customers')
      .insert({
        organization_id: organizationId,
        name: 'Cliente Demo',
        email: 'cliente.demo@connektpay.com',
        document: '123.456.789-09',
        phone: '(11) 90000-0000',
      })
      .select('id')
      .single()
    if (error) throw error
    customerId = data.id
  }

  const { data: linkExisting } = await supabase.from('payment_links').select('id, slug').eq('organization_id', organizationId).limit(1)
  let paymentLinkId = linkExisting?.[0]?.id ?? null
  let checkoutSlug = linkExisting?.[0]?.slug ?? null
  if (!paymentLinkId) {
    const slug = `e2e-demo-${String(Date.now()).slice(-6)}`
    const { data, error } = await supabase
      .from('payment_links')
      .insert({
        organization_id: organizationId,
        name: 'Link Demo E2E',
        description: 'Link de pagamento criado para auditoria E2E.',
        amount: 1990,
        currency: 'BRL',
        type: 'one_time',
        methods: { pix: true, card: true },
        max_installments: 1,
        status: 'active',
        slug,
        metadata: { seed: true },
      })
      .select('id, slug')
      .single()
    if (error) throw error
    paymentLinkId = data.id
    checkoutSlug = data.slug
  }

  const { data: txExisting } = await supabase.from('transactions').select('id').eq('organization_id', organizationId).limit(1)
  let transactionId = txExisting?.[0]?.id ?? null
  if (!transactionId) {
    const { data, error } = await supabase
      .from('transactions')
      .insert({
        organization_id: organizationId,
        customer_id: customerId,
        payment_link_id: paymentLinkId,
        amount: 1990,
        currency: 'BRL',
        method: 'pix',
        status: 'paid',
        provider_reference: 'demo',
        provider_payload: { seed: true },
        public_token: crypto.randomUUID(),
      })
      .select('id')
      .single()
    if (error) throw error
    transactionId = data.id
  }

  const { data: subExisting } = await supabase.from('subscriptions').select('id').eq('organization_id', organizationId).limit(1)
  if (!subExisting?.length) {
    const next = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    await supabase
      .from('subscriptions')
      .insert({
        organization_id: organizationId,
        customer_id: customerId,
        payment_link_id: paymentLinkId,
        amount: 9900,
        currency: 'BRL',
        interval: 'monthly',
        status: 'active',
        next_billing_at: next,
        provider_reference: 'demo',
        metadata: { seed: true },
      })
      .throwOnError()
  }

  const { data: ledgerExisting } = await supabase.from('ledger_entries').select('id').eq('organization_id', organizationId).limit(1)
  if (!ledgerExisting?.length) {
    await supabase
      .from('ledger_entries')
      .insert({
        organization_id: organizationId,
        transaction_id: transactionId,
        type: 'payment',
        direction: 'credit',
        amount: 1990,
        balance_after: 1990,
        origin: 'seed',
        occurred_at: new Date().toISOString(),
      })
      .throwOnError()
  }

  const { data: payoutExisting } = await supabase.from('payouts').select('id').eq('organization_id', organizationId).limit(1)
  if (!payoutExisting?.length) {
    await supabase
      .from('payouts')
      .insert({
        organization_id: organizationId,
        receiver_id: receiverId,
        gross_amount: 1500,
        fee_amount: 50,
        net_amount: 1450,
        status: 'scheduled',
        scheduled_for: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        provider_reference: 'demo',
        provider_payload: { seed: true },
      })
      .throwOnError()
  }

  const { data: auditExisting } = await supabase.from('audit_logs').select('id').eq('organization_id', organizationId).limit(1)
  if (!auditExisting?.length) {
    await supabase
      .from('audit_logs')
      .insert({
        organization_id: organizationId,
        actor_profile_id: user.id,
        action: 'SEED',
        entity: 'demo',
        entity_id: null,
        before: null,
        after: { checkout_slug: checkoutSlug },
      })
      .throwOnError()
  }

  log('Atualizando .env.local com variáveis E2E...')
  const envPath = path.resolve(process.cwd(), '.env.local')
  const existingEnv = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : ''
  const nextEnv = upsertEnvLines(existingEnv, {
    BASE_URL: process.env.BASE_URL || 'http://localhost:3001',
    E2E_EMAIL: email,
    E2E_PASSWORD: password,
    ...(checkoutSlug ? { E2E_CHECKOUT_SLUG: checkoutSlug } : null),
  })
  fs.writeFileSync(envPath, nextEnv, 'utf8')

  log('Setup concluído.')
  return { organizationId, userId: user.id, checkoutSlug }
}

function parseCliArgs(argv) {
  const out = { doSetup: false, doRun: false, noSetup: false, grep: null }
  const args = Array.isArray(argv) ? argv : []
  out.doSetup = args.includes('--setup')
  out.doRun = args.includes('--run')
  out.noSetup = args.includes('--no-setup')

  for (let i = 0; i < args.length; i += 1) {
    const a = args[i]
    if (typeof a !== 'string') continue
    if (a.startsWith('--grep=')) {
      out.grep = a.slice('--grep='.length) || null
    } else if (a === '--grep') {
      const next = args[i + 1]
      if (typeof next === 'string' && next.trim()) out.grep = next.trim()
    }
  }
  return out
}

async function runPlaywrightAudit(opts) {
  // Objetivo: rodar a auditoria Playwright com logs mais amigáveis em PT-BR e evitar "travamento"
  // do servidor do relatório HTML (PW_TEST_HTML_REPORT_OPEN=never).
  const baseUrl = process.env.BASE_URL || 'http://localhost:3001'
  log('Configurando variáveis E2E...')
  process.env.BASE_URL = baseUrl
  if (!process.env.E2E_EMAIL || !String(process.env.E2E_EMAIL).trim()) {
    throw new Error('E2E_EMAIL não definido. Configure em .env.local (E2E_EMAIL=...).')
  }
  if (!process.env.E2E_PASSWORD || !String(process.env.E2E_PASSWORD).trim()) {
    throw new Error('E2E_PASSWORD não definido. Configure em .env.local (E2E_PASSWORD=...).')
  }
  log(`Credenciais E2E carregadas: E2E_EMAIL=${process.env.E2E_EMAIL} | E2E_PASSWORD.length=${String(process.env.E2E_PASSWORD).length}`)
  process.env.PW_TEST_HTML_REPORT_OPEN = 'never'
  process.env.E2E_DEMO_PAYMENTS = process.env.E2E_DEMO_PAYMENTS || '1'

  log('Iniciando testes Playwright (auditoria E2E completa)...')
  if (opts?.grep) log(`Filtro de testes (grep): ${opts.grep}`)

  const resultsDir = path.resolve(process.cwd(), 'test-results')
  if (opts?.grep && fs.existsSync(resultsDir)) {
    fs.rmSync(resultsDir, { recursive: true, force: true })
  }
  if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true })

  const cmd = process.execPath
  const cliPath = path.resolve(process.cwd(), 'node_modules', '@playwright', 'test', 'cli.js')
  const args = [cliPath, 'test', 'tests/qa-e2e-audit.spec.ts', '--workers=1', '--reporter=line']
  if (opts?.grep) {
    let grep = String(opts.grep).replace(/\\\\/g, '\\')
    if (grep.startsWith('^')) grep = `.*${grep.slice(1)}`
    args.push('--grep', grep)
  }

  const translate = (chunk) => {
    const s = String(chunk)
    return s
      .replace(/\bRunning\b/g, 'EXECUTANDO')
      .replace(/\bpassed\b/g, 'SUCESSO')
      .replace(/\bfailed\b/g, 'FALHOU')
      .replace(/\bskipped\b/g, 'IGNORADO')
      .replace(/\bdid not run\b/g, 'NÃO EXECUTADO')
  }

  await new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: process.cwd(),
      env: { ...process.env },
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    child.stdout.on('data', (d) => process.stdout.write(translate(d)))
    child.stderr.on('data', (d) => process.stderr.write(translate(d)))
    child.on('close', (code) => {
      if (code === 0) return resolve()
      return reject(new Error(`Playwright finalizou com código ${code}.`))
    })
  })
}

function generateReport({ resultsDir, outPath, onlyPresent }) {
  if (!fs.existsSync(resultsDir)) {
    throw new Error(`Diretório test-results não encontrado: ${resultsDir}`)
  }

  const entries = fs.readdirSync(resultsDir, { withFileTypes: true })
  const runDirs = entries
    .filter((d) => d.isDirectory() && d.name.startsWith('qa-e2e-audit-'))
    .map((d) => d.name)

  const tests = runDirs
    .map((dirName) => {
      const absDir = path.join(resultsDir, dirName)
      const stat = fs.statSync(absDir)
      const mtimeMs = stat.mtimeMs
      const flow = parseFlowFromDirName(dirName)
      const idx = flow?.idx ?? null
      const flowName = canonicalFlowName(flow?.idx ?? -1, flow?.rawName ?? dirName)

      const stepList = readJsonIfExists(path.join(absDir, 'steps.json'), [])
      const steps = Array.isArray(stepList) ? stepList : []
      const durationMs = steps.reduce((acc, s) => acc + (typeof s?.ms === 'number' ? s.ms : 0), 0)

      const files = listFiles(absDir)
      const hasFailedPng = files.some((f) => /^test-failed-\d+\.png$/i.test(f))
      const hasErrorContext = files.includes('error-context.md')
      const isFailed = hasFailedPng || hasErrorContext

      const notesText = readTextIfExists(path.join(absDir, 'notes.txt'))
      const likelySkipped = !isFailed && steps.length === 0
      const status = isFailed ? 'failed' : likelySkipped ? 'skipped' : 'passed'

      const consoleText = readTextIfExists(path.join(absDir, 'console-errors.txt'))
      const pageErrorsText = readTextIfExists(path.join(absDir, 'page-errors.txt'))
      const requestFailuresText = readTextIfExists(path.join(absDir, 'request-failures.txt'))
      const httpErrorsText = readTextIfExists(path.join(absDir, 'http-errors.txt'))
      const navigationsText = readTextIfExists(path.join(absDir, 'navigations.txt'))
      const errorContextText = readTextIfExists(path.join(absDir, 'error-context.md'))

      const evidence = []
      for (const f of files) {
        if (
          f === 'trace.zip' ||
          f === 'video.webm' ||
          /^test-(?:failed|finished)-\d+\.png$/i.test(f) ||
          f === 'error-context.md' ||
          f === 'performance.json' ||
          f === 'network.json'
        ) {
          evidence.push(path.posix.join(path.basename(resultsDir), dirName.replaceAll('\\', '/'), f))
        }
      }

      return {
        idx,
        title: `${idx ?? '—'}) ${flowName}`,
        flowName,
        status,
        durationMs,
        steps,
        notesText,
        consoleText,
        pageErrorsText,
        requestFailuresText,
        httpErrorsText,
        navigationsText,
        errorContextText,
        evidence,
        dirName,
        mtimeMs,
      }
    })
    .reduce((acc, t) => {
      if (typeof t.idx !== 'number' || !Number.isFinite(t.idx)) {
        acc.push(t)
        return acc
      }
      const existingIdx = acc.findIndex((x) => x.idx === t.idx)
      if (existingIdx === -1) {
        acc.push(t)
        return acc
      }
      const existing = acc[existingIdx]
      if ((t.mtimeMs ?? 0) >= (existing.mtimeMs ?? 0)) acc[existingIdx] = t
      return acc
    }, [])
    .sort((a, b) => {
      const ai = typeof a.idx === 'number' ? a.idx : 999
      const bi = typeof b.idx === 'number' ? b.idx : 999
      if (ai !== bi) return ai - bi
      return a.flowName.localeCompare(b.flowName)
    })

  const byIdx = new Map()
  for (const t of tests) {
    if (typeof t.idx === 'number') byIdx.set(t.idx, t)
  }

  const fullTests = onlyPresent ? tests : expectedFlows().map(({ idx, flowName }) => {
    const existing = byIdx.get(idx)
    if (existing) return existing
    return {
      idx,
      title: `${idx}) ${flowName}`,
      flowName,
      status: 'not-run',
      durationMs: 0,
      steps: [],
      notesText: '',
      consoleText: '',
      pageErrorsText: '',
      requestFailuresText: '',
      httpErrorsText: '',
      navigationsText: '',
      evidence: [],
      dirName: null,
      mtimeMs: 0,
    }
  })

  const baseUrl = inferAppBaseUrl(fullTests)
  const e2eEmail = process.env.E2E_EMAIL ? 'definido' : 'não definido'
  const e2ePassword = process.env.E2E_PASSWORD ? 'definido' : 'não definido'

  const moduleFromFlow = (flowName) => {
    const f = String(flowName || '')
    if (f === 'Login' || f === 'Logout') return 'Autenticação'
    if (f === 'Checkout público') return 'Checkout'
    if (f === 'KYC (admin)') return 'KYC'
    if (f.startsWith('Admin · Eventos')) return 'Eventos/Webhooks'
    if (f.startsWith('Admin · Painel')) return 'Admin'
    if (f.startsWith('Admin · Antecipações')) return 'Admin'
    if (f === 'Configurações · Integrações') return 'Integrações'
    if (f === 'Configurações · Provedor') return 'Configurações'
    if (f === 'Navegação mobile') return 'Mobile'
    return f
  }

  const moduleOrder = [
    'Autenticação',
    'Dashboard',
    'Transações',
    'Payment Links',
    'Checkout',
    'Recebedores',
    'KYC',
    'Assinaturas',
    'Planos',
    'Ledger',
    'Antecipação',
    'Repasses',
    'Conciliação',
    'Auditoria',
    'Configurações',
    'Admin',
    'Eventos/Webhooks',
    'Integrações',
    'Mobile',
  ]

  const parseNonEmptyLines = (text) =>
    stripAnsi(String(text || ''))
      .split(/\r?\n/g)
      .map((l) => l.trim())
      .filter(Boolean)

  const issues = []
  const pushIssue = (it) => issues.push(it)

  const classifySeverity = (kind, payload) => {
    if (kind === 'info-expected-session-ended') return 'INFO'
    if (kind === 'info-aborted-by-browser') return 'INFO'
    if (kind === 'flow-not-run') return 'ALTO'
    if (kind === 'flow-skipped') return 'ALTO'
    if (kind === 'flow-failed') {
      const txt = String(payload?.errorContextText || '')
      const lower = txt.toLowerCase()
      if (lower.includes('page crashed') || lower.includes('target closed') || lower.includes('browser has disconnected')) return 'CRÍTICO'
      if (lower.includes('expect(') || lower.includes('expect(locator)') || lower.includes('tohavetext') || lower.includes('tocontaintext')) return 'MÉDIO'
      if (lower.includes('timeout')) return 'ALTO'
      return 'MÉDIO'
    }
    if (kind === 'http-500') return 'CRÍTICO'
    if (kind === 'http-404') return 'ALTO'
    if (kind === 'http-401') return 'MÉDIO'
    if (kind === 'hydration') return 'ALTO'
    if (kind === 'unhandled') return 'ALTO'
    if (kind === 'console-error') return 'ALTO'
    if (kind === 'page-error') return 'ALTO'
    if (kind === 'perf-10s') return 'ALTO'
    if (kind === 'perf-5s') return 'MÉDIO'
    if (kind === 'overflow') return 'MÉDIO'
    if (kind === 'dup-requests') return 'MÉDIO'
    if (kind === 'warning') return 'MÉDIO'
    if (kind === 'request-failure') return 'MÉDIO'
    return 'BAIXO'
  }

  const parseHttpErrors = (httpErrorsText) => {
    const out = []
    for (const l of parseNonEmptyLines(httpErrorsText)) {
      const m = l.match(/^(\d{3})\s+(\w+)\s+(https?:\/\/\S+)/i)
      if (!m) continue
      out.push({ status: Number(m[1]), method: m[2], url: m[3], raw: l })
    }
    return out
  }

  for (const t of fullTests) {
    const module = moduleFromFlow(t.flowName)
    const where = `${t.flowName} (${t.status})`
    const evidence = Array.isArray(t.evidence) && t.evidence.length ? t.evidence : []
    const reproSteps = Array.isArray(t.steps) && t.steps.length ? t.steps.map((s) => String(s?.name ?? '')).filter(Boolean) : []
    const navs = parseNonEmptyLines(t.navigationsText)
    const uniqueNavs = new Set(navs)
    const hasRedirectOrNavigation = uniqueNavs.size >= 2
    const sessionEnded =
      t.flowName === 'Logout' ||
      reproSteps.some((s) => /\bsair\b/i.test(s)) ||
      (navs.some((u) => u.includes('/login')) && navs.some((u) => u.includes('/dashboard')))

    if (t.status === 'not-run') {
      pushIssue({
        module,
        severity: classifySeverity('flow-not-run'),
        where,
        reason: 'Fluxo não executado (auditoria incompleta).',
        reproduce: reproSteps,
        evidence,
        suggestion: 'Executar a auditoria completa em produção com credenciais válidas e BASE_URL correto.',
      })
      continue
    }
    if (t.status === 'skipped') {
      pushIssue({
        module,
        severity: classifySeverity('flow-skipped'),
        where,
        reason: 'Fluxo ignorado (skipped) — auditoria incompleta para este módulo.',
        reproduce: reproSteps,
        evidence,
        suggestion: 'Remover bloqueios de execução (credenciais/slug/permite acesso) e reexecutar a auditoria.',
      })
    }
    if (t.status === 'failed') {
      pushIssue({
        module,
        severity: classifySeverity('flow-failed', { errorContextText: t.errorContextText }),
        where,
        reason: 'Fluxo falhou durante a navegação automatizada.',
        reproduce: reproSteps,
        evidence,
        suggestion: 'Corrigir a causa raiz do erro do fluxo e reexecutar a auditoria (traces/screenshot/console/network).',
      })
    }

    const http = parseHttpErrors(t.httpErrorsText)
    for (const h of http) {
      if (h.status >= 500) {
        pushIssue({
          module,
          severity: classifySeverity('http-500'),
          where,
          reason: `Endpoint retornou ${h.status}: ${h.method} ${h.url}`,
          reproduce: reproSteps,
          evidence,
          suggestion: 'Checar logs do servidor (Vercel), identificar erro do handler e ajustar tratamento de exceções/queries.',
        })
      } else if (h.status === 404) {
        pushIssue({
          module,
          severity: classifySeverity('http-404'),
          where,
          reason: `Endpoint inexistente (404): ${h.method} ${h.url}`,
          reproduce: reproSteps,
          evidence,
          suggestion: 'Validar rota/handler; checar deploy e rewrites; corrigir endpoint incorreto no client.',
        })
      } else if (h.status === 401 || h.status === 403) {
        if (sessionEnded) {
          pushIssue({
            module,
            severity: classifySeverity('info-expected-session-ended'),
            where,
            reason: `Comportamento esperado após encerramento da sessão. (${h.status} ${h.method} ${h.url})`,
            reproduce: reproSteps,
            evidence,
            suggestion: 'Nenhuma ação necessária.',
          })
        } else {
          pushIssue({
            module,
            severity: classifySeverity('http-401'),
            where,
            reason: `Endpoint retornou ${h.status} (possível auth/sessão/cookies): ${h.method} ${h.url}`,
            reproduce: reproSteps,
            evidence,
            suggestion: 'Validar sessão/cookies (sb-*) e middleware de autenticação; verificar autorização por organization_id/roles.',
          })
        }
      }
    }

    const consoleLines = parseNonEmptyLines(t.consoleText)
    for (const l of consoleLines) {
      const lower = l.toLowerCase()
      if (lower.includes('failed to load resource') && lower.includes('status of')) {
        const m = lower.match(/\bstatus of (\d{3})\b/)
        const status = m ? Number(m[1]) : null
        if ((status === 401 || status === 403) && sessionEnded) {
          pushIssue({
            module,
            severity: classifySeverity('info-expected-session-ended'),
            where,
            reason: `Comportamento esperado após encerramento da sessão. (${l})`,
            reproduce: reproSteps,
            evidence,
            suggestion: 'Nenhuma ação necessária.',
          })
          continue
        }
        if (status === 404) {
          pushIssue({
            module,
            severity: classifySeverity('http-404'),
            where,
            reason: `Endpoint inexistente (404) reportado no console. (${l})`,
            reproduce: reproSteps,
            evidence,
            suggestion: 'Validar rota/handler; checar deploy e rewrites; corrigir endpoint incorreto no client.',
          })
          continue
        }
        if (typeof status === 'number' && status >= 500) {
          pushIssue({
            module,
            severity: classifySeverity('http-500'),
            where,
            reason: `Endpoint retornou ${status} (reportado no console). (${l})`,
            reproduce: reproSteps,
            evidence,
            suggestion: 'Checar logs do servidor (Vercel), identificar erro do handler e ajustar tratamento de exceções/queries.',
          })
          continue
        }
        if (status === 401 || status === 403) {
          pushIssue({
            module,
            severity: classifySeverity('http-401'),
            where,
            reason: `Endpoint retornou ${status} (reportado no console; possível auth/sessão/cookies). (${l})`,
            reproduce: reproSteps,
            evidence,
            suggestion: 'Validar sessão/cookies (sb-*) e middleware de autenticação; verificar autorização por organization_id/roles.',
          })
          continue
        }
      }
      if (lower.includes('hydration failed') || lower.includes('text content does not match') || lower.includes('did not match server-rendered html')) {
        pushIssue({
          module,
          severity: classifySeverity('hydration'),
          where,
          reason: `Hydration/SSR mismatch: ${l}`,
          reproduce: reproSteps,
          evidence,
          suggestion: 'Garantir que o HTML renderizado no servidor é determinístico (sem Date.now/random no render) e que Client Components não mudem markup inicial.',
        })
        continue
      }
      if (l.includes('UNHANDLEDREJECTION:') || l.includes('WINDOWERROR:')) {
        pushIssue({
          module,
          severity: classifySeverity('unhandled'),
          where,
          reason: l,
          reproduce: reproSteps,
          evidence,
          suggestion: 'Tratar promise rejections; adicionar try/catch e fallback de UI; revisar hooks com async e efeitos.',
        })
        continue
      }
      if (l.startsWith('ERROR:')) {
        pushIssue({
          module,
          severity: classifySeverity('console-error'),
          where,
          reason: l,
          reproduce: reproSteps,
          evidence,
          suggestion: 'Investigar o stack/arquivo do erro no console e corrigir a causa raiz (null/undefined, SSR/CSR).',
        })
        continue
      }
      if (l.startsWith('WARNING:')) {
        pushIssue({
          module,
          severity: classifySeverity('warning'),
          where,
          reason: l,
          reproduce: reproSteps,
          evidence,
          suggestion: 'Tratar warnings do React/Next/Supabase; eliminar logs de warning e ajustar dependências/effects.',
        })
      }
    }

    const pageErrLines = parseNonEmptyLines(t.pageErrorsText)
    for (const l of pageErrLines) {
      pushIssue({
        module,
        severity: classifySeverity('page-error'),
        where,
        reason: `Erro de página: ${l}`,
        reproduce: reproSteps,
        evidence,
        suggestion: 'Corrigir o erro de runtime no client (React) e garantir que a UI tem boundary/fallback.',
      })
    }

    const reqFail = splitRequestFailures(t.requestFailuresText, baseUrl).app
    for (const l of reqFail) {
      const lower = String(l).toLowerCase()
      const isAborted = lower.includes('net::err_aborted')
      const looksLikeLogoutCall = lower.includes('/auth/v1/logout') || lower.includes(' logout')
      if (isAborted && (hasRedirectOrNavigation || sessionEnded || looksLikeLogoutCall)) {
        const reason = sessionEnded
          ? `Comportamento esperado após encerramento da sessão. (${l})`
          : `Requisição cancelada pelo navegador durante navegação/redirect. (${l})`
        pushIssue({
          module,
          severity: classifySeverity(sessionEnded ? 'info-expected-session-ended' : 'info-aborted-by-browser'),
          where,
          reason,
          reproduce: reproSteps,
          evidence,
          suggestion: 'Nenhuma ação necessária.',
        })
      } else {
        pushIssue({
          module,
          severity: classifySeverity('request-failure'),
          where,
          reason: `Falha de requisição: ${l}`,
          reproduce: reproSteps,
          evidence,
          suggestion: 'Verificar endpoint, CORS, timeouts, e tratamento de erro no client; checar instabilidade de rede.',
        })
      }
    }

    for (const l of parseNonEmptyLines(t.notesText)) {
      if (l.startsWith('Overflow horizontal detectado')) {
        pushIssue({
          module,
          severity: classifySeverity('overflow'),
          where,
          reason: l,
          reproduce: reproSteps,
          evidence,
          suggestion: 'Revisar containers/tabelas e aplicar overflow-x auto; ajustar widths e truncation.',
        })
      } else if (l.startsWith('Performance: load >= 10s')) {
        pushIssue({
          module,
          severity: classifySeverity('perf-10s'),
          where,
          reason: l,
          reproduce: reproSteps,
          evidence,
          suggestion: 'Otimizar queries/serialização; reduzir payload; aplicar caching/ISR quando aplicável.',
        })
      } else if (l.startsWith('Performance: load >= 5s')) {
        pushIssue({
          module,
          severity: classifySeverity('perf-5s'),
          where,
          reason: l,
          reproduce: reproSteps,
          evidence,
          suggestion: 'Analisar waterfall de rede e reduzir chamadas; otimizar render e bundle.',
        })
      } else if (l.startsWith('Possível duplicidade de requests')) {
        pushIssue({
          module,
          severity: classifySeverity('dup-requests'),
          where,
          reason: l,
          reproduce: reproSteps,
          evidence,
          suggestion: 'Checar useEffect dependencies/React StrictMode; consolidar fetch; evitar re-fetch por render.',
        })
      }
    }
  }

  const severityOrder = ['CRÍTICO', 'ALTO', 'MÉDIO', 'BAIXO', 'INFO']
  const counts = { 'CRÍTICO': 0, ALTO: 0, 'MÉDIO': 0, BAIXO: 0, INFO: 0 }
  for (const i of issues) counts[i.severity] = (counts[i.severity] ?? 0) + 1

  const byModule = new Map()
  for (const m of moduleOrder) byModule.set(m, [])
  for (const i of issues) {
    const list = byModule.get(i.module) ?? []
    list.push(i)
    byModule.set(i.module, list)
  }

  const lines = []
  lines.push('# AUDITORIA FINAL — Connekt Pay v1.0.0')
  lines.push('')
  lines.push(`Data: ${new Date().toISOString()}`)
  lines.push(`Base URL: ${baseUrl}`)
  lines.push('Ferramenta: Playwright (navegação automática + coleta de console/network/performance)')
  lines.push('')
  lines.push('## Critério de aprovação para homologação')
  lines.push('- A plataforma só é considerada pronta para homologação quando não existir nenhum problema CRÍTICO nem ALTO.')
  lines.push('')
  lines.push('## Resumo')
  lines.push(`- CRÍTICO: ${counts['CRÍTICO']}`)
  lines.push(`- ALTO: ${counts.ALTO}`)
  lines.push(`- MÉDIO: ${counts['MÉDIO']}`)
  lines.push(`- BAIXO: ${counts.BAIXO}`)
  lines.push(`- INFO: ${counts.INFO}`)
  lines.push('')
  lines.push('## Ambiente de execução')
  lines.push(`- BASE_URL: ${baseUrl}`)
  lines.push(`- E2E_EMAIL: ${e2eEmail}`)
  lines.push(`- E2E_PASSWORD: ${e2ePassword}`)
  lines.push('')
  lines.push('## Resultados por módulo')

  for (const moduleName of moduleOrder) {
    const moduleIssues = byModule.get(moduleName) ?? []
    const blockingIssues = moduleIssues.filter((x) => x?.severity !== 'INFO')
    const approved = blockingIssues.length === 0
    lines.push('')
    lines.push(`### ${moduleName} — ${approved ? 'APROVADO' : 'REPROVADO'}`)
    if (moduleIssues.length === 0) continue
    moduleIssues.sort((a, b) => severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity))
    let idx = 1
    for (const it of moduleIssues) {
      lines.push('')
      lines.push(`${idx}) [${it.severity}] ${mdEscape(it.reason)}`)
      lines.push(`- Onde ocorreu: ${mdEscape(it.where)}`)
      lines.push('- Motivo: ' + mdEscape(it.reason))
      const how = []
      how.push(`1. Defina BASE_URL=${baseUrl}`)
      how.push(`2. Defina E2E_EMAIL e E2E_PASSWORD válidos`)
      how.push('3. Rode: `node scripts/qa-e2e-report.mjs --run --no-setup`')
      if (Array.isArray(it.reproduce) && it.reproduce.length) {
        how.push('4. Etapas do fluxo:')
        for (const s of it.reproduce) how.push(`   - ${s}`)
      }
      lines.push('- Como reproduzir:')
      for (const s of how) lines.push(`  - ${mdEscape(s)}`)
      lines.push('- Evidência:')
      if (it.evidence && it.evidence.length) {
        for (const e of it.evidence) lines.push(`  - ${e}`)
      } else {
        lines.push('  - (sem evidência automática capturada)')
      }
      lines.push(`- Sugestão de correção: ${mdEscape(it.suggestion)}`)
      idx += 1
    }
  }

  const ready = counts['CRÍTICO'] === 0 && counts.ALTO === 0
  lines.push('')
  lines.push('## Conclusão')
  lines.push(`- Pronta para homologação (sem CRÍTICO/ALTO): ${ready ? 'SIM' : 'NÃO'}`)

  fs.writeFileSync(outPath, lines.join('\n') + '\n', 'utf8')
  log(`Relatório gerado em: ${outPath}`)
}

async function main() {
  const envLocalPath = path.resolve(process.cwd(), '.env.local')
  loadEnvFile(envLocalPath)
  const requiredFromFile = readEnvFileKeys(envLocalPath, ['E2E_EMAIL', 'E2E_PASSWORD'])
  if (!requiredFromFile.E2E_EMAIL || !String(requiredFromFile.E2E_EMAIL).trim()) {
    throw new Error('E2E_EMAIL não definido em .env.local.')
  }
  if (!requiredFromFile.E2E_PASSWORD || !String(requiredFromFile.E2E_PASSWORD).trim()) {
    throw new Error('E2E_PASSWORD não definido em .env.local.')
  }
  process.env.E2E_EMAIL = requiredFromFile.E2E_EMAIL
  process.env.E2E_PASSWORD = requiredFromFile.E2E_PASSWORD

  const cli = parseCliArgs(process.argv.slice(2))

  const canSetup = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
  const shouldSetup = (cli.doSetup || (cli.doRun && !cli.noSetup)) && canSetup
  if (shouldSetup) {
    process.env.BASE_URL = process.env.BASE_URL || 'http://localhost:3001'
    const { checkoutSlug } = await ensureDemoUserAndSeed()
    if (checkoutSlug && !process.env.E2E_CHECKOUT_SLUG) process.env.E2E_CHECKOUT_SLUG = checkoutSlug
  }

  if (cli.doRun) {
    await runPlaywrightAudit({ grep: cli.grep }).catch((e) => {
      log(`FALHOU: ${stripAnsi(e instanceof Error ? e.message : String(e))}`)
      process.exitCode = 1
    })
  }

  const resultsDir = path.resolve(process.cwd(), 'test-results')
  const outPath = path.resolve(process.cwd(), 'AUDITORIA-FINAL-V1.0.0.md')
  generateReport({ resultsDir, outPath, onlyPresent: Boolean(cli.grep) })
}

await main()

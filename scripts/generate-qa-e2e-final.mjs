import fs from 'node:fs'
import path from 'node:path'

function stripAnsi(s) {
  return String(s ?? '').replace(/\u001b\[[0-9;]*m/g, '')
}

function safeNumber(n) {
  const x = Number(n)
  return Number.isFinite(x) ? x : null
}

function msToHuman(ms) {
  const n = safeNumber(ms)
  if (n === null || n < 0) return 'N/D'
  if (n < 1000) return `${Math.round(n)} ms`
  const s = n / 1000
  if (s < 60) return `${s.toFixed(1)} s`
  const m = Math.floor(s / 60)
  const rs = Math.round(s % 60)
  return `${m}m ${rs}s`
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8')
  } catch {
    return ''
  }
}

function readJson(filePath, fallback) {
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

function parseFlowFromDirName(dirName) {
  const clean = String(dirName).replace(/-+$/g, '')
  const m = clean.match(/-(\d+)-(.+)$/)
  if (!m) return null
  const idx = Number(m[1])
  if (!Number.isFinite(idx)) return null
  return { idx, rawName: String(m[2] ?? '').trim() }
}

function canonicalFlowName(idx) {
  const map = new Map([
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
    [17, 'Navegação mobile'],
  ])
  return map.get(idx) ?? `Fluxo ${idx}`
}

function splitRequestFailures(text, appBaseUrl) {
  const appOrigin = (() => {
    try {
      return new URL(appBaseUrl).origin
    } catch {
      return null
    }
  })()

  const app = []
  const external = []
  const lines = stripAnsi(text)
    .split(/\r?\n/g)
    .map((l) => l.trim())
    .filter(Boolean)

  for (const l of lines) {
    const urlMatch = l.match(/\bhttps?:\/\/[^\s]+/i)
    const url = urlMatch?.[0] ?? null
    const origin = (() => {
      try {
        return url ? new URL(url).origin : null
      } catch {
        return null
      }
    })()
    const isExternal = Boolean(appOrigin && origin && origin !== appOrigin)
    if (isExternal) external.push(l)
    else app.push(l)
  }
  return { app, external }
}

function classifyFailure({ consoleErrorsText, pageErrorsText, httpErrorsText, requestFailuresText, appBaseUrl }) {
  const httpLines = stripAnsi(httpErrorsText)
    .split(/\r?\n/g)
    .map((l) => l.trim())
    .filter(Boolean)

  const requestSplit = splitRequestFailures(requestFailuresText, appBaseUrl)
  const hasAppRequestsFailing = requestSplit.app.length > 0
  const hasExternalRequestsFailing = requestSplit.external.length > 0
  const hasConsole = stripAnsi(consoleErrorsText).trim().length > 0
  const hasPage = stripAnsi(pageErrorsText).trim().length > 0
  const hasHttp = httpLines.length > 0

  if (hasHttp || hasPage || hasConsole || hasAppRequestsFailing) return 'APLICAÇÃO'
  if (hasExternalRequestsFailing) return 'EXTERNO'
  return 'INDETERMINADO'
}

function statusPt(status) {
  const s = String(status || '').toLowerCase()
  if (s === 'passed') return 'SUCESSO'
  if (s === 'failed') return 'FALHOU'
  if (s === 'skipped') return 'IGNORADO'
  if (s === 'not-run') return 'NÃO EXECUTADO'
  return '—'
}

function pickLatestPerFlow(resultsDir) {
  const entries = fs.readdirSync(resultsDir, { withFileTypes: true })
  const runDirs = entries.filter((d) => d.isDirectory() && d.name.startsWith('qa-e2e-audit-')).map((d) => d.name)
  const byIdx = new Map()

  for (const dirName of runDirs) {
    const flow = parseFlowFromDirName(dirName)
    if (!flow) continue
    const absDir = path.join(resultsDir, dirName)
    let mtimeMs = 0
    try {
      mtimeMs = fs.statSync(absDir).mtimeMs
    } catch {
      mtimeMs = 0
    }
    const current = byIdx.get(flow.idx)
    if (!current || mtimeMs > current.mtimeMs) {
      byIdx.set(flow.idx, { idx: flow.idx, dirName, absDir, mtimeMs })
    }
  }

  return byIdx
}

function collectTestInfo({ resultsDir, absDir, dirName, idx, appBaseUrl }) {
  const files = listFiles(absDir)
  const evidence = files
    .filter((f) => f === 'trace.zip' || f === 'video.webm' || /^test-(?:failed|finished)-\d+\.png$/i.test(f) || f === 'error-context.md')
    .map((f) => {
      const rel = path.relative(process.cwd(), path.join(resultsDir, dirName, f))
      return rel.replaceAll('\\', '/')
    })

  const steps = readJson(path.join(absDir, 'steps.json'), [])
  const durationMs = Array.isArray(steps) ? steps.reduce((acc, s) => acc + (typeof s?.ms === 'number' ? s.ms : 0), 0) : 0

  const hasFailedPng = files.some((f) => /^test-failed-\d+\.png$/i.test(f))
  const hasErrorContext = files.includes('error-context.md')
  const isFailed = hasFailedPng || hasErrorContext

  const notesText = readText(path.join(absDir, 'notes.txt'))
  const consoleErrorsText = readText(path.join(absDir, 'console-errors.txt'))
  const pageErrorsText = readText(path.join(absDir, 'page-errors.txt'))
  const requestFailuresText = readText(path.join(absDir, 'request-failures.txt'))
  const httpErrorsText = readText(path.join(absDir, 'http-errors.txt'))
  const navigationsText = readText(path.join(absDir, 'navigations.txt'))

  const likelySkipped = !isFailed && (!Array.isArray(steps) || steps.length === 0)
  const status = isFailed ? 'failed' : likelySkipped ? 'skipped' : 'passed'

  const failureClass =
    status === 'failed'
      ? classifyFailure({ consoleErrorsText, pageErrorsText, httpErrorsText, requestFailuresText, appBaseUrl })
      : null

  const splitFailures = splitRequestFailures(requestFailuresText, appBaseUrl)

  return {
    idx,
    flowName: canonicalFlowName(idx),
    status,
    durationMs,
    durationHuman: msToHuman(durationMs),
    evidence,
    notesText,
    consoleErrorsText,
    pageErrorsText,
    requestFailuresText,
    httpErrorsText,
    navigationsText,
    failureClass,
    requestFailuresApp: splitFailures.app,
    requestFailuresExternal: splitFailures.external,
    absDir,
    dirName,
  }
}

const resultsDir = path.resolve(process.cwd(), process.env.QA_E2E_RESULTS_DIR || 'test-results')
const outPath = path.resolve(process.cwd(), 'QA-E2E-FINAL.md')
const baseUrl = process.env.BASE_URL || 'http://localhost:3001'

if (!fs.existsSync(resultsDir)) {
  console.error(`Diretório não encontrado: ${resultsDir}`)
  process.exit(1)
}

const latestByIdx = pickLatestPerFlow(resultsDir)
const flows = []
for (let i = 1; i <= 17; i += 1) {
  const hit = latestByIdx.get(i) ?? null
  if (!hit) {
    flows.push({
      idx: i,
      flowName: canonicalFlowName(i),
      status: 'not-run',
      durationMs: null,
      durationHuman: 'N/D',
      evidence: [],
      notesText: '',
      consoleErrorsText: '',
      pageErrorsText: '',
      requestFailuresText: '',
      httpErrorsText: '',
      navigationsText: '',
      failureClass: null,
      requestFailuresApp: [],
      requestFailuresExternal: [],
      absDir: null,
      dirName: null,
    })
    continue
  }
  flows.push(collectTestInfo({ resultsDir, absDir: hit.absDir, dirName: hit.dirName, idx: i, appBaseUrl: baseUrl }))
}

const counts = flows.reduce(
  (acc, f) => {
    acc.total += 1
    acc[f.status] = (acc[f.status] ?? 0) + 1
    return acc
  },
  { total: 0, passed: 0, failed: 0, skipped: 0, 'not-run': 0 },
)

const failed = flows.filter((f) => f.status === 'failed')
const totalDurationMs = flows.reduce((acc, f) => acc + (typeof f.durationMs === 'number' ? f.durationMs : 0), 0)

const md = []
md.push(`# QA E2E Final — Connekt Pay (17 fluxos)`)
md.push('')
md.push(`Data de geração: ${new Date().toISOString()}`)
md.push(`BASE_URL: ${baseUrl}`)
md.push(`Fonte: artefatos em \`${path.relative(process.cwd(), resultsDir).replaceAll('\\', '/')}/\` (selecionado o diretório mais recente por fluxo 1–17).`)
md.push('')
md.push('## Status geral')
md.push('')
md.push(`- Total: ${counts.total}`)
md.push(`- SUCESSO: ${counts.passed}`)
md.push(`- FALHOU: ${counts.failed}`)
md.push(`- IGNORADO: ${counts.skipped}`)
md.push(`- NÃO EXECUTADO (sem artefatos): ${counts['not-run']}`)
md.push(`- Tempo total (soma das etapas): ${msToHuman(totalDurationMs)}`)
md.push('')
md.push('## Matriz (17 fluxos)')
md.push('')
md.push(`| # | Fluxo | Status | Tempo (soma etapas) | Evidências |`)
md.push(`|---:|---|---:|---:|---|`)
for (const f of flows) {
  const ev = f.evidence.length ? f.evidence.map((e) => `\`${e}\``).join('<br/>') : '—'
  md.push(`| ${f.idx} | ${f.flowName} | ${statusPt(f.status)} | ${f.durationHuman} | ${ev} |`)
}
md.push('')
md.push('## Resultados por fluxo')
md.push('')
for (const f of flows) {
  md.push(`### ${f.idx}) ${f.flowName}`)
  md.push(`- Status: ${statusPt(f.status)}`)
  md.push(`- Tempo (soma das etapas): ${f.durationHuman}`)
  if (f.status === 'failed') {
    md.push(`- Classificação da falha: ${f.failureClass}`)
  }
  if (f.evidence.length) {
    md.push(`- Evidências:`)
    for (const e of f.evidence) md.push(`  - \`${e}\``)
  } else {
    md.push(`- Evidências: —`)
  }

  const notes = stripAnsi(f.notesText).split(/\r?\n/g).map((l) => l.trim()).filter(Boolean)
  if (notes.length) {
    md.push(`- Notas:`)
    for (const n of notes.slice(0, 12)) md.push(`  - ${n}`)
    if (notes.length > 12) md.push(`  - (mais ${notes.length - 12} linhas)`)
  }

  const navs = stripAnsi(f.navigationsText).split(/\r?\n/g).map((l) => l.trim()).filter(Boolean)
  if (navs.length) {
    md.push(`- Navegações:`)
    for (const n of navs.slice(0, 12)) md.push(`  - ${n}`)
    if (navs.length > 12) md.push(`  - (mais ${navs.length - 12} linhas)`)
  }

  const httpErr = stripAnsi(f.httpErrorsText).split(/\r?\n/g).map((l) => l.trim()).filter(Boolean)
  if (httpErr.length) {
    md.push(`- HTTP >= 400:`)
    for (const l of httpErr.slice(0, 12)) md.push(`  - ${l}`)
    if (httpErr.length > 12) md.push(`  - (mais ${httpErr.length - 12} linhas)`)
  }

  if (f.requestFailuresApp.length || f.requestFailuresExternal.length) {
    md.push(`- Falhas de requisição:`)
    if (f.requestFailuresApp.length) {
      md.push(`  - Aplicação (${f.requestFailuresApp.length}):`)
      for (const l of f.requestFailuresApp.slice(0, 8)) md.push(`    - ${l}`)
      if (f.requestFailuresApp.length > 8) md.push(`    - (mais ${f.requestFailuresApp.length - 8} linhas)`)
    }
    if (f.requestFailuresExternal.length) {
      md.push(`  - Externas (${f.requestFailuresExternal.length}):`)
      for (const l of f.requestFailuresExternal.slice(0, 8)) md.push(`    - ${l}`)
      if (f.requestFailuresExternal.length > 8) md.push(`    - (mais ${f.requestFailuresExternal.length - 8} linhas)`)
    }
  }

  md.push('')
}

md.push('## Falhas (resumo)')
md.push('')
if (!failed.length) {
  md.push('- Nenhuma falha registrada nos artefatos mais recentes por fluxo.')
} else {
  for (const f of failed) {
    const errLine = stripAnsi(f.notesText).split(/\r?\n/g).find((l) => l.trim().startsWith('Erro:')) ?? ''
    md.push(`- ${f.idx}) ${f.flowName}: ${f.failureClass}${errLine ? ` — ${errLine.replace(/^Erro:\s*/i, '')}` : ''}`)
  }
}
md.push('')
md.push('## Observações')
md.push('')
md.push('- Critério de seleção de artefatos: para cada fluxo 1–17, foi escolhido o diretório `qa-e2e-audit-*` com maior `mtime` no `test-results/` que corresponde ao índice do fluxo.')
md.push('- “EXTERNO” indica falhas atribuíveis a recursos fora do BASE_URL (ex.: provider/serviços externos), quando não há evidência de erro HTTP/console/page na aplicação.')
md.push('- “NÃO EXECUTADO” significa ausência de artefatos correspondentes no `test-results/` para o fluxo.')
md.push('')

fs.writeFileSync(outPath, md.join('\n'), 'utf8')
console.log(`OK: gerado ${outPath}`)

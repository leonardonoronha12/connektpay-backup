import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

const root = path.resolve(process.cwd())

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

function requireEnv(name) {
  const v = process.env[name]
  if (!v) throw new Error(`Missing ${name}`)
  return v
}

async function requestJson(url, { method, token, body }) {
  const res = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': body ? 'application/json' : undefined,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }
  if (!res.ok) {
    const message = (json && (json.message || json.error || json.msg)) || text || `HTTP ${res.status}`
    const err = new Error(String(message))
    ;(err).status = res.status
    ;(err).payload = json
    throw err
  }
  return json
}

async function supabaseCreateOrGetProject({ accessToken, organizationSlug, projectName, dbPassword, region }) {
  const base = 'https://api.supabase.com'
  try {
    const created = await requestJson(`${base}/v1/projects`, {
      method: 'POST',
      token: accessToken,
      body: {
        name: projectName,
        organization_slug: organizationSlug,
        db_pass: dbPassword,
        region,
      },
    })
    return created
  } catch (e) {
    if (e && typeof e === 'object' && (e).status === 409) {
      const list = await requestJson(`${base}/v1/projects`, { method: 'GET', token: accessToken })
      const found = Array.isArray(list) ? list.find((p) => String(p?.name ?? '') === projectName) : null
      if (!found?.ref) throw e
      return found
    }
    throw e
  }
}

async function supabaseWaitForActive({ accessToken, ref }) {
  const base = 'https://api.supabase.com'
  for (let i = 0; i < 90; i += 1) {
    const proj = await requestJson(`${base}/v1/projects/${ref}`, { method: 'GET', token: accessToken })
    const status = String(proj?.status ?? '')
    if (status.includes('ACTIVE')) return proj
    await new Promise((r) => setTimeout(r, 5000))
  }
  throw new Error('Supabase project did not become ACTIVE in time')
}

async function supabaseRunSql({ accessToken, ref, sql }) {
  const base = 'https://api.supabase.com'
  return requestJson(`${base}/v1/projects/${ref}/database/query`, {
    method: 'POST',
    token: accessToken,
    body: { query: sql },
  })
}

async function supabaseGetKeys({ accessToken, ref }) {
  const base = 'https://api.supabase.com'
  const keys = await requestJson(`${base}/v1/projects/${ref}/api-keys?reveal=true`, { method: 'GET', token: accessToken })
  const list = Array.isArray(keys) ? keys : []
  const anon = list.find((k) => String(k?.name ?? k?.type ?? '').toLowerCase().includes('anon'))?.api_key ?? null
  const service = list.find((k) => String(k?.name ?? k?.type ?? '').toLowerCase().includes('service'))?.api_key ?? null
  return { anon, service }
}

async function supabaseSetAuthUrls({ accessToken, ref, siteUrl, allowList }) {
  const base = 'https://api.supabase.com'
  return requestJson(`${base}/v1/projects/${ref}/config/auth`, {
    method: 'PATCH',
    token: accessToken,
    body: {
      site_url: siteUrl,
      uri_allow_list: allowList,
    },
  })
}

async function vercelCreateProject({ token, teamId, name }) {
  const base = 'https://api.vercel.com'
  const qs = teamId ? `?teamId=${encodeURIComponent(teamId)}` : ''
  try {
    return await fetch(`${base}/v9/projects${qs}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name, framework: 'nextjs' }),
    }).then(async (res) => {
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        const code = json?.error?.code
        if (res.status === 409 || code === 'PROJECT_ALREADY_EXISTS') return { ok: true }
        throw new Error(json?.error?.message || `Vercel create project failed (${res.status})`)
      }
      return json
    })
  } catch (e) {
    throw e
  }
}

async function vercelUpsertEnv({ token, teamId, projectName, key, value, targets }) {
  const base = 'https://api.vercel.com'
  const qs = new URLSearchParams()
  qs.set('upsert', 'true')
  if (teamId) qs.set('teamId', teamId)
  const res = await fetch(`${base}/v10/projects/${encodeURIComponent(projectName)}/env?${qs.toString()}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ key, value, type: 'encrypted', target: targets }),
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) throw new Error(json?.error?.message || `Vercel env failed for ${key} (${res.status})`)
  return json
}

async function vercelDeploy({ token, projectName, scope }) {
  const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx'
  const args = ['vercel', 'deploy', '--prod', '--yes', '--name', projectName]
  if (scope) args.push('--scope', scope)

  return await new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, VERCEL_TOKEN: token },
    })
    let out = ''
    let err = ''
    child.stdout.on('data', (d) => {
      out += d.toString()
    })
    child.stderr.on('data', (d) => {
      err += d.toString()
    })
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(err || out || `vercel deploy failed (${code})`))
      const matches = out.match(/https:\/\/[^\s]+/g) ?? []
      const url = matches.findLast((m) => m.includes('.vercel.app')) ?? matches[matches.length - 1] ?? null
      if (!url) return reject(new Error('Could not detect deployment URL from Vercel output'))
      resolve(url)
    })
  })
}

async function writeLocalEnv({ supabaseUrl, anonKey, serviceKey }) {
  if (!['1', 'true', 'yes'].includes(String(process.env.WRITE_ENV_LOCAL || '').toLowerCase())) return
  const filePath = path.join(root, '.env.local')
  const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : ''
  const lines = existing.split(/\r?\n/)
  const map = new Map()
  for (const line of lines) {
    const idx = line.indexOf('=')
    if (idx <= 0) continue
    map.set(line.slice(0, idx), line.slice(idx + 1))
  }
  map.set('NEXT_PUBLIC_SUPABASE_URL', supabaseUrl)
  map.set('NEXT_PUBLIC_SUPABASE_ANON_KEY', anonKey)
  if (serviceKey) map.set('SUPABASE_SERVICE_ROLE_KEY', serviceKey)
  const out = [...map.entries()].map(([k, v]) => `${k}=${v ?? ''}`).join('\n') + '\n'
  fs.writeFileSync(filePath, out, 'utf8')
}

function pickOptionalEnv(key) {
  const v = process.env[key]
  if (!v) return null
  return v
}

async function main() {
  loadEnvFile(path.join(root, '.env.deploy.local'))

  const supabaseAccessToken = requireEnv('SUPABASE_ACCESS_TOKEN')
  const supabaseOrgSlug = requireEnv('SUPABASE_ORGANIZATION_SLUG')
  const supabaseProjectName = process.env.SUPABASE_PROJECT_NAME || 'connektpay'
  const supabaseDbPassword = requireEnv('SUPABASE_DB_PASSWORD')
  const supabaseRegion = process.env.SUPABASE_REGION || 'sa-east-1'

  const vercelToken = requireEnv('VERCEL_TOKEN')
  const vercelProjectName = process.env.VERCEL_PROJECT_NAME || 'connektpay'
  const vercelTeamId = process.env.VERCEL_TEAM_ID || ''
  const vercelScope = process.env.VERCEL_SCOPE || ''

  console.log('Provisioning Supabase project...')
  const project = await supabaseCreateOrGetProject({
    accessToken: supabaseAccessToken,
    organizationSlug: supabaseOrgSlug,
    projectName: supabaseProjectName,
    dbPassword: supabaseDbPassword,
    region: supabaseRegion,
  })
  const ref = String(project?.ref || project?.project_ref || '')
  if (!ref) throw new Error('Could not determine Supabase project ref')

  await supabaseWaitForActive({ accessToken: supabaseAccessToken, ref })
  const sqlPath = path.join(root, 'supabase', 'setup.sql')
  if (!fs.existsSync(sqlPath)) throw new Error('Missing supabase/setup.sql')
  const sql = fs.readFileSync(sqlPath, 'utf8')
  await supabaseRunSql({ accessToken: supabaseAccessToken, ref, sql })
  const keys = await supabaseGetKeys({ accessToken: supabaseAccessToken, ref })
  if (!keys.anon) throw new Error('Could not fetch Supabase anon key')
  if (!keys.service) throw new Error('Could not fetch Supabase service_role key')
  const supabaseUrl = `https://${ref}.supabase.co`
  await writeLocalEnv({ supabaseUrl, anonKey: keys.anon, serviceKey: keys.service })

  console.log('Provisioning Vercel project and env vars...')
  await vercelCreateProject({ token: vercelToken, teamId: vercelTeamId || null, name: vercelProjectName })
  await vercelUpsertEnv({
    token: vercelToken,
    teamId: vercelTeamId || null,
    projectName: vercelProjectName,
    key: 'NEXT_PUBLIC_SUPABASE_URL',
    value: supabaseUrl,
    targets: ['production', 'preview'],
  })
  await vercelUpsertEnv({
    token: vercelToken,
    teamId: vercelTeamId || null,
    projectName: vercelProjectName,
    key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    value: keys.anon,
    targets: ['production', 'preview'],
  })
  await vercelUpsertEnv({
    token: vercelToken,
    teamId: vercelTeamId || null,
    projectName: vercelProjectName,
    key: 'SUPABASE_SERVICE_ROLE_KEY',
    value: keys.service,
    targets: ['production', 'preview'],
  })

  const optionalKeys = [
    'MYGATEWAY_BASE_URL',
    'MYGATEWAY_API_KEY',
    'MYGATEWAY_WEBHOOK_SECRET',
    'CRON_SECRET',
    'EVENTS_PROCESS_SECRET',
  ]

  for (const key of optionalKeys) {
    const value = pickOptionalEnv(key)
    if (!value) continue
    await vercelUpsertEnv({
      token: vercelToken,
      teamId: vercelTeamId || null,
      projectName: vercelProjectName,
      key,
      value,
      targets: ['production', 'preview'],
    })
  }

  const deployUrl = await vercelDeploy({ token: vercelToken, projectName: vercelProjectName, scope: vercelScope || null })
  const allowList = [
    deployUrl,
    `${deployUrl}/reset-password`,
    'http://localhost:3000',
    'http://localhost:3000/reset-password',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3000/reset-password',
  ]
  await supabaseSetAuthUrls({ accessToken: supabaseAccessToken, ref, siteUrl: deployUrl, allowList })

  console.log('')
  console.log(`Production URL: ${deployUrl}`)
  console.log(`Supabase URL: ${supabaseUrl}`)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})

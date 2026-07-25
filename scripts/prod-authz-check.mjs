import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

function parseEnvLocal(filePath) {
  const txt = fs.readFileSync(filePath, 'utf8')
  const env = {}
  for (const raw of txt.split(/\r?\n/)) {
    const m = raw.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!m) continue
    const key = m[1]
    let val = m[2].trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1)
    env[key] = val
  }
  return env
}

const env = parseEnvLocal(path.join(process.cwd(), '.env.local'))
const url = env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const email = env.E2E_EMAIL
const password = env.E2E_PASSWORD

if (!url || !anonKey || !email || !password) {
  process.stderr.write('Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / E2E_EMAIL / E2E_PASSWORD in .env.local\n')
  process.exit(2)
}

const supabase = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password })
if (authError || !authData?.session?.access_token) {
  process.stderr.write(`Auth failed: ${authError?.message ?? 'unknown'}\n`)
  process.exit(3)
}

const userClient = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { Authorization: `Bearer ${authData.session.access_token}` } },
})

const checks = [
  { name: 'organizations', select: 'id, name, status' },
  { name: 'provider_settings', select: 'organization_id, status, environment, base_url, webhook_url' },
  { name: 'ledger_entries', select: 'id, amount, balance_after, occurred_at, organization_id' },
  { name: 'payouts', select: 'id, gross_amount, status, created_at, organization_id' },
  { name: 'kyc_requests', select: 'id, status, created_at, organization_id' },
  { name: 'webhook_events', select: 'id, type, status, created_at, organization_id' },
  { name: 'conciliation_runs', select: 'id, status, started_at, organization_id' },
  { name: 'conciliation_items', select: 'id, status, created_at, organization_id' },
  { name: 'audit_logs', select: 'id, action, entity, created_at, organization_id' },
  { name: 'anticipation_requests', select: 'id, status, requested_amount, fee_amount, net_amount, created_at, organization_id' },
]

const results = []
for (const c of checks) {
  const { data, error } = await userClient.from(c.name).select(c.select).limit(1)
  results.push({
    table: c.name,
    ok: !error,
    error: error ? { code: error.code ?? null, message: error.message ?? String(error) } : null,
    sample: data?.[0] ?? null,
  })
}

process.stdout.write(JSON.stringify({ supabaseUrl: url, userId: authData.user.id, results }, null, 2))

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
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  process.stderr.write('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local\n')
  process.exit(2)
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

const checks = [
  { name: 'ledger_entries', select: 'id, type, direction, amount, balance_after, origin, occurred_at, organization_id' },
  { name: 'pay_antecipacao', select: 'id, status, requested_amount_centavos, fee_centavos, net_amount_centavos, created_at, organization_id' },
  { name: 'pay_antecipacao_events', select: 'id, antecipacao_id, event_type, created_at, organization_id' },
  { name: 'payouts', select: 'id, status, amount, created_at, organization_id' },
  { name: 'kyc_requests', select: 'id, status, created_at, organization_id' },
  { name: 'webhook_events', select: 'id, type, status, created_at, organization_id' },
  { name: 'conciliation_runs', select: 'id, status, started_at, created_at, organization_id' },
  { name: 'conciliation_items', select: 'id, status, created_at, organization_id' },
  { name: 'audit_logs', select: 'id, action, entity, created_at, organization_id' },
  { name: 'organizations', select: 'id, name, document, legal_name, segment, website, status, created_at' },
  {
    name: 'provider_settings',
    select: 'id, organization_id, environment, base_url, webhook_url, timeout_seconds, retry_policy, status, api_keys, tokens, created_at',
  },
]

const results = []
for (const c of checks) {
  const { data, error } = await supabase.from(c.name).select(c.select).limit(1)
  results.push({
    table: c.name,
    ok: !error,
    error: error ? { code: error.code ?? null, message: error.message ?? String(error) } : null,
    sample: data?.[0] ?? null,
  })
}

process.stdout.write(JSON.stringify({ supabaseUrl: url, results }, null, 2))

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

function parseEnvLocal(filePath) {
  const txt = fs.readFileSync(filePath, 'utf8')
  const env = {}
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const i = line.indexOf('=')
    if (i < 0) continue
    const key = line.slice(0, i).trim()
    let val = line.slice(i + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1)
    env[key] = val
  }
  return env
}

function normalizeBaseUrl(input) {
  const base = String(input || '').trim().replace(/\/+$/, '')
  return base || 'https://connektpay.vercel.app'
}

async function findUserByEmail(admin, email) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const list = Array.isArray(data?.users) ? data.users : []
    const hit = list.find((u) => String(u.email || '').toLowerCase() === String(email).toLowerCase())
    if (hit) return hit
    if (list.length < 200) break
  }
  return null
}

const env = parseEnvLocal(path.join(process.cwd(), '.env.local'))
const baseUrl = normalizeBaseUrl(process.env.BASE_URL || env.BASE_URL || 'https://connektpay.vercel.app')
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !anonKey || !serviceKey) {
  process.stderr.write('Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY in .env.local\n')
  process.exit(2)
}

const anon = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

const email = `diag.${Date.now()}@connektpay.com`
const password = `Diag@${crypto.randomBytes(9).toString('hex')}`
const redirectTo = `${baseUrl}/auth/callback`

const out = { baseUrl, supabaseUrl, emailRedirectTo: redirectTo, signup: null, user: null, generateLink: null }

try {
  const { data, error } = await anon.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: redirectTo },
  })

  out.signup = {
    ok: !error,
    error: error ? { name: error.name ?? null, message: error.message ?? String(error) } : null,
    hasSession: !!data?.session,
    userId: data?.user?.id ?? null,
  }

  const u = await findUserByEmail(admin, email)
  out.user = u
    ? {
        id: u.id,
        email: u.email,
        created_at: u.created_at ?? null,
        confirmation_sent_at: u.confirmation_sent_at ?? null,
        email_confirmed_at: u.email_confirmed_at ?? null,
        last_sign_in_at: u.last_sign_in_at ?? null,
      }
    : null

  const gl = await admin.auth.admin.generateLink({
    type: 'signup',
    email,
    password,
    options: { redirectTo },
  })

  const actionLink = gl?.data?.properties?.action_link ? String(gl.data.properties.action_link) : null
  const redacted = actionLink ? actionLink.split('?')[0] + '?REDACTED' : null
  out.generateLink = {
    ok: !gl.error,
    error: gl.error ? { message: gl.error.message ?? String(gl.error) } : null,
    action_link: redacted,
    redirect_to: gl?.data?.properties?.redirect_to ?? null,
  }
} finally {
  const u = await findUserByEmail(admin, email).catch(() => null)
  if (u?.id) {
    await admin.auth.admin.deleteUser(u.id).catch(() => {})
  }
}

process.stdout.write(JSON.stringify(out, null, 2))

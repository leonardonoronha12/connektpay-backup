import { isSupabaseServiceConfigured } from '@/lib/env'
import { insertAuditLog } from '@/lib/audit-log'
import { assertRole, requireSessionOrgContext } from '@/lib/session-org-context'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import { classifyInternalApiError } from '@/lib/api-error'
import crypto from 'crypto'
import { NextResponse } from 'next/server'

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

function sha256(input: string) {
  return crypto.createHash('sha256').update(input).digest('hex')
}

function randomKey(prefix: 'ck_live_' | 'ck_test_') {
  return `${prefix}${crypto.randomBytes(24).toString('hex')}`
}

type ApiKeyEntry = {
  id: string
  name: string
  env: 'production' | 'sandbox'
  prefix: string
  hash: string
  created_at: string
  revoked_at: string | null
}

async function ensureRow(supabase: any, organizationId: string) {
  const { data: existing, error } = await supabase.from('provider_settings').select('organization_id, api_keys').eq('organization_id', organizationId).maybeSingle()
  if (error) throw new Error(error.message)
  if (existing) return existing
  const { data: created, error: insErr } = await supabase.from('provider_settings').insert({ organization_id: organizationId }).select('organization_id, api_keys').single()
  if (insErr) throw new Error(insErr.message)
  return created
}

export async function GET(request: Request) {
  if (!isSupabaseServiceConfigured()) return json({ apiKeys: [] })

  try {
    const ctx = await requireSessionOrgContext()
    assertRole(ctx.role, ['owner', 'super_admin'])
    const supabase = getSupabaseAdminClient()
    const row = await ensureRow(supabase, ctx.organizationId)
    const list = Array.isArray((row as any).api_keys) ? ((row as any).api_keys as ApiKeyEntry[]) : []
    const apiKeys = list
      .filter((k) => !k.revoked_at)
      .map((k) => ({ id: k.id, name: k.name, env: k.env, prefix: k.prefix, created_at: k.created_at }))
    return json({ apiKeys })
  } catch (e) {
    const err = classifyInternalApiError(e)
    return json({ error: err.message }, { status: err.status })
  }
}

export async function POST(request: Request) {
  if (!isSupabaseServiceConfigured()) return json({ error: 'Funcionalidade indisponÃ­vel no momento.' }, { status: 503 })

  try {
    const ctx = await requireSessionOrgContext()
    assertRole(ctx.role, ['owner', 'super_admin'])
    const body = (await request.json().catch(() => null)) as null | { name?: string; env?: 'production' | 'sandbox' }
    const name = body?.name?.trim() || 'Chave de API'
    const env = body?.env === 'sandbox' ? 'sandbox' : 'production'

    const apiKey = randomKey(env === 'sandbox' ? 'ck_test_' : 'ck_live_')
    const entry: ApiKeyEntry = {
      id: crypto.randomUUID(),
      name,
      env,
      prefix: apiKey.slice(0, 10),
      hash: sha256(apiKey),
      created_at: new Date().toISOString(),
      revoked_at: null,
    }

    const supabase = getSupabaseAdminClient()
    const row = await ensureRow(supabase, ctx.organizationId)
    const list = Array.isArray((row as any).api_keys) ? ((row as any).api_keys as ApiKeyEntry[]) : []
    const next = [...list, entry]

    const { error } = await supabase.from('provider_settings').update({ api_keys: next }).eq('organization_id', ctx.organizationId)
    if (error) return json({ error: 'NÃ£o foi possÃ­vel criar a chave agora.' }, { status: 500 })

    await insertAuditLog({
      organizationId: ctx.organizationId,
      actorProfileId: ctx.actorProfileId,
      actorUserId: ctx.actorProfileId,
      authType: 'session',
      origin: 'internal_api',
      action: 'CREATE',
      entity: 'api_key',
      entityId: entry.id,
      before: null,
      after: { id: entry.id, name: entry.name, env: entry.env, prefix: entry.prefix, created_at: entry.created_at },
    })

    return json({ apiKey: { id: entry.id, name: entry.name, env: entry.env, key: apiKey, prefix: entry.prefix, created_at: entry.created_at } }, { status: 201 })
  } catch (e) {
    const err = classifyInternalApiError(e)
    return json({ error: err.message }, { status: err.status })
  }
}


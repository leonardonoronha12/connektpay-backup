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

function randomToken(prefix: 'tkn_live_' | 'tkn_test_') {
  return `${prefix}${crypto.randomBytes(20).toString('hex')}`
}

type TokenEntry = {
  id: string
  name: string
  env: 'production' | 'sandbox'
  prefix: string
  hash: string
  created_at: string
  revoked_at: string | null
}

async function ensureRow(supabase: any, organizationId: string) {
  const { data: existing, error } = await supabase.from('provider_settings').select('organization_id, tokens').eq('organization_id', organizationId).maybeSingle()
  if (error) throw new Error(error.message)
  if (existing) return existing
  const { data: created, error: insErr } = await supabase.from('provider_settings').insert({ organization_id: organizationId }).select('organization_id, tokens').single()
  if (insErr) throw new Error(insErr.message)
  return created
}

export async function GET(request: Request) {
  if (!isSupabaseServiceConfigured()) return json({ tokens: [] })

  try {
    const ctx = await requireSessionOrgContext()
    assertRole(ctx.role, ['owner', 'super_admin'])
    const supabase = getSupabaseAdminClient()
    const row = await ensureRow(supabase, ctx.organizationId)
    const list = Array.isArray((row as any).tokens) ? ((row as any).tokens as TokenEntry[]) : []
    const tokens = list.filter((t) => !t.revoked_at).map((t) => ({ id: t.id, name: t.name, env: t.env, prefix: t.prefix, created_at: t.created_at }))
    return json({ tokens })
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
    const name = body?.name?.trim() || 'Token'
    const env = body?.env === 'sandbox' ? 'sandbox' : 'production'

    const token = randomToken(env === 'sandbox' ? 'tkn_test_' : 'tkn_live_')
    const entry: TokenEntry = {
      id: crypto.randomUUID(),
      name,
      env,
      prefix: token.slice(0, 10),
      hash: sha256(token),
      created_at: new Date().toISOString(),
      revoked_at: null,
    }

    const supabase = getSupabaseAdminClient()
    const row = await ensureRow(supabase, ctx.organizationId)
    const list = Array.isArray((row as any).tokens) ? ((row as any).tokens as TokenEntry[]) : []
    const next = [...list, entry]

    const { error } = await supabase.from('provider_settings').update({ tokens: next }).eq('organization_id', ctx.organizationId)
    if (error) return json({ error: 'NÃ£o foi possÃ­vel criar o token agora.' }, { status: 500 })

    await insertAuditLog({
      organizationId: ctx.organizationId,
      actorProfileId: ctx.actorProfileId,
      actorUserId: ctx.actorProfileId,
      authType: 'session',
      origin: 'internal_api',
      action: 'CREATE',
      entity: 'token',
      entityId: entry.id,
      before: null,
      after: { id: entry.id, name: entry.name, env: entry.env, prefix: entry.prefix, created_at: entry.created_at },
    })

    return json({ token: { id: entry.id, name: entry.name, env: entry.env, token, prefix: entry.prefix, created_at: entry.created_at } }, { status: 201 })
  } catch (e) {
    const err = classifyInternalApiError(e)
    return json({ error: err.message }, { status: err.status })
  }
}


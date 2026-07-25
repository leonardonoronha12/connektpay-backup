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

export async function PATCH(request: Request, ctxRoute: { params: Promise<{ id: string }> }) {
  if (!isSupabaseServiceConfigured()) return json({ error: 'Funcionalidade indisponÃ­vel no momento.' }, { status: 503 })
  try {
    const { id } = await ctxRoute.params
    const ctx = await requireSessionOrgContext()
    assertRole(ctx.role, ['owner', 'super_admin'])
    const supabase = getSupabaseAdminClient()

    const { data: row, error: rowErr } = await supabase.from('provider_settings').select('tokens').eq('organization_id', ctx.organizationId).maybeSingle()
    if (rowErr) return json({ error: 'NÃ£o foi possÃ­vel atualizar o token agora.' }, { status: 500 })

    const list = Array.isArray((row as any)?.tokens) ? (((row as any).tokens as TokenEntry[]) ?? []) : []
    const before = list.find((t) => t.id === id) ?? null
    if (!before) return json({ error: 'Token nÃ£o encontrado.' }, { status: 404 })

    const next = list.map((t) => (t.id === id ? { ...t, revoked_at: new Date().toISOString() } : t))
    const { error } = await supabase.from('provider_settings').update({ tokens: next }).eq('organization_id', ctx.organizationId)
    if (error) return json({ error: 'NÃ£o foi possÃ­vel atualizar o token agora.' }, { status: 500 })

    await insertAuditLog({
      organizationId: ctx.organizationId,
      actorProfileId: ctx.actorProfileId,
      actorUserId: ctx.actorProfileId,
      authType: 'session',
      origin: 'internal_api',
      action: 'DELETE',
      entity: 'token',
      entityId: id,
      before,
      after: null,
    })

    return json({ ok: true })
  } catch (e) {
    const err = classifyInternalApiError(e)
    return json({ error: err.message }, { status: err.status })
  }
}

export async function POST(request: Request, ctxRoute: { params: Promise<{ id: string }> }) {
  if (!isSupabaseServiceConfigured()) return json({ error: 'Funcionalidade indisponÃ­vel no momento.' }, { status: 503 })
  try {
    const { id } = await ctxRoute.params
    const ctx = await requireSessionOrgContext()
    assertRole(ctx.role, ['owner', 'super_admin'])
    const body = (await request.json().catch(() => null)) as null | { name?: string }
    const supabase = getSupabaseAdminClient()

    const { data: row, error: rowErr } = await supabase.from('provider_settings').select('tokens').eq('organization_id', ctx.organizationId).maybeSingle()
    if (rowErr) return json({ error: 'NÃ£o foi possÃ­vel rotacionar o token agora.' }, { status: 500 })

    const list = Array.isArray((row as any)?.tokens) ? (((row as any).tokens as TokenEntry[]) ?? []) : []
    const current = list.find((t) => t.id === id) ?? null
    if (!current) return json({ error: 'Token nÃ£o encontrado.' }, { status: 404 })

    const token = randomToken(current.env === 'sandbox' ? 'tkn_test_' : 'tkn_live_')
    const entry: TokenEntry = {
      id: crypto.randomUUID(),
      name: body?.name?.trim() || current.name,
      env: current.env,
      prefix: token.slice(0, 10),
      hash: sha256(token),
      created_at: new Date().toISOString(),
      revoked_at: null,
    }

    const revokedOld = list.map((t) => (t.id === id ? { ...t, revoked_at: new Date().toISOString() } : t))
    const next = [...revokedOld, entry]
    const { error } = await supabase.from('provider_settings').update({ tokens: next }).eq('organization_id', ctx.organizationId)
    if (error) return json({ error: 'NÃ£o foi possÃ­vel rotacionar o token agora.' }, { status: 500 })

    await insertAuditLog({
      organizationId: ctx.organizationId,
      actorProfileId: ctx.actorProfileId,
      actorUserId: ctx.actorProfileId,
      authType: 'session',
      origin: 'internal_api',
      action: 'DELETE',
      entity: 'token',
      entityId: id,
      before: current,
      after: null,
    })

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


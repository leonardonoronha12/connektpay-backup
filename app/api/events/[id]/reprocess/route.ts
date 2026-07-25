import { isSupabaseConfigured, isSupabaseServiceConfigured } from '@/lib/env'
import { insertAuditLog } from '@/lib/audit-log'
import { assertRole, requireSessionOrgContext } from '@/lib/session-org-context'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import { classifyInternalApiError } from '@/lib/api-error'
import { NextResponse } from 'next/server'

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

export async function POST(request: Request, ctxRoute: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return json({ error: 'Funcionalidade indisponível no momento.' }, { status: 503 })
  if (!isSupabaseServiceConfigured()) return json({ error: 'Funcionalidade indisponível no momento.' }, { status: 503 })

  try {
    const { id } = await ctxRoute.params
    const ctx = await requireSessionOrgContext()
    assertRole(ctx.role, ['owner', 'admin', 'super_admin'])
    const supabase = getSupabaseAdminClient()
    const body = (await request.json().catch(() => null)) as null | { reason?: string }
    const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 500) : null

    const { data: before, error: lookupError } = await supabase
      .from('webhook_events')
      .select('id, status, attempts, last_error, next_retry_at, processed_at')
      .eq('organization_id', ctx.organizationId)
      .eq('id', id)
      .maybeSingle()

    if (lookupError) return json({ error: 'Não foi possível carregar este evento agora.' }, { status: 500 })
    if (!before?.id) return json({ error: 'Evento não encontrado.' }, { status: 404 })

    const { data, error } = await supabase
      .from('webhook_events')
      .update({ status: 'pending', attempts: 0, last_error: null, next_retry_at: new Date().toISOString(), processed_at: null })
      .eq('organization_id', ctx.organizationId)
      .eq('id', id)
      .select('id, status')
      .single()

    if (error) return json({ error: 'Não foi possível reprocessar este evento agora.' }, { status: 500 })
    await insertAuditLog({
      organizationId: ctx.organizationId,
      actorProfileId: ctx.actorProfileId,
      authType: 'session',
      origin: 'internal_api',
      action: 'REPROCESS',
      entity: 'webhook_event',
      entityId: id,
      before,
      after: { ...data, reason },
    })
    return json({ event: data })
  } catch (e) {
    const err = classifyInternalApiError(e)
    return json({ error: err.message }, { status: err.status })
  }
}

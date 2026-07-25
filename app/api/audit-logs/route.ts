import { isSupabaseConfigured, isSupabaseServiceConfigured } from '@/lib/env'
import { assertRole, requireSessionOrgContext } from '@/lib/session-org-context'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import { classifyInternalApiError, logApiError } from '@/lib/api-error'
import { buildCsvFilename, buildCsvString } from '@/lib/csv'
import { NextResponse } from 'next/server'

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

function isSafeEmptySupabaseError(err: any) {
  const code = err?.code ? String(err.code) : ''
  if (code === '54001') return true
  if (code === 'PGRST205') return true
  if (code === '42P01') return true
  if (code === '42703') return true
  return false
}

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) return json({ auditLogs: [] })

  try {
    const ctx = await requireSessionOrgContext()
    assertRole(ctx.role, ['owner', 'admin', 'super_admin'])
    const url = new URL(request.url)
    const q = url.searchParams.get('q')
    const format = url.searchParams.get('format')

    const supabase = isSupabaseServiceConfigured() ? getSupabaseAdminClient() : await getSupabaseServerClient()

    let query = supabase
      .from('audit_logs')
      .select('id, action, entity, entity_id, before, after, created_at, actor:profiles(full_name, email)')
      .eq('organization_id', ctx.organizationId)
      .order('created_at', { ascending: false })
      .limit(200)

    if (q) query = query.or(`action.ilike.%${q}%,entity.ilike.%${q}%`)

    const { data, error } = await query
    if (error) {
      logApiError('GET /api/audit-logs: supabase error', error)
      if (isSafeEmptySupabaseError(error)) return json({ auditLogs: [] })
      return json({ error: 'Ocorreu um erro ao carregar a auditoria. Tente novamente.' }, { status: 500 })
    }

    if (format === 'csv') {
      const rows = (data ?? []).map((row: any) => ({
        id: row.id,
        action: row.action,
        entity: row.entity,
        entity_id: row.entity_id ?? '',
        actor_name: row.actor?.full_name ?? '',
        actor_email: row.actor?.email ?? '',
        created_at: row.created_at ?? '',
      }))
      const csv = buildCsvString(
        [
          { key: 'id', header: 'id' },
          { key: 'action', header: 'action' },
          { key: 'entity', header: 'entity' },
          { key: 'entity_id', header: 'entity_id' },
          { key: 'actor_name', header: 'actor_name' },
          { key: 'actor_email', header: 'actor_email' },
          { key: 'created_at', header: 'created_at' },
        ],
        rows
      )
      return new NextResponse(csv, {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="${buildCsvFilename('audit-logs')}"`,
        },
      })
    }

    return json({ auditLogs: data ?? [] })
  } catch (e) {
    logApiError('GET /api/audit-logs failed', e)
    const err = classifyInternalApiError(e)
    return json({ error: err.message }, { status: err.status })
  }
}

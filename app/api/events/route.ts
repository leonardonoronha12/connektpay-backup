import { isSupabaseConfigured, isSupabaseServiceConfigured } from '@/lib/env'
import { assertRole, requireSessionOrgContext } from '@/lib/session-org-context'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import { classifyInternalApiError } from '@/lib/api-error'
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
  if (!isSupabaseConfigured()) return json({ events: [] })

  try {
    const ctx = await requireSessionOrgContext()
    assertRole(ctx.role, ['owner', 'admin', 'operacional', 'super_admin'])
    const url = new URL(request.url)
    const type = url.searchParams.get('type')
    const format = url.searchParams.get('format')

    const supabase = isSupabaseServiceConfigured() ? getSupabaseAdminClient() : await getSupabaseServerClient()
    let query = supabase
      .from('webhook_events')
      .select('id, type, origin, status, attempts, created_at, last_error')
      .eq('organization_id', ctx.organizationId)
      .order('created_at', { ascending: false })
      .limit(200)

    if (type) query = query.eq('type', type)

    const { data, error } = await query
    if (error) {
      if (isSafeEmptySupabaseError(error)) return json({ events: [] })
      return json({ error: 'Não foi possível carregar eventos agora.' }, { status: 500 })
    }
    if (format === 'csv') {
      const rows = (data ?? []).map((event: any) => ({
        id: event.id,
        type: event.type,
        origin: event.origin,
        status: event.status,
        attempts: event.attempts,
        created_at: event.created_at,
        last_error: event.last_error ?? '',
      }))
      const csv = buildCsvString(
        [
          { key: 'id', header: 'id' },
          { key: 'type', header: 'type' },
          { key: 'origin', header: 'origin' },
          { key: 'status', header: 'status' },
          { key: 'attempts', header: 'attempts' },
          { key: 'created_at', header: 'created_at' },
          { key: 'last_error', header: 'last_error' },
        ],
        rows
      )
      return new NextResponse(csv, {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="${buildCsvFilename('events')}"`,
        },
      })
    }
    return json({ events: data ?? [] })
  } catch (e) {
    const err = classifyInternalApiError(e)
    return json({ error: err.message }, { status: err.status })
  }
}

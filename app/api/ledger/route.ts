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
  if (!isSupabaseConfigured()) return json({ balance: 0, ledgerEntries: [] })

  try {
    const ctx = await requireSessionOrgContext()
    assertRole(ctx.role, ['owner', 'financeiro', 'super_admin'])
    const url = new URL(request.url)
    const format = url.searchParams.get('format')
    const supabase = isSupabaseServiceConfigured() ? getSupabaseAdminClient() : await getSupabaseServerClient()

    const { data: entries, error } = await supabase
      .from('ledger_entries')
      .select('id, type, direction, amount, balance_after, origin, occurred_at')
      .eq('organization_id', ctx.organizationId)
      .order('occurred_at', { ascending: false })
      .limit(200)

    if (error) {
      logApiError('GET /api/ledger: supabase error', error)
      if (isSafeEmptySupabaseError(error)) return json({ balance: 0, ledgerEntries: [] })
      return json({ error: 'Ocorreu um erro ao carregar o ledger. Tente novamente.' }, { status: 500 })
    }

    const balance = entries && entries.length > 0 ? Number((entries[0] as any).balance_after ?? 0) : 0
    if (format === 'csv') {
      const rows = (entries ?? []).map((entry: any) => ({
        id: entry.id,
        type: entry.type,
        direction: entry.direction,
        amount: entry.amount,
        balance_after: entry.balance_after,
        origin: entry.origin,
        occurred_at: entry.occurred_at,
      }))
      const csv = buildCsvString(
        [
          { key: 'id', header: 'id' },
          { key: 'type', header: 'type' },
          { key: 'direction', header: 'direction' },
          { key: 'amount', header: 'amount' },
          { key: 'balance_after', header: 'balance_after' },
          { key: 'origin', header: 'origin' },
          { key: 'occurred_at', header: 'occurred_at' },
        ],
        rows
      )
      return new NextResponse(csv, {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="${buildCsvFilename('ledger')}"`,
        },
      })
    }
    return json({ balance, ledgerEntries: entries ?? [] })
  } catch (e) {
    logApiError('GET /api/ledger failed', e)
    const err = classifyInternalApiError(e)
    return json({ error: err.message }, { status: err.status })
  }
}

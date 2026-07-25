import { classifyInternalApiError } from '@/lib/api-error'
import { isSupabaseConfigured, isSupabaseServiceConfigured } from '@/lib/env'
import { assertRole, requireSessionOrgContext } from '@/lib/session-org-context'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import { getReconciliationRun } from '@/lib/reconciliation-service'
import { NextResponse } from 'next/server'

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

export async function GET(_request: Request, ctxRoute: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return json({ error: 'Funcionalidade indisponÃ­vel no momento.' }, { status: 503 })
  try {
    const ctx = await requireSessionOrgContext()
    assertRole(ctx.role, ['owner', 'admin', 'financeiro', 'super_admin'])
    const { id } = await ctxRoute.params
    const supabase = isSupabaseServiceConfigured() ? getSupabaseAdminClient() : await getSupabaseServerClient()
    const out = await getReconciliationRun({ supabase, organizationId: ctx.organizationId, runId: id })
    return json(out)
  } catch (e) {
    const err = classifyInternalApiError(e)
    return json({ error: err.message }, { status: err.status })
  }
}


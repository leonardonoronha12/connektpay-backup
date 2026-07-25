import { ProviderError, mapProviderErrorToUserMessage } from '@/lib/acquirer/provider-error'
import { getFinancialProvider, getProviderCapabilities, isProviderConfigured, isSupabaseConfigured, isSupabaseServiceConfigured } from '@/lib/env'
import { insertAuditLog } from '@/lib/audit-log'
import { assertRole, requireSessionOrgContext } from '@/lib/session-org-context'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import { classifyInternalApiError } from '@/lib/api-error'
import { createReconciliationRun, listReconciliationItems } from '@/lib/reconciliation-service'
import { NextResponse } from 'next/server'

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

function buildReconciliationProviderState() {
  const providerId = getFinancialProvider()
  const capabilities = getProviderCapabilities(providerId)
  if (!capabilities.credentialsConfigured || !isProviderConfigured(providerId)) return null
  if (!capabilities.reconciliation) {
    return {
      providerId,
      enabled: false,
      message: 'ConciliaÃ§Ã£o ainda nÃ£o estÃ¡ disponÃ­vel para o provedor financeiro ativo.',
    }
  }
  return { providerId, enabled: true as const }
}

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) return json({ run: null, items: [] })

  try {
    const ctx = await requireSessionOrgContext()
    assertRole(ctx.role, ['owner', 'admin', 'financeiro', 'super_admin'])
    const supabase = await getSupabaseServerClient()

    const { data: run } = await supabase
      .from('pay_conciliation_runs')
      .select('id, started_at, finished_at, status, summary')
      .eq('organization_id', ctx.organizationId)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!run?.id) return json({ run: null, items: [] })

    const out = await listReconciliationItems({ supabase, organizationId: ctx.organizationId, runId: run.id as string })
    const items = (out.items ?? []).map((it: any) => ({
      id: it.id,
      transaction_id: it.entity_type === 'transaction' ? it.entity_id : null,
      internal_amount: it.internal_amount_centavos ?? 0,
      provider_amount: it.provider_amount_centavos ?? null,
      diff: it.difference_centavos ?? 0,
      status: it.status === 'matched' ? 'conciliated' : it.status,
      created_at: it.created_at,
    }))
    return json({ run, items })
  } catch (e) {
    const err = classifyInternalApiError(e)
    return json({ error: err.message }, { status: err.status })
  }
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return json({ error: 'Funcionalidade indisponÃ­vel no momento.' }, { status: 503 })
  if (!isSupabaseServiceConfigured()) return json({ error: 'Funcionalidade indisponÃ­vel no momento.' }, { status: 503 })
  const providerState = buildReconciliationProviderState()
  if (!providerState) return json({ error: 'O provedor financeiro ainda nÃ£o estÃ¡ configurado.' }, { status: 503 })
  if (!providerState.enabled) return json({ error: providerState.message }, { status: 503 })

  try {
    const ctx = await requireSessionOrgContext()
    assertRole(ctx.role, ['owner', 'admin', 'financeiro', 'super_admin'])
    const supabase = await getSupabaseServerClient()

    const now = new Date().toISOString()
    const out = await createReconciliationRun({
      supabase,
      organizationId: ctx.organizationId,
      actorProfileId: ctx.actorProfileId,
      periodStart: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      periodEnd: now,
      provider: providerState.providerId,
    })

    await insertAuditLog({
      organizationId: ctx.organizationId,
      actorProfileId: ctx.actorProfileId,
      actorUserId: ctx.actorProfileId,
      authType: 'session',
      origin: 'internal_api',
      action: 'CREATE',
      entity: 'conciliation_run',
      entityId: out.runId,
      before: null,
      after: { id: out.runId, status: 'finished' },
    })

    return json({ ok: true, runId: out.runId })
  } catch (e) {
    if (e instanceof ProviderError) return json({ error: mapProviderErrorToUserMessage(e) }, { status: e.status })
    const err = classifyInternalApiError(e)
    return json({ error: err.message }, { status: err.status })
  }
}


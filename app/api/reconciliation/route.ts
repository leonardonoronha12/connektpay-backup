import { classifyInternalApiError } from '@/lib/api-error'
import { ProviderError, mapProviderErrorToUserMessage } from '@/lib/acquirer/provider-error'
import { getFinancialProvider, getProviderCapabilities, isProviderConfigured, isSupabaseConfigured, isSupabaseServiceConfigured } from '@/lib/env'
import { assertRole, requireSessionOrgContext } from '@/lib/session-org-context'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import { createReconciliationRun, listReconciliationRuns } from '@/lib/reconciliation-service'
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

export async function GET() {
  if (!isSupabaseConfigured()) return json({ runs: [] })
  try {
    const ctx = await requireSessionOrgContext()
    assertRole(ctx.role, ['owner', 'admin', 'financeiro', 'super_admin'])
    const supabase = isSupabaseServiceConfigured() ? getSupabaseAdminClient() : await getSupabaseServerClient()
    const out = await listReconciliationRuns({ supabase, organizationId: ctx.organizationId })
    return json(out)
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

    const body = (await request.json().catch(() => null)) as null | { periodStart?: string; periodEnd?: string }
    const now = new Date()
    const periodEnd = typeof body?.periodEnd === 'string' ? body.periodEnd : now.toISOString()
    const periodStart =
      typeof body?.periodStart === 'string'
        ? body.periodStart
        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    const supabase = getSupabaseAdminClient()
    const out = await createReconciliationRun({
      supabase,
      organizationId: ctx.organizationId,
      actorProfileId: ctx.actorProfileId,
      periodStart,
      periodEnd,
      provider: providerState.providerId,
    })
    return json(out, { status: 201 })
  } catch (e) {
    if (e instanceof ProviderError) return json({ error: mapProviderErrorToUserMessage(e) }, { status: e.status })
    const err = classifyInternalApiError(e)
    return json({ error: err.message }, { status: err.status })
  }
}


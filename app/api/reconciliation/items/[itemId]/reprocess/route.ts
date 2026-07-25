import { classifyInternalApiError } from '@/lib/api-error'
import { getFinancialProvider, getProviderCapabilities, isProviderConfigured, isSupabaseConfigured, isSupabaseServiceConfigured } from '@/lib/env'
import { assertRole, requireSessionOrgContext } from '@/lib/session-org-context'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import { reprocessConciliationItem } from '@/lib/reconciliation-service'
import { NextResponse } from 'next/server'

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

function buildReconciliationProviderState() {
  const providerId = getFinancialProvider()
  const capabilities = getProviderCapabilities(providerId)
  if (!capabilities.credentialsConfigured || !isProviderConfigured(providerId)) return null
  if (!capabilities.reconciliation) {
    return { enabled: false as const, message: 'ConciliaÃ§Ã£o ainda nÃ£o estÃ¡ disponÃ­vel para o provedor financeiro ativo.' }
  }
  return { enabled: true as const }
}

export async function POST(_request: Request, ctxRoute: { params: Promise<{ itemId: string }> }) {
  if (!isSupabaseConfigured()) return json({ error: 'Funcionalidade indisponÃ­vel no momento.' }, { status: 503 })
  if (!isSupabaseServiceConfigured()) return json({ error: 'Funcionalidade indisponÃ­vel no momento.' }, { status: 503 })
  const providerState = buildReconciliationProviderState()
  if (!providerState) return json({ error: 'O provedor financeiro ainda nÃ£o estÃ¡ configurado.' }, { status: 503 })
  if (!providerState.enabled) return json({ error: providerState.message }, { status: 503 })
  try {
    const ctx = await requireSessionOrgContext()
    assertRole(ctx.role, ['owner', 'admin', 'financeiro', 'super_admin'])
    const { itemId } = await ctxRoute.params
    const supabase = await getSupabaseServerClient()
    const out = await reprocessConciliationItem({ supabase, organizationId: ctx.organizationId, actorProfileId: ctx.actorProfileId, itemId })
    return json(out)
  } catch (e) {
    const err = classifyInternalApiError(e)
    return json({ error: err.message }, { status: err.status })
  }
}


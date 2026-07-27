﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿import { getFinancialEnvironment, isSupabaseConfigured, isSupabaseServiceConfigured } from '@/lib/env'
import { insertAuditLog } from '@/lib/audit-log'
import { appendLedgerEntryAdmin } from '@/lib/ledger-admin'
import { assertRole, requireSessionOrgContext } from '@/lib/session-org-context'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import { classifyInternalApiError, logApiError } from '@/lib/api-error'
import { NextResponse } from 'next/server'

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

function safeString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export async function GET(request: Request, ctxRoute: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return json({ error: 'Funcionalidade indisponÃ­vel no momento.' }, { status: 503 })
  try {
    const { id } = await ctxRoute.params
    const ctx = await requireSessionOrgContext()
    assertRole(ctx.role, ['owner', 'financeiro', 'super_admin'])
    const supabase = isSupabaseServiceConfigured() ? getSupabaseAdminClient() : await getSupabaseServerClient()
    const runtime = getFinancialEnvironment()

    const { data: payout, error } = await supabase
      .from('payouts')
      .select(
        'id, receiver_id, gross_amount, fee_amount, net_amount, status, provider, provider_environment, scheduled_for, provider_reference, provider_status, requested_at, paid_at, failed_at, canceled_at, created_at, receiver:receivers(id, name, document, email)',
      )
      .eq('organization_id', ctx.organizationId)
      .eq('provider', runtime.providerId)
      .eq('provider_environment', runtime.environment)
      .eq('is_internal', false)
      .eq('id', id)
      .maybeSingle()
    if (error) {
      logApiError('GET /api/payouts/[id] failed', error, { id })
      return json({ error: 'Ocorreu um erro ao carregar o repasse. Tente novamente.' }, { status: 500 })
    }
    if (!payout) return json({ error: 'Repasse nÃ£o encontrado.' }, { status: 404 })

    const { data: events } = await supabase
      .from('payout_events')
      .select('id, event_type, provider_event_id, created_at')
      .eq('organization_id', ctx.organizationId)
      .eq('provider', runtime.providerId)
      .eq('provider_environment', runtime.environment)
      .eq('payout_id', id)
      .order('created_at', { ascending: false })
      .limit(100)

    return json({ payout, events: events ?? [] })
  } catch (e) {
    const err = classifyInternalApiError(e)
    return json({ error: err.message }, { status: err.status })
  }
}

export async function PATCH(request: Request, ctxRoute: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return json({ error: 'Funcionalidade indisponÃ­vel no momento.' }, { status: 503 })
  if (!isSupabaseServiceConfigured()) return json({ error: 'Funcionalidade indisponÃ­vel no momento.' }, { status: 503 })

  try {
    const { id } = await ctxRoute.params
    const ctx = await requireSessionOrgContext()
    assertRole(ctx.role, ['owner', 'financeiro', 'super_admin'])
    const body = (await request.json().catch(() => null)) as null | { status?: string }
    if (!body?.status) return json({ error: 'Missing status' }, { status: 400 })
    const runtime = getFinancialEnvironment()

    const supabase = await getSupabaseServerClient()
    const { data: before } = await supabase
      .from('payouts')
      .select('id, organization_id, gross_amount, net_amount, status, provider, provider_environment, provider_reference')
      .eq('organization_id', ctx.organizationId)
      .eq('provider', runtime.providerId)
      .eq('provider_environment', runtime.environment)
      .eq('is_internal', false)
      .eq('id', id)
      .maybeSingle()

    if (!before) return json({ error: 'Repasse nÃ£o encontrado.' }, { status: 404 })

    const { data, error } = await supabase
      .from('payouts')
      .update({
        status: body.status,
        provider_status: body.status,
        ...(body.status === 'paid' ? { paid_at: new Date().toISOString() } : null),
        ...(body.status === 'failed' ? { failed_at: new Date().toISOString() } : null),
        ...(body.status === 'canceled' ? { canceled_at: new Date().toISOString() } : null),
      } as any)
      .eq('organization_id', ctx.organizationId)
      .eq('provider', runtime.providerId)
      .eq('provider_environment', runtime.environment)
      .eq('is_internal', false)
      .eq('id', id)
      .select('id, status, gross_amount, net_amount')
      .single()

    if (error) {
      logApiError('PATCH /api/payouts/[id] update failed', error, { id, status: body.status })
      return json({ error: 'Ocorreu um erro ao atualizar o repasse. Tente novamente.' }, { status: 500 })
    }

    if (body.status === 'paid' && before.status !== 'paid') {
      const admin = getSupabaseAdminClient()
      const { data: existing } = await admin
        .from('ledger_entries')
        .select('id')
        .eq('organization_id', ctx.organizationId)
        .eq('provider', runtime.providerId)
        .eq('provider_environment', runtime.environment)
        .eq('payout_id', id)
        .eq('type', 'payout')
        .limit(1)
        .maybeSingle()

      if (!existing?.id) {
        const amt = Number(data.net_amount ?? data.gross_amount ?? 0)
        if (amt > 0) {
          await appendLedgerEntryAdmin({
            organizationId: ctx.organizationId,
            payoutId: id,
            type: 'payout',
            direction: 'debit',
            amount: amt,
            origin: 'manual',
            provider: runtime.providerId,
            providerEnvironment: runtime.environment,
            providerReference: safeString((before as any).provider_reference),
          })
        }
      }
    }

    await supabase.from('payout_events').insert({
      organization_id: ctx.organizationId,
      payout_id: id,
      provider: runtime.providerId,
      provider_environment: runtime.environment,
      event_type: body.status === 'paid' ? 'payout.paid' : body.status === 'failed' ? 'payout.failed' : body.status === 'canceled' ? 'payout.canceled' : 'payout.status_updated',
      provider_event_id: null,
      payload: { status: body.status },
    })

    await insertAuditLog({
      organizationId: ctx.organizationId,
      actorProfileId: ctx.actorProfileId,
      actorUserId: ctx.actorProfileId,
      authType: 'session',
      origin: 'internal_api',
      action: 'UPDATE',
      entity: 'payout',
      entityId: id,
      before,
      after: data,
    })
    return json({ payout: data })
  } catch (e) {
    const err = classifyInternalApiError(e)
    return json({ error: err.message }, { status: err.status })
  }
}

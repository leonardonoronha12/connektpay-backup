﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿import { getAcquirerProvider } from '@/lib/acquirer'
import { ProviderError, mapProviderErrorToUserMessage } from '@/lib/acquirer/provider-error'
import { getFinancialProvider, getProviderCapabilities, isProviderConfigured, isSupabaseConfigured, isSupabaseServiceConfigured } from '@/lib/env'
import { insertAuditLog } from '@/lib/audit-log'
import { assertRole, requireSessionOrgContext } from '@/lib/session-org-context'
import { calculatePayoutFee } from '@/lib/payout-core'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import { classifyInternalApiError, logApiError } from '@/lib/api-error'
import { NextResponse } from 'next/server'

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

function buildPayoutProviderState() {
  const providerId = getFinancialProvider()
  const capabilities = getProviderCapabilities(providerId)
  if (!capabilities.credentialsConfigured || !isProviderConfigured(providerId)) return null
  if (!capabilities.payouts) {
    return {
      providerId,
      enabled: false,
      message: 'Repasses ainda nÃ£o estÃ£o disponÃ­veis para o provedor financeiro ativo.',
    }
  }
  return { providerId, enabled: true as const }
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
  if (!isSupabaseConfigured()) return json({ payouts: [] })

  try {
    const ctx = await requireSessionOrgContext()
    assertRole(ctx.role, ['owner', 'financeiro', 'super_admin'])
    const supabase = isSupabaseServiceConfigured() ? getSupabaseAdminClient() : await getSupabaseServerClient()

    const { data, error } = await supabase
      .from('payouts')
      .select('id, receiver_id, gross_amount, fee_amount, net_amount, status, scheduled_for, provider_reference, provider_status, requested_at, paid_at, failed_at, canceled_at, created_at')
      .eq('organization_id', ctx.organizationId)
      .eq('is_internal', false)
      .order('created_at', { ascending: false })

    if (error) {
      logApiError('GET /api/payouts failed', error)
      if (isSafeEmptySupabaseError(error)) return json({ payouts: [] })
      return json({ error: 'Ocorreu um erro ao carregar repasses. Tente novamente.' }, { status: 500 })
    }
    return json({ payouts: data ?? [] })
  } catch (e) {
    const err = classifyInternalApiError(e)
    return json({ error: err.message }, { status: err.status })
  }
}

export async function POST(request: Request) {
  if (!isSupabaseServiceConfigured()) return json({ error: 'Funcionalidade indisponÃ­vel no momento.' }, { status: 503 })
  const providerState = buildPayoutProviderState()
  if (!providerState) return json({ error: 'O provedor financeiro ainda nÃ£o estÃ¡ configurado.' }, { status: 503 })
  if (!providerState.enabled) return json({ error: providerState.message }, { status: 503 })

  try {
    const ctx = await requireSessionOrgContext()
    assertRole(ctx.role, ['owner', 'financeiro', 'super_admin'])
    const body = (await request.json().catch(() => null)) as null | { receiverId?: string; amount?: number }
    if (!body?.receiverId) return json({ error: 'Missing receiverId' }, { status: 400 })
    if (!body?.amount || body.amount <= 0) return json({ error: 'Invalid amount' }, { status: 400 })

    const supabase = getSupabaseAdminClient()
    const { data: receiver, error: receiverError } = await supabase
      .from('receivers')
      .select('id, organization_id, status')
      .eq('id', body.receiverId)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle()
    if (receiverError) return json({ error: 'NÃ£o foi possÃ­vel validar o recebedor agora.' }, { status: 500 })
    if (!receiver?.id) return json({ error: 'Recebedor nÃ£o encontrado para esta organizaÃ§Ã£o.' }, { status: 404 })
    if (String(receiver.status ?? '') !== 'active') return json({ error: 'Recebedor inativo para solicitar repasse.' }, { status: 400 })

    const feeBps = 200
    const feeCalc = calculatePayoutFee({ grossAmountCents: Math.round(body.amount), feeBps })
    const feeAmount = feeCalc.feeAmountCents
    const netAmount = feeCalc.netAmountCents

    const provider = getAcquirerProvider()
    const providerPayout = await provider.createPayout({
      receiverId: body.receiverId,
      amount: { amount: body.amount, currency: 'BRL' },
      metadata: { organization_id: ctx.organizationId },
    })

    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from('payouts')
      .insert({
        organization_id: ctx.organizationId,
        receiver_id: body.receiverId,
        gross_amount: body.amount,
        fee_amount: feeAmount,
        net_amount: netAmount,
        status: providerPayout.status ?? 'scheduled',
        scheduled_for: null,
        provider_reference: providerPayout.id,
        provider_payload: providerPayout,
        provider_status: providerPayout.status ?? null,
        requested_at: now,
        is_internal: false,
      })
      .select('id, status')
      .single()

    if (error) {
      logApiError('POST /api/payouts insert failed', error, { receiverId: body.receiverId })
      return json({ error: 'Ocorreu um erro ao solicitar repasse. Tente novamente.' }, { status: 500 })
    }
    await supabase.from('payout_events').insert({
      organization_id: ctx.organizationId,
      payout_id: data.id,
      event_type: 'payout.requested',
      provider_event_id: null,
      payload: { provider_reference: providerPayout.id },
    })
    await insertAuditLog({
      organizationId: ctx.organizationId,
      actorProfileId: ctx.actorProfileId,
      actorUserId: ctx.actorProfileId,
      authType: 'session',
      origin: 'internal_api',
      action: 'CREATE',
      entity: 'payout',
      entityId: data.id as string,
      before: null,
      after: data,
    })
    return json({ payout: data }, { status: 201 })
  } catch (e) {
    if (e instanceof ProviderError) return json({ error: mapProviderErrorToUserMessage(e) }, { status: e.status })
    const err = classifyInternalApiError(e)
    return json({ error: err.message }, { status: err.status })
  }
}

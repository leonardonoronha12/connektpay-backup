import { classifyInternalApiError } from '@/lib/api-error'
import { getAvailableAnticipationAmount } from '@/lib/anticipation-service'
import { buildDailySeriesFromPaidTransactions, buildPaymentsByMethod, buildSubscriptionsByStatus, parsePeriod } from '@/lib/dashboard-core'
import { isSupabaseConfigured, isSupabaseServiceConfigured } from '@/lib/env'
import { getOrgFromApiKey } from '@/lib/public-api-auth'
import { checkPublicRateLimit } from '@/lib/public-rate-limit'
import { assertRole, requireSessionOrgContext } from '@/lib/session-org-context'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import { calculateChurnRate, calculateMRRCents } from '@/lib/subscription-core'
import { NextResponse } from 'next/server'

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) return json({ metrics: null })
  try {
    const apiKeyCtx = await getOrgFromApiKey(request)
    if (apiKeyCtx?.apiKeyHash) {
      const allowed = await checkPublicRateLimit({ organizationId: apiKeyCtx.organizationId, apiKeyHash: apiKeyCtx.apiKeyHash, limit: 120, windowSeconds: 60 })
      if (!allowed) return json({ error: 'Rate limit exceeded' }, { status: 429 })
    }
    const ctx = apiKeyCtx ? null : await requireSessionOrgContext()
    if (!apiKeyCtx) assertRole(ctx!.role, ['owner', 'admin', 'operacional', 'financeiro', 'super_admin'])
    const supabase = apiKeyCtx || isSupabaseServiceConfigured() ? getSupabaseAdminClient() : await getSupabaseServerClient()
    const organizationId = apiKeyCtx ? apiKeyCtx.organizationId : (ctx!.organizationId as string)

    const url = new URL(request.url)
    const receiverId = url.searchParams.get('receiverId')
    const status = url.searchParams.get('status')
    const paymentStatus = status && ['paid', 'created', 'failed', 'refunded', 'pending'].includes(status) ? status : null

    const period = parsePeriod({ days: url.searchParams.get('days'), start: url.searchParams.get('start'), end: url.searchParams.get('end') })
    const startIso = period.startIso
    const endIso = period.endIso
    const days = period.days

    const txIdsForReceiver =
      receiverId && receiverId.trim()
        ? (
            await supabase
              .from('pay_split')
              .select('transaction_id, amount, kind, created_at')
              .eq('organization_id', organizationId)
              .eq('receiver_id', receiverId.trim())
              .gte('created_at', startIso)
              .lte('created_at', endIso)
              .limit(3000)
          ).data ?? []
        : null
    const txIds =
      txIdsForReceiver && Array.isArray(txIdsForReceiver)
        ? Array.from(new Set(txIdsForReceiver.map((r: any) => String(r.transaction_id ?? '')).filter(Boolean))).slice(0, 2000)
        : null

    let payTxQ = supabase
      .from('pay_transacao')
      .select('transaction_id, gross_amount, connekt_fee_amount, status, created_at')
      .eq('organization_id', organizationId)
      .gte('created_at', startIso)
      .lte('created_at', endIso)
      .limit(5000)
    if (paymentStatus) payTxQ = payTxQ.eq('status', paymentStatus)
    if (txIds && txIds.length) payTxQ = payTxQ.in('transaction_id', txIds as any)

    let payoutsQ = supabase
      .from('payouts')
      .select('id, status, created_at')
      .eq('organization_id', organizationId)
      .eq('is_internal', false)
      .gte('created_at', startIso)
      .lte('created_at', endIso)
      .limit(2000)
    if (receiverId && receiverId.trim()) payoutsQ = payoutsQ.eq('receiver_id', receiverId.trim())

    let subsQ = supabase
      .from('pay_assinatura')
      .select('id, plano_id, status, created_at, canceled_at, plano:pay_plano(amount_centavos, cycle)')
      .eq('organization_id', organizationId)
      .limit(5000)
    if (receiverId && receiverId.trim()) subsQ = subsQ.eq('recebedor_id', receiverId.trim())

    let txMethodQ = supabase
      .from('transactions')
      .select('id, method, status, amount, created_at')
      .eq('organization_id', organizationId)
      .gte('created_at', startIso)
      .lte('created_at', endIso)
      .limit(5000)
    if (paymentStatus) txMethodQ = txMethodQ.eq('status', paymentStatus)
    if (txIds && txIds.length) txMethodQ = txMethodQ.in('id', txIds as any)

    const [payTxRes, ledgerRes, payoutsRes, concRes, subsRes, txMethodsRes] = await Promise.all([
      payTxQ,
      supabase
        .from('ledger_entries')
        .select('balance_after')
        .eq('organization_id', organizationId)
        .order('occurred_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      payoutsQ,
      supabase
        .from('pay_conciliation_items')
        .select('id, status, created_at')
        .eq('organization_id', organizationId)
        .eq('status', 'divergent')
        .gte('created_at', startIso)
        .lte('created_at', endIso)
        .limit(2000),
      subsQ,
      txMethodQ,
    ])

    const payTx = Array.isArray(payTxRes.data) ? payTxRes.data : []
    const paidTx = payTx.filter((t: any) => String(t.status ?? '') === 'paid')
    const pendingTx = payTx.filter((t: any) => String(t.status ?? '') === 'created')

    const receiverVolumeCents =
      txIdsForReceiver && Array.isArray(txIdsForReceiver)
        ? txIdsForReceiver
            .filter((r: any) => String(r.kind ?? '') === 'receiver')
            .reduce((acc: number, r: any) => acc + Number(r.amount ?? 0), 0)
        : null

    const tpvCents = paidTx.reduce((acc: number, t: any) => acc + Number(t.gross_amount ?? 0), 0)
    const connektRevenueCents = paidTx.reduce((acc: number, t: any) => acc + Number(t.connekt_fee_amount ?? 0), 0)
    const balanceCents = Number((ledgerRes.data as any)?.balance_after ?? 0)

    const anticipationAvailable = await getAvailableAnticipationAmount({ supabase, organizationId })

    const payouts = Array.isArray(payoutsRes.data) ? payoutsRes.data : []
    const pendingPayouts = payouts.filter((p: any) => ['requested', 'processing', 'scheduled'].includes(String(p.status ?? '')))

    const divergences = Array.isArray(concRes.data) ? concRes.data : []

    const subs = Array.isArray(subsRes.data) ? subsRes.data : []
    const plansById = new Map<string, { amountCents: number; cycle: any }>()
    for (const s of subs) {
      const planId = String((s as any).plano_id ?? '')
      if (!planId) continue
      const cycle = String((s as any)?.plano?.cycle ?? 'monthly')
      const amountCents = Number((s as any)?.plano?.amount_centavos ?? 0)
      plansById.set(planId, { amountCents, cycle })
    }
    const mrrCents = calculateMRRCents({
      plansById: plansById as any,
      subscriptions: subs.map((s: any) => ({ planoId: String(s.plano_id ?? ''), status: String(s.status ?? '') })),
    })
    const churnRate = calculateChurnRate({
      nowIso: endIso,
      windowDays: days,
      subscriptions: subs.map((s: any) => ({
        status: String(s.status ?? ''),
        createdAt: typeof s.created_at === 'string' ? s.created_at : null,
        canceledAt: s.canceled_at ? String(s.canceled_at) : null,
      })),
    })

    const seriesDays = buildDailySeriesFromPaidTransactions({ paidTx })
    const txMethods = Array.isArray(txMethodsRes.data) ? txMethodsRes.data : []
    const paymentsByMethod = buildPaymentsByMethod({ txs: txMethods })
    const subscriptionsByStatus = buildSubscriptionsByStatus({ subs })

    return json({
      metrics: {
        period: { start: startIso, end: endIso, days },
        ...(receiverId && receiverId.trim() ? { receiver_id: receiverId.trim() } : null),
        ...(receiverVolumeCents != null ? { receiver_volume_cents: receiverVolumeCents } : null),
        tpv_cents: tpvCents,
        connekt_revenue_cents: connektRevenueCents,
        balance_cents: balanceCents,
        anticipable_cents: anticipationAvailable.availableCents,
        payments: { approved: paidTx.length, pending: pendingTx.length },
        subscriptions: { mrr_cents: mrrCents, churn_rate: churnRate },
        payouts: { pending: pendingPayouts.length },
        reconciliation: { divergences: divergences.length },
        charts: { by_day: seriesDays, payments_by_method: paymentsByMethod, subscriptions_by_status: subscriptionsByStatus },
      },
    })
  } catch (e) {
    const err = classifyInternalApiError(e)
    return json({ error: err.message }, { status: err.status })
  }
}

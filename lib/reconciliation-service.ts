import 'server-only'

import { getAcquirerProvider } from '@/lib/acquirer'
import { mapProviderErrorToUserMessage as mapNeutralProviderErrorToUserMessage, ProviderError } from '@/lib/acquirer/provider-error'
import { getOrganizationOwnerEmail } from '@/lib/audit-actor'
import { insertAuditLog } from '@/lib/audit-log'
import { getFinancialProvider } from '@/lib/env'
import { sendTransactionalEmail } from '@/lib/email-service'
import { getEnabledReconciliationEntityTypes } from '@/lib/reconciliation-config'
import { classifyDivergence, normalizeInternalStatus, normalizeProviderStatus, sanitizeProviderPayload } from '@/lib/reconciliation-core'

type SupabaseLike = any

function isMissingDbObjectError(err: any) {
  const code = err?.code ? String(err.code) : ''
  if (code === 'PGRST205') return true
  if (code === '42P01') return true
  if (code === '42703') return true
  const msg = err?.message ? String(err.message) : ''
  if (msg.toLowerCase().includes('schema cache')) return true
  if (msg.toLowerCase().includes('does not exist')) return true
  return false
}

function mapProviderErrorToUserMessage(e: unknown) {
  if (e instanceof ProviderError && (e.status === 501 || e.status === 404 || e.code === 'NOT_IMPLEMENTED' || e.code === 'not_found')) {
    return 'O provedor ativo ainda não disponibiliza este endpoint para conciliação.'
  }
  return mapNeutralProviderErrorToUserMessage(e, 'Falha ao consultar dados do provedor.')
}

async function upsertConciliationItem(input: {
  supabase: SupabaseLike
  organizationId: string
  runId: string
  entityType: string
  entityId: string | null
  providerReference: string | null
  internalStatus: string | null
  providerStatus: string | null
  internalAmountCents: number | null
  providerAmountCents: number | null
  differenceCents: number | null
  status: string
  reason: string | null
  payload: unknown
}) {
  const supabase = input.supabase
  let existing: any = null

  if (input.entityId) {
    const { data } = await supabase
      .from('pay_conciliation_items')
      .select('id, status')
      .eq('organization_id', input.organizationId)
      .eq('run_id', input.runId)
      .eq('entity_type', input.entityType)
      .eq('entity_id', input.entityId)
      .maybeSingle()
    existing = data
  } else if (input.providerReference) {
    const { data } = await supabase
      .from('pay_conciliation_items')
      .select('id, status')
      .eq('organization_id', input.organizationId)
      .eq('run_id', input.runId)
      .eq('entity_type', input.entityType)
      .eq('provider_reference', input.providerReference)
      .maybeSingle()
    existing = data
  }

  const row = {
    organization_id: input.organizationId,
    run_id: input.runId,
    entity_type: input.entityType,
    entity_id: input.entityId,
    provider_reference: input.providerReference,
    internal_status: input.internalStatus,
    provider_status: input.providerStatus,
    internal_amount_centavos: input.internalAmountCents,
    provider_amount_centavos: input.providerAmountCents,
    difference_centavos: input.differenceCents ?? 0,
    status: input.status,
    reason: input.reason,
    payload: sanitizeProviderPayload(input.payload),
  }

  if (existing?.id) {
    if (String(existing.status ?? '') === 'resolved') return { id: existing.id as string, skipped: true as const }
    const upd = await supabase.from('pay_conciliation_items').update(row).eq('id', existing.id).select('id').single()
    if (upd.error) throw new Error('Failed to update conciliation item')
    return { id: upd.data.id as string, skipped: false as const }
  }

  const ins = await supabase.from('pay_conciliation_items').insert(row).select('id').single()
  if (ins.error) throw new Error('Failed to insert conciliation item')
  return { id: ins.data.id as string, skipped: false as const }
}

export async function createReconciliationRun(input: {
  supabase: SupabaseLike
  organizationId: string
  actorProfileId: string
  periodStart: string
  periodEnd: string
  provider?: string
}) {
  const provider = input.provider ?? getFinancialProvider()
  const startedAt = new Date().toISOString()
  const runIns = await input.supabase
    .from('pay_conciliation_runs')
    .insert({
      organization_id: input.organizationId,
      started_at: startedAt,
      status: 'running',
      provider,
      period_start: input.periodStart,
      period_end: input.periodEnd,
      created_by: input.actorProfileId,
    })
    .select('id')
    .single()
  if (runIns.error) throw new Error('Failed to create conciliation run')

  const runId = runIns.data.id as string
  await input.supabase.from('pay_conciliation_events').insert({
    organization_id: input.organizationId,
    run_id: runId,
    event_type: 'run.started',
    payload: { period_start: input.periodStart, period_end: input.periodEnd, provider },
  })

  await insertAuditLog({
    organizationId: input.organizationId,
    actorProfileId: input.actorProfileId,
    actorUserId: input.actorProfileId,
    authType: 'session',
    origin: 'internal_api',
    action: 'CREATE',
    entity: 'pay_conciliation_run',
    entityId: runId,
    before: null,
    after: { provider, period_start: input.periodStart, period_end: input.periodEnd },
  })

  const providerClient = getAcquirerProvider(provider)
  const stats = {
    checked: 0,
    matched: 0,
    divergent: 0,
    internalSum: 0,
    providerSum: 0,
    diffSum: 0,
    providerErrors: 0,
  }

  const enabledEntityTypes = getEnabledReconciliationEntityTypes()
  await reconcileTransactions({
    supabase: input.supabase,
    organizationId: input.organizationId,
    runId,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    provider: providerClient,
    stats,
    actorProfileId: input.actorProfileId,
  })
  if (enabledEntityTypes.includes('anticipation')) {
    await reconcileAnticipations({
      supabase: input.supabase,
      organizationId: input.organizationId,
      runId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      provider: providerClient,
      stats,
      actorProfileId: input.actorProfileId,
    })
  }
  if (enabledEntityTypes.includes('payout')) {
    await reconcilePayouts({
      supabase: input.supabase,
      organizationId: input.organizationId,
      runId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      provider: providerClient,
      stats,
      actorProfileId: input.actorProfileId,
    })
  }

  const finishedAt = new Date().toISOString()
  const summary = {
    total_checked: stats.checked,
    total_matched: stats.matched,
    total_divergent: stats.divergent,
    provider_errors: stats.providerErrors,
  }

  await input.supabase
    .from('pay_conciliation_runs')
    .update({
      finished_at: finishedAt,
      status: 'finished',
      total_checked: stats.checked,
      total_matched: stats.matched,
      total_divergent: stats.divergent,
      total_internal_amount_centavos: stats.internalSum,
      total_provider_amount_centavos: stats.providerSum,
      total_difference_centavos: stats.diffSum,
      summary,
    })
    .eq('organization_id', input.organizationId)
    .eq('id', runId)

  await input.supabase.from('pay_conciliation_events').insert({
    organization_id: input.organizationId,
    run_id: runId,
    event_type: 'run.finished',
    payload: { status: 'finished', summary, entity_types: enabledEntityTypes },
  })

  if (stats.divergent > 0) {
    try {
      const to = await getOrganizationOwnerEmail(input.organizationId)
      await sendTransactionalEmail({
        organizationId: input.organizationId,
        to,
        template: 'reconciliation.divergence',
        data: { run_id: runId, total_divergent: stats.divergent, period_start: input.periodStart, period_end: input.periodEnd },
      })
    } catch {
    }
  }

  return { runId }
}

export async function reconcileTransactions(input: {
  supabase: SupabaseLike
  organizationId: string
  runId: string
  periodStart: string
  periodEnd: string
  provider: any
  stats: { checked: number; matched: number; divergent: number; internalSum: number; providerSum: number; diffSum: number; providerErrors: number }
  actorProfileId: string
}) {
  const { data: txs } = await input.supabase
    .from('transactions')
    .select('id, provider_reference, amount, status, created_at')
    .eq('organization_id', input.organizationId)
    .gte('created_at', input.periodStart)
    .lte('created_at', input.periodEnd)
    .order('created_at', { ascending: false })
    .limit(1000)

  const list = Array.isArray(txs) ? txs : []
  for (const t of list) {
    input.stats.checked += 1
    const internalAmount = Number((t as any).amount ?? 0)
    input.stats.internalSum += internalAmount
    const internalStatusRaw = (t as any).status
    const providerRef = typeof (t as any).provider_reference === 'string' ? ((t as any).provider_reference as string) : null

    if (!providerRef) {
      const item = await upsertConciliationItem({
        supabase: input.supabase,
        organizationId: input.organizationId,
        runId: input.runId,
        entityType: 'transaction',
        entityId: String((t as any).id),
        providerReference: null,
        internalStatus: normalizeInternalStatus({ entityType: 'transaction', status: internalStatusRaw }),
        providerStatus: null,
        internalAmountCents: internalAmount,
        providerAmountCents: null,
        differenceCents: null,
        status: 'pending',
        reason: 'missing_provider_reference',
        payload: { internal: { id: (t as any).id, status: internalStatusRaw, amount_centavos: internalAmount } },
      })
      if (!item.skipped) {
        await insertAuditLog({
          organizationId: input.organizationId,
          actorProfileId: input.actorProfileId,
          actorUserId: input.actorProfileId,
          authType: 'session',
          origin: 'internal_api',
          action: 'CREATE',
          entity: 'pay_conciliation_item',
          entityId: item.id,
          before: null,
          after: { entity_type: 'transaction', entity_id: (t as any).id, reason: 'missing_provider_reference' },
        })
      }
      continue
    }

    let providerStatus: string | null = null
    let providerAmount: number | null = null
    let providerRaw: unknown = null
    try {
      const pr = await input.provider.getTransaction({ id: providerRef })
      providerStatus = typeof pr?.status === 'string' ? pr.status : null
      providerAmount = typeof pr?.amountCents === 'number' ? pr.amountCents : null
      providerRaw = pr?.raw ?? pr
    } catch (e) {
      input.stats.providerErrors += 1
      const msg = mapProviderErrorToUserMessage(e)
      const item = await upsertConciliationItem({
        supabase: input.supabase,
        organizationId: input.organizationId,
        runId: input.runId,
        entityType: 'transaction',
        entityId: String((t as any).id),
        providerReference: providerRef,
        internalStatus: normalizeInternalStatus({ entityType: 'transaction', status: internalStatusRaw }),
        providerStatus: null,
        internalAmountCents: internalAmount,
        providerAmountCents: null,
        differenceCents: null,
        status: 'pending',
        reason: 'provider_unavailable',
        payload: { message: msg, provider_reference: providerRef },
      })
      if (!item.skipped) {
        await insertAuditLog({
          organizationId: input.organizationId,
          actorProfileId: input.actorProfileId,
          actorUserId: input.actorProfileId,
          authType: 'session',
          origin: 'internal_api',
          action: 'CREATE',
          entity: 'pay_conciliation_item',
          entityId: item.id,
          before: null,
          after: { entity_type: 'transaction', entity_id: (t as any).id, reason: 'provider_unavailable' },
        })
      }
      continue
    }

    if (providerAmount != null) input.stats.providerSum += providerAmount
    const classified = classifyDivergence({
      entityType: 'transaction',
      internalStatus: internalStatusRaw,
      providerStatus,
      internalAmountCents: internalAmount,
      providerAmountCents: providerAmount,
    })

    const diff = typeof classified.diff === 'number' ? classified.diff : calculateFallbackDiff(internalAmount, providerAmount)
    if (typeof diff === 'number') input.stats.diffSum += diff
    if (classified.status === 'matched') input.stats.matched += 1
    if (classified.status === 'divergent') input.stats.divergent += 1

    const item = await upsertConciliationItem({
      supabase: input.supabase,
      organizationId: input.organizationId,
      runId: input.runId,
      entityType: 'transaction',
      entityId: String((t as any).id),
      providerReference: providerRef,
      internalStatus: normalizeInternalStatus({ entityType: 'transaction', status: internalStatusRaw }),
      providerStatus: normalizeProviderStatus({ entityType: 'transaction', status: providerStatus }),
      internalAmountCents: internalAmount,
      providerAmountCents: providerAmount,
      differenceCents: typeof diff === 'number' ? diff : 0,
      status: classified.status,
      reason: classified.reason,
      payload: { provider: providerRaw },
    })

    if (!item.skipped && classified.status !== 'matched') {
      await insertAuditLog({
        organizationId: input.organizationId,
        actorProfileId: input.actorProfileId,
        actorUserId: input.actorProfileId,
        authType: 'session',
        origin: 'internal_api',
        action: 'CREATE',
        entity: 'pay_conciliation_item',
        entityId: item.id,
        before: null,
        after: { entity_type: 'transaction', entity_id: (t as any).id, reason: classified.reason },
      })
    }
  }
}

function calculateFallbackDiff(internal: number, provider: number | null) {
  if (provider == null) return null
  return Math.round(internal) - Math.round(provider)
}

export async function reconcileAnticipations(input: {
  supabase: SupabaseLike
  organizationId: string
  runId: string
  periodStart: string
  periodEnd: string
  provider: any
  stats: { checked: number; matched: number; divergent: number; internalSum: number; providerSum: number; diffSum: number; providerErrors: number }
  actorProfileId: string
}) {
  const { data: ants } = await input.supabase
    .from('pay_antecipacao')
    .select('id, requested_amount_centavos, status, provider_reference, acquirer_anticipation_id, created_at')
    .eq('organization_id', input.organizationId)
    .gte('created_at', input.periodStart)
    .lte('created_at', input.periodEnd)
    .order('created_at', { ascending: false })
    .limit(1000)

  const list = Array.isArray(ants) ? ants : []
  for (const a of list) {
    input.stats.checked += 1
    const internalAmount = Number((a as any).requested_amount_centavos ?? 0)
    input.stats.internalSum += internalAmount
    const internalStatusRaw = (a as any).status
    const providerRef =
      typeof (a as any).acquirer_anticipation_id === 'string'
        ? ((a as any).acquirer_anticipation_id as string)
        : typeof (a as any).provider_reference === 'string'
          ? ((a as any).provider_reference as string)
          : null

    if (!providerRef) {
      await upsertConciliationItem({
        supabase: input.supabase,
        organizationId: input.organizationId,
        runId: input.runId,
        entityType: 'anticipation',
        entityId: String((a as any).id),
        providerReference: null,
        internalStatus: normalizeInternalStatus({ entityType: 'anticipation', status: internalStatusRaw }),
        providerStatus: null,
        internalAmountCents: internalAmount,
        providerAmountCents: null,
        differenceCents: null,
        status: 'pending',
        reason: 'missing_provider_reference',
        payload: { internal: { id: (a as any).id, status: internalStatusRaw, amount_centavos: internalAmount } },
      })
      continue
    }

    let providerStatus: string | null = null
    let providerAmount: number | null = null
    let providerRaw: unknown = null
    try {
      const pr = await input.provider.getAnticipation({ id: providerRef })
      providerStatus = typeof pr?.status === 'string' ? pr.status : null
      providerRaw = pr?.raw ?? pr
      providerAmount =
        typeof (providerRaw as any)?.data?.amount === 'number'
          ? Number((providerRaw as any).data.amount)
          : typeof (providerRaw as any)?.amount === 'number'
            ? Number((providerRaw as any).amount)
            : null
    } catch (e) {
      input.stats.providerErrors += 1
      const msg = mapProviderErrorToUserMessage(e)
      await upsertConciliationItem({
        supabase: input.supabase,
        organizationId: input.organizationId,
        runId: input.runId,
        entityType: 'anticipation',
        entityId: String((a as any).id),
        providerReference: providerRef,
        internalStatus: normalizeInternalStatus({ entityType: 'anticipation', status: internalStatusRaw }),
        providerStatus: null,
        internalAmountCents: internalAmount,
        providerAmountCents: null,
        differenceCents: null,
        status: 'pending',
        reason: 'provider_unavailable',
        payload: { message: msg, provider_reference: providerRef },
      })
      continue
    }

    if (providerAmount != null) input.stats.providerSum += providerAmount
    const classified = classifyDivergence({
      entityType: 'anticipation',
      internalStatus: internalStatusRaw,
      providerStatus,
      internalAmountCents: internalAmount,
      providerAmountCents: providerAmount,
    })
    const diff = typeof classified.diff === 'number' ? classified.diff : calculateFallbackDiff(internalAmount, providerAmount)
    if (typeof diff === 'number') input.stats.diffSum += diff
    if (classified.status === 'matched') input.stats.matched += 1
    if (classified.status === 'divergent') input.stats.divergent += 1

    await upsertConciliationItem({
      supabase: input.supabase,
      organizationId: input.organizationId,
      runId: input.runId,
      entityType: 'anticipation',
      entityId: String((a as any).id),
      providerReference: providerRef,
      internalStatus: normalizeInternalStatus({ entityType: 'anticipation', status: internalStatusRaw }),
      providerStatus: normalizeProviderStatus({ entityType: 'anticipation', status: providerStatus }),
      internalAmountCents: internalAmount,
      providerAmountCents: providerAmount,
      differenceCents: typeof diff === 'number' ? diff : 0,
      status: classified.status,
      reason: classified.reason,
      payload: { provider: providerRaw },
    })
  }
}

export async function reconcilePayouts(input: {
  supabase: SupabaseLike
  organizationId: string
  runId: string
  periodStart: string
  periodEnd: string
  provider: any
  stats: { checked: number; matched: number; divergent: number; internalSum: number; providerSum: number; diffSum: number; providerErrors: number }
  actorProfileId: string
}) {
  const { data: ps } = await input.supabase
    .from('payouts')
    .select('id, net_amount, gross_amount, status, provider_reference, created_at')
    .eq('organization_id', input.organizationId)
    .eq('is_internal', false)
    .gte('created_at', input.periodStart)
    .lte('created_at', input.periodEnd)
    .order('created_at', { ascending: false })
    .limit(1000)

  const list = Array.isArray(ps) ? ps : []
  for (const p of list) {
    input.stats.checked += 1
    const internalAmount = Number((p as any).net_amount ?? (p as any).gross_amount ?? 0)
    input.stats.internalSum += internalAmount
    const internalStatusRaw = (p as any).status
    const providerRef = typeof (p as any).provider_reference === 'string' ? ((p as any).provider_reference as string) : null

    if (!providerRef) {
      await upsertConciliationItem({
        supabase: input.supabase,
        organizationId: input.organizationId,
        runId: input.runId,
        entityType: 'payout',
        entityId: String((p as any).id),
        providerReference: null,
        internalStatus: normalizeInternalStatus({ entityType: 'payout', status: internalStatusRaw }),
        providerStatus: null,
        internalAmountCents: internalAmount,
        providerAmountCents: null,
        differenceCents: null,
        status: 'pending',
        reason: 'missing_provider_reference',
        payload: { internal: { id: (p as any).id, status: internalStatusRaw, amount_centavos: internalAmount } },
      })
      continue
    }

    let providerStatus: string | null = null
    let providerAmount: number | null = null
    let providerRaw: unknown = null
    try {
      const pr = await input.provider.getPayout({ id: providerRef })
      providerStatus = typeof pr?.status === 'string' ? pr.status : null
      providerRaw = pr?.raw ?? pr
      providerAmount =
        typeof (providerRaw as any)?.data?.amount === 'number'
          ? Number((providerRaw as any).data.amount)
          : typeof (providerRaw as any)?.amount === 'number'
            ? Number((providerRaw as any).amount)
            : null
    } catch (e) {
      input.stats.providerErrors += 1
      const msg = mapProviderErrorToUserMessage(e)
      await upsertConciliationItem({
        supabase: input.supabase,
        organizationId: input.organizationId,
        runId: input.runId,
        entityType: 'payout',
        entityId: String((p as any).id),
        providerReference: providerRef,
        internalStatus: normalizeInternalStatus({ entityType: 'payout', status: internalStatusRaw }),
        providerStatus: null,
        internalAmountCents: internalAmount,
        providerAmountCents: null,
        differenceCents: null,
        status: 'pending',
        reason: 'provider_unavailable',
        payload: { message: msg, provider_reference: providerRef },
      })
      continue
    }

    if (providerAmount != null) input.stats.providerSum += providerAmount
    const classified = classifyDivergence({
      entityType: 'payout',
      internalStatus: internalStatusRaw,
      providerStatus,
      internalAmountCents: internalAmount,
      providerAmountCents: providerAmount,
    })
    const diff = typeof classified.diff === 'number' ? classified.diff : calculateFallbackDiff(internalAmount, providerAmount)
    if (typeof diff === 'number') input.stats.diffSum += diff
    if (classified.status === 'matched') input.stats.matched += 1
    if (classified.status === 'divergent') input.stats.divergent += 1

    await upsertConciliationItem({
      supabase: input.supabase,
      organizationId: input.organizationId,
      runId: input.runId,
      entityType: 'payout',
      entityId: String((p as any).id),
      providerReference: providerRef,
      internalStatus: normalizeInternalStatus({ entityType: 'payout', status: internalStatusRaw }),
      providerStatus: normalizeProviderStatus({ entityType: 'payout', status: providerStatus }),
      internalAmountCents: internalAmount,
      providerAmountCents: providerAmount,
      differenceCents: typeof diff === 'number' ? diff : 0,
      status: classified.status,
      reason: classified.reason,
      payload: { provider: providerRaw },
    })
  }
}

export async function listReconciliationRuns(input: { supabase: SupabaseLike; organizationId: string }) {
  const primary = await input.supabase
    .from('pay_conciliation_runs')
    .select('id, started_at, finished_at, status, provider, period_start, period_end, total_checked, total_matched, total_divergent, total_difference_centavos')
    .eq('organization_id', input.organizationId)
    .order('started_at', { ascending: false })
    .limit(50)

  if (!primary.error) return { runs: primary.data ?? [] }

  if (!isMissingDbObjectError(primary.error)) throw new Error('Failed to list runs')

  const legacy = await input.supabase
    .from('conciliation_runs')
    .select('id, status, started_at, finished_at, created_at')
    .eq('organization_id', input.organizationId)
    .order('started_at', { ascending: false })
    .limit(50)

  if (legacy.error) return { runs: [] }

  const runs = (Array.isArray(legacy.data) ? legacy.data : []).map((r: any) => ({
    id: r.id,
    started_at: r.started_at ?? r.created_at ?? null,
    finished_at: r.finished_at ?? null,
    status: r.status ?? null,
    provider: null,
    period_start: null,
    period_end: null,
    total_checked: 0,
    total_matched: 0,
    total_divergent: 0,
    total_difference_centavos: 0,
  }))

  return { runs }
}

export async function getReconciliationRun(input: { supabase: SupabaseLike; organizationId: string; runId: string }) {
  const { data, error } = await input.supabase
    .from('pay_conciliation_runs')
    .select('*')
    .eq('organization_id', input.organizationId)
    .eq('id', input.runId)
    .maybeSingle()
  if (error) throw new Error('Failed to load run')
  if (!data) throw new Error('Not found')
  return { run: data }
}

export async function listReconciliationItems(input: { supabase: SupabaseLike; organizationId: string; runId: string; status?: string | null }) {
  let q = input.supabase
    .from('pay_conciliation_items')
    .select('id, entity_type, entity_id, provider_reference, internal_status, provider_status, internal_amount_centavos, provider_amount_centavos, difference_centavos, status, reason, resolved_at, created_at')
    .eq('organization_id', input.organizationId)
    .eq('run_id', input.runId)
    .order('created_at', { ascending: false })
    .limit(500)
  if (input.status) q = q.eq('status', input.status)
  const { data, error } = await q
  if (!error) return { items: data ?? [] }
  if (!isMissingDbObjectError(error)) throw new Error('Failed to list items')

  const legacy = await input.supabase
    .from('conciliation_items')
    .select('id, status, created_at')
    .eq('organization_id', input.organizationId)
    .eq('run_id', input.runId)
    .order('created_at', { ascending: false })
    .limit(500)

  if (legacy.error) return { items: [] }
  const items = (Array.isArray(legacy.data) ? legacy.data : []).map((it: any) => ({
    id: it.id,
    entity_type: null,
    entity_id: null,
    provider_reference: null,
    internal_status: null,
    provider_status: null,
    internal_amount_centavos: null,
    provider_amount_centavos: null,
    difference_centavos: 0,
    status: it.status ?? null,
    reason: null,
    resolved_at: null,
    created_at: it.created_at ?? null,
  }))
  return { items }
}

export async function markConciliationItemAsResolved(input: { supabase: SupabaseLike; organizationId: string; actorProfileId: string; itemId: string }) {
  const { data: before } = await input.supabase.from('pay_conciliation_items').select('*').eq('organization_id', input.organizationId).eq('id', input.itemId).maybeSingle()
  if (!before) throw new Error('Not found')
  if (String((before as any).status ?? '') === 'resolved') return { item: before }

  const now = new Date().toISOString()
  const { data, error } = await input.supabase
    .from('pay_conciliation_items')
    .update({ status: 'resolved', resolved_at: now })
    .eq('organization_id', input.organizationId)
    .eq('id', input.itemId)
    .select('id, status, resolved_at')
    .single()
  if (error) throw new Error('Failed to resolve item')

  await insertAuditLog({
    organizationId: input.organizationId,
    actorProfileId: input.actorProfileId,
    actorUserId: input.actorProfileId,
    authType: 'session',
    origin: 'internal_api',
    action: 'RESOLVE',
    entity: 'pay_conciliation_item',
    entityId: input.itemId,
    before,
    after: data,
  })

  return { item: data }
}

export async function reprocessConciliationItem(input: { supabase: SupabaseLike; organizationId: string; actorProfileId: string; itemId: string }) {
  const { data: item } = await input.supabase.from('pay_conciliation_items').select('*').eq('organization_id', input.organizationId).eq('id', input.itemId).maybeSingle()
  if (!item) throw new Error('Not found')
  if (String((item as any).status ?? '') === 'resolved') return { ok: true, skipped: true }

  const entityType = String((item as any).entity_type ?? '')
  const entityId = (item as any).entity_id as string | null
  const providerRef = (item as any).provider_reference as string | null
  if (!providerRef) throw new Error('Missing provider reference')

  const provider = getAcquirerProvider()
  try {
    if (entityType === 'transaction') {
      const pr = await provider.getTransaction({ id: providerRef })
      const providerStatus = typeof pr?.status === 'string' ? pr.status : null
      const providerAmount = typeof pr?.amountCents === 'number' ? pr.amountCents : null
      const internalStatus = (item as any).internal_status
      const internalAmount = (item as any).internal_amount_centavos != null ? Number((item as any).internal_amount_centavos) : null
      const classified = classifyDivergence({
        entityType,
        internalStatus,
        providerStatus,
        internalAmountCents: internalAmount,
        providerAmountCents: providerAmount,
      })
      const diff = typeof classified.diff === 'number' ? classified.diff : internalAmount != null && providerAmount != null ? internalAmount - providerAmount : 0
      await input.supabase
        .from('pay_conciliation_items')
        .update({
          provider_status: normalizeProviderStatus({ entityType, status: providerStatus }),
          provider_amount_centavos: providerAmount,
          difference_centavos: diff,
          status: classified.status,
          reason: classified.reason,
          payload: sanitizeProviderPayload({ provider: pr?.raw ?? pr }),
        })
        .eq('organization_id', input.organizationId)
        .eq('id', input.itemId)
    } else if (entityType === 'anticipation') {
      const pr = await provider.getAnticipation({ id: providerRef })
      const providerStatus = typeof pr?.status === 'string' ? pr.status : null
      await input.supabase
        .from('pay_conciliation_items')
        .update({
          provider_status: normalizeProviderStatus({ entityType, status: providerStatus }),
          status: 'pending',
          reason: 'reprocessed',
          payload: sanitizeProviderPayload({ provider: pr?.raw ?? pr }),
        })
        .eq('organization_id', input.organizationId)
        .eq('id', input.itemId)
    } else if (entityType === 'payout') {
      const pr = await provider.getPayout({ id: providerRef })
      const providerStatus = typeof pr?.status === 'string' ? pr.status : null
      await input.supabase
        .from('pay_conciliation_items')
        .update({
          provider_status: normalizeProviderStatus({ entityType, status: providerStatus }),
          status: 'pending',
          reason: 'reprocessed',
          payload: sanitizeProviderPayload({ provider: pr?.raw ?? pr }),
        })
        .eq('organization_id', input.organizationId)
        .eq('id', input.itemId)
    }
  } catch (e) {
    const msg = mapProviderErrorToUserMessage(e)
    await input.supabase.from('pay_conciliation_items').update({ status: 'pending', reason: 'provider_unavailable', payload: sanitizeProviderPayload({ message: msg }) })
      .eq('organization_id', input.organizationId)
      .eq('id', input.itemId)
    throw new Error(msg)
  }

  await insertAuditLog({
    organizationId: input.organizationId,
    actorProfileId: input.actorProfileId,
    actorUserId: input.actorProfileId,
    authType: 'session',
    origin: 'internal_api',
    action: 'REPROCESS',
    entity: 'pay_conciliation_item',
    entityId: input.itemId,
    before: { entityType, entityId, providerRef },
    after: { ok: true },
  })

  return { ok: true }
}

import {
  getPayoutAuditAction,
  getPayoutInternalIssues,
  normalizePayoutInternalDraft,
  simulateInternalPayout,
  type PayoutEligibleReceiver,
  type PayoutInternalDraft,
} from '@/lib/payouts-internal-core'
import { getFinancialEnvironment } from '@/lib/env'
import { maskDocument, redactBankAccount, sanitizeBankAccount } from '@/lib/receiver-kyc'

type SupabaseLike = any

const INTERNAL_PAYOUT_FINAL_STATUSES = ['rejected', 'paid', 'failed', 'cancelled'] as const
const INTERNAL_PAYOUT_OPEN_STATUSES = ['requested', 'under_review', 'approved', 'scheduled', 'provider_pending', 'provider_processing'] as const

async function insertPayoutInternalAuditLog(input: {
  supabase: SupabaseLike
  organizationId: string
  actorProfileId: string
  action: string
  entityId?: string | null
  before?: unknown
  after?: unknown
}) {
  const { error } = await input.supabase.from('audit_logs').insert({
    organization_id: input.organizationId,
    actor_profile_id: input.actorProfileId,
    actor_user_id: input.actorProfileId,
    origin: 'internal_api',
    action: input.action,
    entity: 'payout_internal',
    entity_id: input.entityId ?? null,
    before: (input.before ?? null) as any,
    after: (input.after ?? null) as any,
  })
  if (error) throw new Error('Nao foi possivel registrar a auditoria desta operacao.')
}

function toDateOnly(value: unknown) {
  if (typeof value !== 'string' || !value) return null
  return value.slice(0, 10)
}

function toStartOfDayIso(dateOnly: string | null) {
  if (!dateOnly) return null
  return `${dateOnly}T00:00:00.000Z`
}

function mapEligibleReceiver(row: any): PayoutEligibleReceiver {
  return {
    id: String(row.id),
    name: typeof row.name === 'string' && row.name.trim() ? row.name.trim() : 'Recebedor',
    document: row.document ? String(row.document) : null,
    type: row.type ? String(row.type) : null,
    status: String(row.status ?? 'inactive'),
    kycStatus: String(row.kyc_status ?? 'pending'),
    internalStatus: String(row.internal_status ?? 'draft'),
    bankAccountMasked: row.bank_account ? redactBankAccount(row.bank_account) : null,
  }
}

function redactPayoutForAudit(row: any) {
  return {
    id: String(row.id ?? ''),
    receiver_id: String(row.receiver_id ?? ''),
    receiver_name: typeof row.receiver?.name === 'string' ? row.receiver.name : null,
    receiver_document_masked: row.receiver?.document ? maskDocument(row.receiver.document) : null,
    gross_amount: Number(row.gross_amount ?? 0),
    fee_amount: Number(row.fee_amount ?? 0),
    net_amount: Number(row.net_amount ?? 0),
    status: String(row.status ?? 'draft'),
    scheduled_for: row.scheduled_for ? String(row.scheduled_for) : null,
    requested_at: row.requested_at ? String(row.requested_at) : null,
    approved_at: row.approved_at ? String(row.approved_at) : null,
    paid_at: row.paid_at ? String(row.paid_at) : null,
    failed_at: row.failed_at ? String(row.failed_at) : null,
    canceled_at: row.canceled_at ? String(row.canceled_at) : null,
    rejected_at: row.rejected_at ? String(row.rejected_at) : null,
    rejection_reason: typeof row.rejection_reason === 'string' ? row.rejection_reason : null,
    internal_notes: typeof row.internal_notes === 'string' ? row.internal_notes : null,
    provider_reference: typeof row.provider_reference === 'string' ? row.provider_reference : null,
    bank_account_snapshot: redactBankAccount(row.bank_account_snapshot),
    is_internal: Boolean(row.is_internal),
  }
}

function mapPayout(row: any, receiverMap: Map<string, PayoutEligibleReceiver>) {
  const receiverId = String(row.receiver_id)
  const receiver = receiverMap.get(receiverId) ?? null
  return {
    id: String(row.id),
    receiverId,
    grossAmountCents: Number(row.gross_amount ?? 0),
    feeAmountCents: Number(row.fee_amount ?? 0),
    netAmountCents: Number(row.net_amount ?? 0),
    status: String(row.status ?? 'draft'),
    scheduledFor: toDateOnly(row.scheduled_for),
    requestedAt: toDateOnly(row.requested_at ?? row.created_at),
    approvedAt: toDateOnly(row.approved_at),
    executedAt: toDateOnly(row.paid_at),
    failedAt: toDateOnly(row.failed_at),
    cancelledAt: toDateOnly(row.canceled_at),
    rejectedAt: toDateOnly(row.rejected_at),
    rejectionReason: typeof row.rejection_reason === 'string' ? row.rejection_reason : null,
    internalNotes: typeof row.internal_notes === 'string' ? row.internal_notes : null,
    providerReference: typeof row.provider_reference === 'string' ? row.provider_reference : null,
    providerStatus: null,
    bankAccountMasked: row.bank_account_snapshot ? redactBankAccount(row.bank_account_snapshot) : null,
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
    receiver: receiver
      ? {
          id: receiver.id,
          name: receiver.name,
          document: receiver.document,
          type: receiver.type,
          status: receiver.status,
          kycStatus: receiver.kycStatus,
          internalStatus: receiver.internalStatus,
          bankAccountMasked: receiver.bankAccountMasked,
        }
      : null,
  }
}

async function loadEligibleReceiverRows(supabase: SupabaseLike, organizationId: string) {
  const runtime = getFinancialEnvironment()
  const { data, error } = await supabase
    .from('receivers')
    .select('id, name, document, type, status, kyc_status, internal_status, bank_account')
    .eq('organization_id', organizationId)
    .eq('provider', runtime.providerId)
    .eq('provider_environment', runtime.environment)
    .eq('status', 'active')
    .eq('kyc_status', 'approved')
    .neq('internal_status', 'blocked')
    .order('created_at', { ascending: false })

  if (error) throw new Error('Nao foi possivel carregar os recebedores elegiveis para repasse interno.')
  return Array.isArray(data) ? data : []
}

export async function loadPayoutEligibleReceivers(supabase: SupabaseLike, organizationId: string) {
  const rows = await loadEligibleReceiverRows(supabase, organizationId)
  return rows.map(mapEligibleReceiver)
}

async function loadInternalPayoutRows(supabase: SupabaseLike, organizationId: string) {
  const runtime = getFinancialEnvironment()
  const { data, error } = await supabase
    .from('payouts')
    .select(
      'id, receiver_id, gross_amount, fee_amount, net_amount, status, scheduled_for, provider_reference, requested_at, approved_at, paid_at, failed_at, canceled_at, rejected_at, rejection_reason, internal_notes, bank_account_snapshot, is_internal, created_at, updated_at',
    )
    .eq('organization_id', organizationId)
    .eq('provider', runtime.providerId)
    .eq('provider_environment', runtime.environment)
    .eq('is_internal', true)
    .order('created_at', { ascending: false })

  if (error) throw new Error('Nao foi possivel carregar os repasses internos.')
  return Array.isArray(data) ? data : []
}

async function getInternalPayoutRow(input: { supabase: SupabaseLike; organizationId: string; payoutId: string }) {
  const runtime = getFinancialEnvironment()
  const { data, error } = await input.supabase
    .from('payouts')
    .select(
      'id, receiver_id, gross_amount, fee_amount, net_amount, status, scheduled_for, provider_reference, requested_at, approved_at, paid_at, failed_at, canceled_at, rejected_at, rejection_reason, internal_notes, bank_account_snapshot, is_internal, created_at, updated_at',
    )
    .eq('organization_id', input.organizationId)
    .eq('provider', runtime.providerId)
    .eq('provider_environment', runtime.environment)
    .eq('id', input.payoutId)
    .eq('is_internal', true)
    .maybeSingle()

  if (error) throw new Error('Nao foi possivel localizar o repasse interno.')
  if (!data) throw new Error('Repasse interno nao encontrado.')
  return data
}

async function loadPayoutEventRows(input: { supabase: SupabaseLike; organizationId: string; payoutId: string }) {
  const runtime = getFinancialEnvironment()
  const { data, error } = await input.supabase
    .from('payout_events')
    .select('id, event_type, provider_event_id, payload, created_at')
    .eq('organization_id', input.organizationId)
    .eq('provider', runtime.providerId)
    .eq('provider_environment', runtime.environment)
    .eq('payout_id', input.payoutId)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) throw new Error('Nao foi possivel carregar o historico do repasse interno.')
  return Array.isArray(data) ? data : []
}

async function loadAvailableBalanceCents(supabase: SupabaseLike, organizationId: string) {
  const runtime = getFinancialEnvironment()
  const { data, error } = await supabase
    .from('ledger_entries')
    .select('balance_after')
    .eq('organization_id', organizationId)
    .eq('provider', runtime.providerId)
    .eq('provider_environment', runtime.environment)
    .order('occurred_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error('Nao foi possivel carregar o saldo disponivel.')
  return Number((data as any)?.balance_after ?? 0)
}

async function loadReceiverForDraft(input: { supabase: SupabaseLike; organizationId: string; receiverId: string }) {
  const runtime = getFinancialEnvironment()
  const { data, error } = await input.supabase
    .from('receivers')
    .select('id, name, document, type, status, kyc_status, internal_status, bank_account')
    .eq('organization_id', input.organizationId)
    .eq('provider', runtime.providerId)
    .eq('provider_environment', runtime.environment)
    .eq('id', input.receiverId)
    .maybeSingle()

  if (error) throw new Error('Nao foi possivel localizar o recebedor selecionado.')
  return data
}

async function hasConflictingOpenPayout(input: {
  supabase: SupabaseLike
  organizationId: string
  receiverId: string
  payoutId?: string | null
}) {
  const runtime = getFinancialEnvironment()
  let query = input.supabase
    .from('payouts')
    .select('id, status')
    .eq('organization_id', input.organizationId)
    .eq('provider', runtime.providerId)
    .eq('provider_environment', runtime.environment)
    .eq('receiver_id', input.receiverId)
    .eq('is_internal', true)

  if (input.payoutId) query = query.neq('id', input.payoutId)

  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) throw new Error('Nao foi possivel validar conflitos de solicitacao.')

  return (Array.isArray(data) ? data : []).some((row) => INTERNAL_PAYOUT_OPEN_STATUSES.includes(String((row as any).status ?? '') as any))
}

function toDraftFromRow(row: any): PayoutInternalDraft {
  return normalizePayoutInternalDraft({
    id: row.id,
    receiverId: row.receiver_id,
    grossAmountCents: Number(row.gross_amount ?? 0),
    feeAmountCents: Number(row.fee_amount ?? 0),
    netAmountCents: Number(row.net_amount ?? 0),
    status: row.status ?? 'draft',
    scheduledFor: toDateOnly(row.scheduled_for),
    requestedAt: toDateOnly(row.requested_at ?? row.created_at),
    approvedAt: toDateOnly(row.approved_at),
    executedAt: toDateOnly(row.paid_at),
    rejectionReason: row.rejection_reason,
    internalNotes: row.internal_notes,
    bankAccountSnapshot: row.bank_account_snapshot,
  })
}

function eventTypeFromAction(action: string, status: string) {
  if (action === 'REQUEST') return 'payout.internal.requested'
  if (action === 'APPROVE') return 'payout.internal.approved'
  if (action === 'REJECT') return 'payout.internal.rejected'
  if (action === 'SCHEDULE') return 'payout.internal.scheduled'
  if (action === 'CANCEL') return 'payout.internal.cancelled'
  if (action === 'DELETE') return 'payout.internal.deleted'
  if (action === 'CREATE') return 'payout.internal.created'
  return `payout.internal.${status || 'updated'}`
}

async function insertInternalPayoutEvent(input: {
  supabase: SupabaseLike
  organizationId: string
  payoutId: string
  action: string
  status: string
}) {
  const runtime = getFinancialEnvironment()
  const { error } = await input.supabase.from('payout_events').insert({
    organization_id: input.organizationId,
    payout_id: input.payoutId,
    provider: runtime.providerId,
    provider_environment: runtime.environment,
    event_type: eventTypeFromAction(input.action, input.status),
    provider_event_id: null,
    payload: {
      internal: true,
      action: input.action,
      status: input.status,
    },
  })
  if (error) throw new Error('Nao foi possivel registrar o historico do repasse interno.')
}

function buildUpdatePatch(input: { before: any; draft: PayoutInternalDraft; providerEnabled: boolean; bankAccountSnapshot: Record<string, unknown> | null }) {
  const now = new Date().toISOString()
  return {
    receiver_id: input.draft.receiverId,
    gross_amount: input.draft.grossAmountCents,
    fee_amount: input.draft.feeAmountCents,
    net_amount: input.draft.netAmountCents,
    status: input.draft.status,
    scheduled_for: toStartOfDayIso(input.draft.scheduledFor),
    provider_reference: input.providerEnabled ? input.before.provider_reference ?? null : null,
    requested_at:
      input.draft.status === 'requested'
        ? input.before.requested_at ?? now
        : input.before.requested_at ?? (input.draft.requestedAt ? toStartOfDayIso(input.draft.requestedAt) : null),
    approved_at: input.draft.status === 'approved' ? input.before.approved_at ?? now : input.before.approved_at ?? null,
    paid_at: input.providerEnabled && input.draft.status === 'paid' ? input.before.paid_at ?? now : null,
    failed_at: input.providerEnabled && input.draft.status === 'failed' ? input.before.failed_at ?? now : null,
    canceled_at: input.draft.status === 'cancelled' ? input.before.canceled_at ?? now : input.before.canceled_at ?? null,
    rejected_at: input.draft.status === 'rejected' ? input.before.rejected_at ?? now : input.before.rejected_at ?? null,
    rejection_reason: input.draft.status === 'rejected' ? input.draft.rejectionReason : null,
    internal_notes: input.draft.internalNotes,
    bank_account_snapshot: input.bankAccountSnapshot,
  }
}

export async function getPayoutsInternalBootstrap(input: {
  supabase: SupabaseLike
  organizationId: string
  providerEnabled: boolean
}) {
  const [receiverRows, payoutRows, availableBalanceCents] = await Promise.all([
    loadEligibleReceiverRows(input.supabase, input.organizationId),
    loadInternalPayoutRows(input.supabase, input.organizationId),
    loadAvailableBalanceCents(input.supabase, input.organizationId),
  ])

  const receivers = receiverRows.map(mapEligibleReceiver)
  const receiverMap = new Map(receivers.map((item) => [item.id, item]))
  const payouts = payoutRows.map((row) => mapPayout(row, receiverMap))
  const summary = {
    total: payouts.length,
    requested: payouts.filter((item) => item.status === 'requested').length,
    underReview: payouts.filter((item) => item.status === 'under_review').length,
    approvedOrScheduled: payouts.filter((item) => item.status === 'approved' || item.status === 'scheduled').length,
    cancelledOrRejected: payouts.filter((item) => item.status === 'cancelled' || item.status === 'rejected').length,
  }

  return {
    availableBalanceCents,
    providerEnabled: Boolean(input.providerEnabled),
    eligibleReceivers: receivers,
    payouts,
    summary,
  }
}

export async function createPayoutInternal(input: {
  supabase: SupabaseLike
  organizationId: string
  actorProfileId: string
  rawDraft: unknown
  providerEnabled: boolean
}) {
  const draft = normalizePayoutInternalDraft(input.rawDraft)
  const [eligibleReceivers, availableBalanceCents, receiverRow, hasConflict] = await Promise.all([
    loadPayoutEligibleReceivers(input.supabase, input.organizationId),
    loadAvailableBalanceCents(input.supabase, input.organizationId),
    loadReceiverForDraft({ supabase: input.supabase, organizationId: input.organizationId, receiverId: draft.receiverId }),
    hasConflictingOpenPayout({ supabase: input.supabase, organizationId: input.organizationId, receiverId: draft.receiverId }),
  ])

  const bankAccountSnapshot = receiverRow?.bank_account ? sanitizeBankAccount(receiverRow.bank_account) : null
  const issues = getPayoutInternalIssues({
    draft: { ...draft, bankAccountSnapshot, requestedAt: draft.status === 'requested' ? new Date().toISOString().slice(0, 10) : draft.requestedAt },
    eligibleReceivers,
    availableBalanceCents,
    providerEnabled: input.providerEnabled,
    hasConflictingOpenRequest: hasConflict,
  })
  if (issues.length) throw new Error(issues[0]?.message ?? 'Nao foi possivel criar a solicitacao interna.')

  const now = new Date().toISOString()
  const runtime = getFinancialEnvironment()
  const insertPayload = {
    organization_id: input.organizationId,
    provider: runtime.providerId,
    provider_environment: runtime.environment,
    receiver_id: draft.receiverId,
    gross_amount: draft.grossAmountCents,
    fee_amount: draft.feeAmountCents,
    net_amount: draft.netAmountCents,
    status: draft.status,
    scheduled_for: toStartOfDayIso(draft.scheduledFor),
    provider_reference: null,
    provider_payload: { internal: true },
    requested_at: draft.status === 'requested' ? now : draft.requestedAt ? toStartOfDayIso(draft.requestedAt) : null,
    approved_at: draft.status === 'approved' ? now : null,
    paid_at: null,
    failed_at: null,
    canceled_at: draft.status === 'cancelled' ? now : null,
    rejected_at: draft.status === 'rejected' ? now : null,
    rejection_reason: draft.status === 'rejected' ? draft.rejectionReason : null,
    internal_notes: draft.internalNotes,
    bank_account_snapshot: bankAccountSnapshot,
    is_internal: true,
  }

  const { data, error } = await input.supabase
    .from('payouts')
    .insert(insertPayload)
    .select(
      'id, receiver_id, gross_amount, fee_amount, net_amount, status, scheduled_for, provider_reference, requested_at, approved_at, paid_at, failed_at, canceled_at, rejected_at, rejection_reason, internal_notes, bank_account_snapshot, is_internal, created_at, updated_at',
    )
    .single()

  if (error) throw new Error('Nao foi possivel criar a solicitacao de repasse interno.')

  const mappedReceiver = receiverRow ? mapEligibleReceiver(receiverRow) : eligibleReceivers.find((item) => item.id === draft.receiverId) ?? null
  const redacted = redactPayoutForAudit({
    ...data,
    receiver: mappedReceiver
      ? {
          name: mappedReceiver.name,
          document: mappedReceiver.document,
        }
      : null,
  })

  await insertInternalPayoutEvent({
    supabase: input.supabase,
    organizationId: input.organizationId,
    payoutId: String((data as any).id),
    action: 'CREATE',
    status: String((data as any).status ?? 'draft'),
  })
  await insertPayoutInternalAuditLog({
    supabase: input.supabase,
    organizationId: input.organizationId,
    actorProfileId: input.actorProfileId,
    action: 'CREATE',
    entityId: String((data as any).id),
    before: null,
    after: redacted,
  })

  const transitionAction = getPayoutAuditAction({ beforeStatus: null, afterStatus: draft.status })
  if (transitionAction !== 'CREATE') {
    await insertInternalPayoutEvent({
      supabase: input.supabase,
      organizationId: input.organizationId,
      payoutId: String((data as any).id),
      action: transitionAction,
      status: String((data as any).status ?? draft.status),
    })
    await insertPayoutInternalAuditLog({
      supabase: input.supabase,
      organizationId: input.organizationId,
      actorProfileId: input.actorProfileId,
      action: transitionAction,
      entityId: String((data as any).id),
      before: null,
      after: redacted,
    })
  }

  return mapPayout(data, new Map(mappedReceiver ? [[mappedReceiver.id, mappedReceiver]] : []))
}

export async function updatePayoutInternal(input: {
  supabase: SupabaseLike
  organizationId: string
  actorProfileId: string
  payoutId: string
  rawDraft: unknown
  providerEnabled: boolean
}) {
  const before = await getInternalPayoutRow({ supabase: input.supabase, organizationId: input.organizationId, payoutId: input.payoutId })
  const draft = normalizePayoutInternalDraft({ ...(typeof input.rawDraft === 'object' && input.rawDraft ? (input.rawDraft as Record<string, unknown>) : {}), id: input.payoutId })
  const [eligibleReceivers, availableBalanceCents, receiverRow, hasConflict] = await Promise.all([
    loadPayoutEligibleReceivers(input.supabase, input.organizationId),
    loadAvailableBalanceCents(input.supabase, input.organizationId),
    loadReceiverForDraft({ supabase: input.supabase, organizationId: input.organizationId, receiverId: draft.receiverId }),
    hasConflictingOpenPayout({ supabase: input.supabase, organizationId: input.organizationId, receiverId: draft.receiverId, payoutId: input.payoutId }),
  ])

  const bankAccountSnapshot = receiverRow?.bank_account ? sanitizeBankAccount(receiverRow.bank_account) : null
  const issues = getPayoutInternalIssues({
    draft: { ...draft, bankAccountSnapshot },
    eligibleReceivers,
    availableBalanceCents,
    providerEnabled: input.providerEnabled,
    hasConflictingOpenRequest: hasConflict,
    existingStatus: String(before.status ?? ''),
  })
  if (issues.length) throw new Error(issues[0]?.message ?? 'Nao foi possivel atualizar a solicitacao interna.')

  const patch = buildUpdatePatch({
    before,
    draft,
    providerEnabled: input.providerEnabled,
    bankAccountSnapshot,
  })
  const { data, error } = await input.supabase
    .from('payouts')
    .update(patch)
    .eq('organization_id', input.organizationId)
    .eq('id', input.payoutId)
    .eq('is_internal', true)
    .select(
      'id, receiver_id, gross_amount, fee_amount, net_amount, status, scheduled_for, provider_reference, requested_at, approved_at, paid_at, failed_at, canceled_at, rejected_at, rejection_reason, internal_notes, bank_account_snapshot, is_internal, created_at, updated_at',
    )
    .single()

  if (error) throw new Error('Nao foi possivel atualizar o repasse interno.')

  const mappedReceiver = receiverRow ? mapEligibleReceiver(receiverRow) : eligibleReceivers.find((item) => item.id === draft.receiverId) ?? null
  const beforeRedacted = redactPayoutForAudit({
    ...before,
    receiver: mappedReceiver ? { name: mappedReceiver.name, document: mappedReceiver.document } : null,
  })
  const afterRedacted = redactPayoutForAudit({
    ...data,
    receiver: mappedReceiver ? { name: mappedReceiver.name, document: mappedReceiver.document } : null,
  })

  const action = getPayoutAuditAction({ beforeStatus: String(before.status ?? ''), afterStatus: draft.status })
  await insertInternalPayoutEvent({
    supabase: input.supabase,
    organizationId: input.organizationId,
    payoutId: input.payoutId,
    action,
    status: String((data as any).status ?? draft.status),
  })
  await insertPayoutInternalAuditLog({
    supabase: input.supabase,
    organizationId: input.organizationId,
    actorProfileId: input.actorProfileId,
    action,
    entityId: input.payoutId,
    before: beforeRedacted,
    after: afterRedacted,
  })

  return mapPayout(data, new Map(mappedReceiver ? [[mappedReceiver.id, mappedReceiver]] : []))
}

export async function deletePayoutInternal(input: {
  supabase: SupabaseLike
  organizationId: string
  actorProfileId: string
  payoutId: string
}) {
  const before = await getInternalPayoutRow({ supabase: input.supabase, organizationId: input.organizationId, payoutId: input.payoutId })
  if (!['draft', 'rejected', 'cancelled'].includes(String(before.status ?? ''))) {
    throw new Error('Somente solicitacoes em rascunho, reprovadas ou canceladas podem ser excluidas.')
  }

  const receiver = await loadReceiverForDraft({ supabase: input.supabase, organizationId: input.organizationId, receiverId: String(before.receiver_id) })
  const beforeRedacted = redactPayoutForAudit({
    ...before,
    receiver: receiver ? { name: receiver.name, document: receiver.document } : null,
  })

  const { error } = await input.supabase.from('payouts').delete().eq('organization_id', input.organizationId).eq('id', input.payoutId).eq('is_internal', true)
  if (error) throw new Error('Nao foi possivel excluir o repasse interno.')

  await insertPayoutInternalAuditLog({
    supabase: input.supabase,
    organizationId: input.organizationId,
    actorProfileId: input.actorProfileId,
    action: 'DELETE',
    entityId: input.payoutId,
    before: beforeRedacted,
    after: null,
  })

  return { ok: true as const }
}

export async function getPayoutInternalDetail(input: {
  supabase: SupabaseLike
  organizationId: string
  payoutId: string
}) {
  const [receiverRows, payoutRow, eventRows] = await Promise.all([
    loadEligibleReceiverRows(input.supabase, input.organizationId),
    getInternalPayoutRow({ supabase: input.supabase, organizationId: input.organizationId, payoutId: input.payoutId }),
    loadPayoutEventRows({ supabase: input.supabase, organizationId: input.organizationId, payoutId: input.payoutId }),
  ])

  const receiverMap = new Map(receiverRows.map((row) => {
    const mapped = mapEligibleReceiver(row)
    return [mapped.id, mapped] as const
  }))
  return {
    payout: mapPayout(payoutRow, receiverMap),
    events: eventRows.map((row) => ({
      id: String(row.id),
      eventType: String(row.event_type ?? ''),
      providerEventId: row.provider_event_id ? String(row.provider_event_id) : null,
      createdAt: String(row.created_at ?? ''),
    })),
  }
}

export async function simulatePayoutInternalDraft(input: {
  supabase: SupabaseLike
  organizationId: string
  rawDraft: unknown
  providerEnabled: boolean
}) {
  const draft = normalizePayoutInternalDraft(input.rawDraft)
  const [eligibleReceivers, availableBalanceCents, receiverRow] = await Promise.all([
    loadPayoutEligibleReceivers(input.supabase, input.organizationId),
    loadAvailableBalanceCents(input.supabase, input.organizationId),
    loadReceiverForDraft({ supabase: input.supabase, organizationId: input.organizationId, receiverId: draft.receiverId }),
  ])

  const simulation = simulateInternalPayout({
    grossAmountCents: draft.grossAmountCents,
    feeBps: draft.feeBps,
    availableBalanceCents,
  })

  const issues = getPayoutInternalIssues({
    draft: {
      ...draft,
      feeAmountCents: simulation.feeAmountCents,
      netAmountCents: simulation.netAmountCents,
      bankAccountSnapshot: receiverRow?.bank_account ? sanitizeBankAccount(receiverRow.bank_account) : null,
    },
    eligibleReceivers,
    availableBalanceCents,
    providerEnabled: input.providerEnabled,
  })

  return {
    ok: issues.length === 0,
    issues,
    simulation,
  }
}

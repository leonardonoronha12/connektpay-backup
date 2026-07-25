import {
  getAnticipationAuditAction,
  getAnticipationInternalIssues,
  mapAnticipationStatus,
  normalizeAnticipationInternalDraft,
  simulateAnticipationInternal,
  type AnticipationEligibleReceiver,
  type AnticipationInternalDraft,
  type AnticipationStatus,
} from '@/lib/anticipation-core'
import { maskDocument, redactBankAccount, sanitizeBankAccount } from '@/lib/receiver-kyc'

type SupabaseLike = any

const INTERNAL_ANTICIPATION_OPEN_STATUSES = ['requested', 'under_review', 'approved', 'scheduled', 'provider_pending', 'provider_processing'] as const
const RESERVED_ANTICIPATION_STATUSES = ['pending', 'approved', 'processing', 'requested', 'under_review', 'scheduled', 'provider_pending', 'provider_processing'] as const

export class AnticipationInternalError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = 'AnticipationInternalError'
    this.status = status
  }
}

function fail(message: string, status = 400): never {
  throw new AnticipationInternalError(message, status)
}

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

function toDateOnly(value: unknown) {
  if (typeof value !== 'string' || !value) return null
  return value.slice(0, 10)
}

function toStartOfDayIso(dateOnly: string | null) {
  if (!dateOnly) return null
  return `${dateOnly}T00:00:00.000Z`
}

function addDaysIso(days: number) {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + Math.max(1, Math.round(days)))
  date.setUTCHours(0, 0, 0, 0)
  return date.toISOString()
}

function mapEligibleReceiver(row: any): AnticipationEligibleReceiver {
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

function mapAnticipation(row: any, receiverMap: Map<string, AnticipationEligibleReceiver>) {
  const receiverId = row.recebedor_id ? String(row.recebedor_id) : ''
  const receiver = receiverMap.get(receiverId) ?? null
  return {
    id: String(row.id),
    receiverId,
    requestedAmountCents: Number(row.requested_amount_centavos ?? 0),
    eligibleAmountCents: Number(row.eligible_amount_centavos ?? row.available_amount_centavos ?? 0),
    estimatedFeeBps: Number(row.estimated_fee_bps ?? row.fee_bps ?? 0),
    effectiveFeeBps: Number(row.fee_bps ?? 0),
    estimatedFeeCents: Number(row.estimated_fee_centavos ?? row.fee_centavos ?? 0),
    effectiveFeeCents: Number(row.fee_centavos ?? 0),
    netAmountCents: Number(row.net_amount_centavos ?? 0),
    expectedSettlementDays: Number(row.expected_settlement_days ?? 0),
    expectedSettlementDate: toDateOnly(row.expected_settlement_at),
    status: String(row.status ?? 'draft'),
    requestedAt: toDateOnly(row.requested_at ?? row.created_at),
    approvedAt: toDateOnly(row.approved_at),
    paidAt: toDateOnly(row.paid_at ?? row.executed_at),
    rejectedAt: toDateOnly(row.rejected_at),
    cancelledAt: toDateOnly(row.canceled_at),
    rejectionReason: typeof row.rejection_reason === 'string' ? row.rejection_reason : null,
    internalNotes: typeof row.internal_notes === 'string' ? row.internal_notes : null,
    providerReference: typeof row.provider_reference === 'string' ? row.provider_reference : null,
    providerStatus: typeof row.provider_status === 'string' ? row.provider_status : null,
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

function redactAnticipationForAudit(row: any, receiver: AnticipationEligibleReceiver | null) {
  return {
    id: String(row.id ?? ''),
    receiver_id: String(row.recebedor_id ?? ''),
    receiver_name: receiver?.name ?? null,
    receiver_document_masked: receiver?.document ? maskDocument(receiver.document) : null,
    requested_amount_centavos: Number(row.requested_amount_centavos ?? 0),
    eligible_amount_centavos: Number(row.eligible_amount_centavos ?? row.available_amount_centavos ?? 0),
    estimated_fee_bps: Number(row.estimated_fee_bps ?? row.fee_bps ?? 0),
    effective_fee_bps: Number(row.fee_bps ?? 0),
    estimated_fee_centavos: Number(row.estimated_fee_centavos ?? row.fee_centavos ?? 0),
    effective_fee_centavos: Number(row.fee_centavos ?? 0),
    net_amount_centavos: Number(row.net_amount_centavos ?? 0),
    expected_settlement_days: Number(row.expected_settlement_days ?? 0),
    expected_settlement_at: row.expected_settlement_at ? String(row.expected_settlement_at) : null,
    status: String(row.status ?? 'draft'),
    requested_at: row.requested_at ? String(row.requested_at) : null,
    approved_at: row.approved_at ? String(row.approved_at) : null,
    paid_at: row.paid_at ? String(row.paid_at) : null,
    rejected_at: row.rejected_at ? String(row.rejected_at) : null,
    canceled_at: row.canceled_at ? String(row.canceled_at) : null,
    rejection_reason: typeof row.rejection_reason === 'string' ? row.rejection_reason : null,
    internal_notes: typeof row.internal_notes === 'string' ? row.internal_notes : null,
    provider_reference: typeof row.provider_reference === 'string' ? row.provider_reference : null,
    is_internal: Boolean(row.is_internal),
  }
}

async function insertAnticipationInternalAuditLog(input: {
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
    entity: 'anticipation_internal',
    entity_id: input.entityId ?? null,
    before: (input.before ?? null) as any,
    after: (input.after ?? null) as any,
  })
  if (error) fail('Nao foi possivel registrar a auditoria desta operacao.', 500)
}

function eventTypeFromAction(action: string, status: string) {
  if (action === 'REQUEST') return 'anticipation.internal.requested'
  if (action === 'APPROVE') return 'anticipation.internal.approved'
  if (action === 'REJECT') return 'anticipation.internal.rejected'
  if (action === 'CANCEL') return 'anticipation.internal.cancelled'
  if (action === 'DELETE') return 'anticipation.internal.deleted'
  if (action === 'CREATE') return 'anticipation.internal.created'
  return `anticipation.internal.${status || 'updated'}`
}

async function insertInternalAnticipationEvent(input: {
  supabase: SupabaseLike
  organizationId: string
  anticipationId: string
  action: string
  status: string
  payload?: Record<string, unknown>
}) {
  const { error } = await input.supabase.from('pay_antecipacao_events').insert({
    organization_id: input.organizationId,
    antecipacao_id: input.anticipationId,
    event_type: eventTypeFromAction(input.action, input.status),
    provider_event_id: null,
    payload: {
      internal: true,
      action: input.action,
      status: input.status,
      ...(input.payload ?? {}),
    },
  })
  if (error) fail('Nao foi possivel registrar o historico da antecipacao interna.', 500)
}

async function loadEligibleReceiverRows(supabase: SupabaseLike, organizationId: string) {
  const { data, error } = await supabase
    .from('receivers')
    .select('id, name, document, type, status, kyc_status, internal_status, bank_account')
    .eq('organization_id', organizationId)
    .eq('status', 'active')
    .eq('kyc_status', 'approved')
    .neq('internal_status', 'blocked')
    .order('created_at', { ascending: false })

  if (error) fail('Nao foi possivel carregar os recebedores elegiveis para antecipacao.', 500)
  return Array.isArray(data) ? data : []
}

async function loadInternalAnticipationRows(supabase: SupabaseLike, organizationId: string) {
  const { data, error } = await supabase
    .from('pay_antecipacao')
    .select(
      'id, recebedor_id, requested_amount_centavos, available_amount_centavos, eligible_amount_centavos, estimated_fee_bps, estimated_fee_centavos, net_amount_centavos, fee_centavos, fee_bps, expected_settlement_days, expected_settlement_at, status, provider_reference, provider_status, requested_at, approved_at, paid_at, rejected_at, canceled_at, rejection_reason, internal_notes, is_internal, created_at, updated_at',
    )
    .eq('organization_id', organizationId)
    .eq('is_internal', true)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    if (isMissingDbObjectError(error)) return []
    fail('Nao foi possivel carregar as antecipacoes internas.', 500)
  }
  return Array.isArray(data) ? data : []
}

async function getInternalAnticipationRow(input: { supabase: SupabaseLike; organizationId: string; id: string }) {
  const { data, error } = await input.supabase
    .from('pay_antecipacao')
    .select(
      'id, recebedor_id, requested_amount_centavos, available_amount_centavos, eligible_amount_centavos, estimated_fee_bps, estimated_fee_centavos, net_amount_centavos, fee_centavos, fee_bps, expected_settlement_days, expected_settlement_at, status, provider_reference, provider_status, requested_at, approved_at, paid_at, rejected_at, canceled_at, rejection_reason, internal_notes, provider_payload, is_internal, created_at, updated_at',
    )
    .eq('organization_id', input.organizationId)
    .eq('id', input.id)
    .eq('is_internal', true)
    .maybeSingle()

  if (error) fail('Nao foi possivel localizar a antecipacao interna.', 500)
  if (!data) fail('Antecipacao interna nao encontrada.', 404)
  return data
}

async function loadAnticipationEvents(input: { supabase: SupabaseLike; organizationId: string; id: string }) {
  const { data, error } = await input.supabase
    .from('pay_antecipacao_events')
    .select('id, event_type, provider_event_id, payload, created_at')
    .eq('organization_id', input.organizationId)
    .eq('antecipacao_id', input.id)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) fail('Nao foi possivel carregar o historico da antecipacao interna.', 500)
  return Array.isArray(data) ? data : []
}

async function loadReceiverForDraft(input: { supabase: SupabaseLike; organizationId: string; receiverId: string }) {
  const { data, error } = await input.supabase
    .from('receivers')
    .select('id, name, document, type, status, kyc_status, internal_status, bank_account')
    .eq('organization_id', input.organizationId)
    .eq('id', input.receiverId)
    .maybeSingle()

  if (error) fail('Nao foi possivel localizar o recebedor selecionado.', 500)
  return data
}

async function hasConflictingOpenAnticipation(input: {
  supabase: SupabaseLike
  organizationId: string
  receiverId: string
  anticipationId?: string | null
}) {
  let query = input.supabase
    .from('pay_antecipacao')
    .select('id, status')
    .eq('organization_id', input.organizationId)
    .eq('recebedor_id', input.receiverId)
    .eq('is_internal', true)

  if (input.anticipationId) query = query.neq('id', input.anticipationId)
  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) fail('Nao foi possivel validar conflitos da solicitacao.', 500)
  return (Array.isArray(data) ? data : []).some((row) => INTERNAL_ANTICIPATION_OPEN_STATUSES.includes(String((row as any).status ?? '') as any))
}

function toDraftFromRow(row: any): AnticipationInternalDraft {
  return normalizeAnticipationInternalDraft({
    id: row.id,
    receiverId: row.recebedor_id,
    requestedAmountCents: row.requested_amount_centavos,
    eligibleAmountCents: row.eligible_amount_centavos ?? row.available_amount_centavos,
    estimatedFeeBps: row.estimated_fee_bps ?? row.fee_bps,
    effectiveFeeBps: row.fee_bps,
    estimatedFeeCents: row.estimated_fee_centavos ?? row.fee_centavos,
    effectiveFeeCents: row.fee_centavos,
    netAmountCents: row.net_amount_centavos,
    expectedSettlementDays: row.expected_settlement_days,
    expectedSettlementDate: toDateOnly(row.expected_settlement_at),
    status: row.status,
    requestedAt: toDateOnly(row.requested_at),
    approvedAt: toDateOnly(row.approved_at),
    paidAt: toDateOnly(row.paid_at),
    rejectedAt: toDateOnly(row.rejected_at),
    rejectionReason: row.rejection_reason,
    internalNotes: row.internal_notes,
  })
}

function buildSummary(anticipations: Array<{ status: string }>) {
  return {
    total: anticipations.length,
    requested: anticipations.filter((item) => item.status === 'requested').length,
    underReview: anticipations.filter((item) => item.status === 'under_review').length,
    approvedOrScheduled: anticipations.filter((item) => item.status === 'approved' || item.status === 'scheduled').length,
    cancelledOrRejected: anticipations.filter((item) => item.status === 'cancelled' || item.status === 'rejected').length,
  }
}

function expectedSettlementIso(draft: AnticipationInternalDraft) {
  if (draft.expectedSettlementDate) return toStartOfDayIso(draft.expectedSettlementDate)
  return addDaysIso(draft.expectedSettlementDays)
}

function buildMutationPatch(input: {
  before: any
  draft: AnticipationInternalDraft
  available: { balanceCents: number; reservedCents: number; availableCents: number }
  providerEnabled: boolean
  eligibilitySnapshot: Record<string, unknown>
}) {
  const simulation = simulateAnticipationInternal({
    requestedAmountCents: input.draft.requestedAmountCents,
    availableAmountCents: input.available.availableCents,
    feeBps: input.draft.estimatedFeeBps,
    settlementDays: input.draft.expectedSettlementDays,
  })
  const now = new Date().toISOString()

  return {
    recebedor_id: input.draft.receiverId,
    requested_amount_centavos: simulation.requestedAmountCents,
    available_amount_centavos: simulation.eligibleAmountCents,
    eligible_amount_centavos: simulation.eligibleAmountCents,
    estimated_fee_bps: simulation.estimatedFeeBps,
    estimated_fee_centavos: simulation.estimatedFeeCents,
    fee_bps: simulation.effectiveFeeBps,
    fee_centavos: simulation.effectiveFeeCents,
    net_amount_centavos: simulation.netAmountCents,
    expected_settlement_days: simulation.settlementDays,
    expected_settlement_at:
      input.draft.status === 'scheduled' || input.draft.status === 'approved' || input.draft.status === 'requested'
        ? expectedSettlementIso(input.draft)
        : input.before.expected_settlement_at ?? expectedSettlementIso(input.draft),
    status: input.draft.status,
    provider_reference: input.providerEnabled ? input.before.provider_reference ?? null : null,
    provider_status: input.providerEnabled ? input.before.provider_status ?? null : null,
    requested_at:
      input.draft.status === 'requested'
        ? input.before.requested_at ?? now
        : input.before.requested_at ?? (input.draft.requestedAt ? toStartOfDayIso(input.draft.requestedAt) : null),
    approved_at: input.draft.status === 'approved' ? input.before.approved_at ?? now : input.before.approved_at ?? null,
    paid_at: input.providerEnabled && input.draft.status === 'paid' ? input.before.paid_at ?? now : null,
    rejected_at: input.draft.status === 'rejected' ? input.before.rejected_at ?? now : input.before.rejected_at ?? null,
    canceled_at: input.draft.status === 'cancelled' ? input.before.canceled_at ?? now : input.before.canceled_at ?? null,
    rejection_reason: input.draft.status === 'rejected' ? input.draft.rejectionReason : null,
    internal_notes: input.draft.internalNotes,
    provider_payload: { internal: true, eligibility: input.eligibilitySnapshot },
    eligibility_snapshot: input.eligibilitySnapshot,
  }
}

function ensureMutableStatus(status: string) {
  if (['rejected', 'paid', 'failed', 'cancelled'].includes(status)) {
    fail('Nao e permitido alterar a solicitacao apos estado final.', 400)
  }
}

export async function getAvailableAnticipationAmount(input: { supabase: SupabaseLike; organizationId: string }) {
  const { data: last, error: ledgerError } = await input.supabase
    .from('ledger_entries')
    .select('balance_after')
    .eq('organization_id', input.organizationId)
    .order('occurred_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (ledgerError) fail('Nao foi possivel carregar o saldo elegivel.', 500)
  const balance = Number((last as any)?.balance_after ?? 0)

  const { data: reservedRows, error: reservedError } = await input.supabase
    .from('pay_antecipacao')
    .select('requested_amount_centavos, status')
    .eq('organization_id', input.organizationId)
    .in('status', [...RESERVED_ANTICIPATION_STATUSES])

  if (reservedError && !isMissingDbObjectError(reservedError)) fail('Nao foi possivel calcular o saldo elegivel.', 500)
  const reserved = (Array.isArray(reservedRows) ? reservedRows : []).reduce((acc, row: any) => acc + Number(row.requested_amount_centavos ?? 0), 0)
  return {
    balanceCents: Math.round(balance),
    reservedCents: Math.round(reserved),
    availableCents: Math.max(0, Math.round(balance) - Math.round(reserved)),
  }
}

export async function simulateAnticipation(input: {
  supabase: SupabaseLike
  organizationId: string
  requestedAmountCents: number
  feeBps?: number
  receiverId?: string | null
}) {
  const available = await getAvailableAnticipationAmount({ supabase: input.supabase, organizationId: input.organizationId })
  const eligibleReceivers = (await loadEligibleReceiverRows(input.supabase, input.organizationId)).map(mapEligibleReceiver)
  const simulation = simulateAnticipationInternal({
    requestedAmountCents: input.requestedAmountCents,
    availableAmountCents: available.availableCents,
    feeBps: typeof input.feeBps === 'number' && Number.isFinite(input.feeBps) ? Math.round(input.feeBps) : 400,
  })
  const draft = normalizeAnticipationInternalDraft({
    receiverId: input.receiverId ?? eligibleReceivers[0]?.id ?? '',
    requestedAmountCents: simulation.requestedAmountCents,
    eligibleAmountCents: simulation.eligibleAmountCents,
    estimatedFeeBps: simulation.estimatedFeeBps,
    effectiveFeeBps: simulation.effectiveFeeBps,
    estimatedFeeCents: simulation.estimatedFeeCents,
    effectiveFeeCents: simulation.effectiveFeeCents,
    netAmountCents: simulation.netAmountCents,
    expectedSettlementDays: simulation.settlementDays,
    status: 'requested',
  })
  const issues = getAnticipationInternalIssues({
    draft,
    eligibleReceivers,
    availableAmountCents: available.availableCents,
    providerEnabled: false,
  })

  return {
    ...simulation,
    balanceCents: available.balanceCents,
    reservedCents: available.reservedCents,
    availableAmountCents: available.availableCents,
    eligibleReceivers,
    issues,
    ok: issues.length === 0,
  }
}

export async function listAnticipations(input: { supabase: SupabaseLike; organizationId: string }) {
  const [receiverRows, anticipationRows] = await Promise.all([
    loadEligibleReceiverRows(input.supabase, input.organizationId),
    loadInternalAnticipationRows(input.supabase, input.organizationId),
  ])

  const receivers = receiverRows.map(mapEligibleReceiver)
  const receiverMap = new Map(receivers.map((item) => [item.id, item]))
  const anticipations = anticipationRows.map((row) => mapAnticipation(row, receiverMap))
  return { anticipations, summary: buildSummary(anticipations) }
}

export async function getAnticipationBootstrap(input: {
  supabase: SupabaseLike
  organizationId: string
  providerEnabled: boolean
}) {
  const [available, receiverRows, anticipationRows] = await Promise.all([
    getAvailableAnticipationAmount({ supabase: input.supabase, organizationId: input.organizationId }),
    loadEligibleReceiverRows(input.supabase, input.organizationId),
    loadInternalAnticipationRows(input.supabase, input.organizationId),
  ])

  const eligibleReceivers = receiverRows.map(mapEligibleReceiver)
  const receiverMap = new Map(eligibleReceivers.map((item) => [item.id, item]))
  const anticipations = anticipationRows.map((row) => mapAnticipation(row, receiverMap))
  return {
    anticipations,
    eligibleReceivers,
    availableCents: available.availableCents,
    balanceCents: available.balanceCents,
    reservedCents: available.reservedCents,
    providerEnabled: Boolean(input.providerEnabled),
    summary: buildSummary(anticipations),
  }
}

export async function getAnticipation(input: { supabase: SupabaseLike; organizationId: string; id: string }) {
  const [receiverRows, anticipationRow, events] = await Promise.all([
    loadEligibleReceiverRows(input.supabase, input.organizationId),
    getInternalAnticipationRow({ supabase: input.supabase, organizationId: input.organizationId, id: input.id }),
    loadAnticipationEvents({ supabase: input.supabase, organizationId: input.organizationId, id: input.id }),
  ])

  const receivers = receiverRows.map(mapEligibleReceiver)
  const receiverMap = new Map(receivers.map((item) => [item.id, item]))
  return {
    anticipation: mapAnticipation(anticipationRow, receiverMap),
    events: events.map((event) => ({
      id: String(event.id),
      eventType: String(event.event_type ?? ''),
      providerEventId: event.provider_event_id ? String(event.provider_event_id) : null,
      createdAt: String(event.created_at ?? ''),
    })),
  }
}

export async function requestAnticipation(input: {
  supabase: SupabaseLike
  organizationId: string
  actorProfileId: string
  recebedorId: string | null
  requestedAmountCents: number
  feeBps?: number
  status?: 'draft' | 'requested'
  internalNotes?: string | null
}) {
  const receiverId = input.recebedorId ? String(input.recebedorId) : ''
  const [available, eligibleReceivers, receiverRow, hasConflict] = await Promise.all([
    getAvailableAnticipationAmount({ supabase: input.supabase, organizationId: input.organizationId }),
    loadEligibleReceiverRows(input.supabase, input.organizationId).then((rows) => rows.map(mapEligibleReceiver)),
    loadReceiverForDraft({ supabase: input.supabase, organizationId: input.organizationId, receiverId }),
    hasConflictingOpenAnticipation({ supabase: input.supabase, organizationId: input.organizationId, receiverId }),
  ])

  const simulation = simulateAnticipationInternal({
    requestedAmountCents: input.requestedAmountCents,
    availableAmountCents: available.availableCents,
    feeBps: input.feeBps,
  })
  const draft = normalizeAnticipationInternalDraft({
    receiverId,
    requestedAmountCents: simulation.requestedAmountCents,
    eligibleAmountCents: simulation.eligibleAmountCents,
    estimatedFeeBps: simulation.estimatedFeeBps,
    effectiveFeeBps: simulation.effectiveFeeBps,
    estimatedFeeCents: simulation.estimatedFeeCents,
    effectiveFeeCents: simulation.effectiveFeeCents,
    netAmountCents: simulation.netAmountCents,
    expectedSettlementDays: simulation.settlementDays,
    status: input.status ?? 'requested',
    internalNotes: input.internalNotes,
  })
  const issues = getAnticipationInternalIssues({
    draft,
    eligibleReceivers,
    availableAmountCents: available.availableCents,
    providerEnabled: false,
    hasConflictingOpenRequest: hasConflict,
  })
  if (issues.length) fail(issues[0]?.message ?? 'Nao foi possivel criar a solicitacao interna.', 400)

  const eligibilitySnapshot = {
    balance_cents: available.balanceCents,
    reserved_cents: available.reservedCents,
    available_cents: available.availableCents,
    receiver_id: receiverId,
    receiver_status: receiverRow?.status ?? null,
    receiver_kyc_status: receiverRow?.kyc_status ?? null,
    receiver_internal_status: receiverRow?.internal_status ?? null,
  }
  const now = new Date().toISOString()
  const insertPayload = {
    organization_id: input.organizationId,
    recebedor_id: receiverId,
    requested_amount_centavos: simulation.requestedAmountCents,
    available_amount_centavos: simulation.eligibleAmountCents,
    eligible_amount_centavos: simulation.eligibleAmountCents,
    estimated_fee_bps: simulation.estimatedFeeBps,
    estimated_fee_centavos: simulation.estimatedFeeCents,
    fee_bps: simulation.effectiveFeeBps,
    fee_centavos: simulation.effectiveFeeCents,
    net_amount_centavos: simulation.netAmountCents,
    expected_settlement_days: simulation.settlementDays,
    expected_settlement_at: expectedSettlementIso(draft),
    status: draft.status,
    acquirer_anticipation_id: null,
    provider_reference: null,
    provider_payload: { internal: true, eligibility: eligibilitySnapshot },
    provider_status: null,
    provider_last_error: null,
    requested_at: draft.status === 'requested' ? now : null,
    approved_at: draft.status === 'approved' ? now : null,
    paid_at: null,
    rejected_at: draft.status === 'rejected' ? now : null,
    canceled_at: draft.status === 'cancelled' ? now : null,
    rejection_reason: draft.status === 'rejected' ? draft.rejectionReason : null,
    internal_notes: draft.internalNotes,
    eligibility_snapshot: eligibilitySnapshot,
    is_internal: true,
  }

  const { data, error } = await input.supabase
    .from('pay_antecipacao')
    .insert(insertPayload)
    .select(
      'id, recebedor_id, requested_amount_centavos, available_amount_centavos, eligible_amount_centavos, estimated_fee_bps, estimated_fee_centavos, net_amount_centavos, fee_centavos, fee_bps, expected_settlement_days, expected_settlement_at, status, provider_reference, provider_status, requested_at, approved_at, paid_at, rejected_at, canceled_at, rejection_reason, internal_notes, is_internal, created_at, updated_at',
    )
    .single()

  if (error) fail('Nao foi possivel criar a solicitacao de antecipacao interna.', 500)

  const mappedReceiver = receiverRow ? mapEligibleReceiver(receiverRow) : eligibleReceivers.find((item) => item.id === receiverId) ?? null
  const after = redactAnticipationForAudit(data, mappedReceiver)

  await insertInternalAnticipationEvent({
    supabase: input.supabase,
    organizationId: input.organizationId,
    anticipationId: String((data as any).id),
    action: 'CREATE',
    status: String((data as any).status ?? draft.status),
  })
  await insertAnticipationInternalAuditLog({
    supabase: input.supabase,
    organizationId: input.organizationId,
    actorProfileId: input.actorProfileId,
    action: 'CREATE',
    entityId: String((data as any).id),
    before: null,
    after,
  })

  const transitionAction = getAnticipationAuditAction({ beforeStatus: null, afterStatus: draft.status })
  if (transitionAction !== 'CREATE') {
    await insertInternalAnticipationEvent({
      supabase: input.supabase,
      organizationId: input.organizationId,
      anticipationId: String((data as any).id),
      action: transitionAction,
      status: String((data as any).status ?? draft.status),
    })
    await insertAnticipationInternalAuditLog({
      supabase: input.supabase,
      organizationId: input.organizationId,
      actorProfileId: input.actorProfileId,
      action: transitionAction,
      entityId: String((data as any).id),
      before: null,
      after,
    })
  }

  return { anticipation: mapAnticipation(data, new Map(mappedReceiver ? [[mappedReceiver.id, mappedReceiver]] : [])) }
}

async function mutateAnticipationStatus(input: {
  supabase: SupabaseLike
  organizationId: string
  actorProfileId: string
  id: string
  nextStatus: AnticipationStatus
  rejectionReason?: string | null
  expectedSettlementDate?: string | null
  internalNotes?: string | null
  providerEnabled?: boolean
}) {
  const before = await getInternalAnticipationRow({ supabase: input.supabase, organizationId: input.organizationId, id: input.id })
  ensureMutableStatus(String(before.status ?? ''))

  const receiverId = String(before.recebedor_id ?? '')
  const [available, eligibleReceivers, receiverRow, hasConflict] = await Promise.all([
    getAvailableAnticipationAmount({ supabase: input.supabase, organizationId: input.organizationId }),
    loadEligibleReceiverRows(input.supabase, input.organizationId).then((rows) => rows.map(mapEligibleReceiver)),
    loadReceiverForDraft({ supabase: input.supabase, organizationId: input.organizationId, receiverId }),
    hasConflictingOpenAnticipation({ supabase: input.supabase, organizationId: input.organizationId, receiverId, anticipationId: input.id }),
  ])

  const draft = normalizeAnticipationInternalDraft({
    ...toDraftFromRow(before),
    status: input.nextStatus,
    rejectionReason: input.rejectionReason ?? null,
    expectedSettlementDate: input.expectedSettlementDate ?? toDateOnly(before.expected_settlement_at),
    internalNotes: input.internalNotes ?? before.internal_notes ?? null,
  })
  const issues = getAnticipationInternalIssues({
    draft,
    eligibleReceivers,
    availableAmountCents: available.availableCents,
    providerEnabled: Boolean(input.providerEnabled),
    hasConflictingOpenRequest: hasConflict,
    existingStatus: String(before.status ?? ''),
  })
  if (issues.length) fail(issues[0]?.message ?? 'Nao foi possivel atualizar a solicitacao.', 400)

  const eligibilitySnapshot = {
    balance_cents: available.balanceCents,
    reserved_cents: available.reservedCents,
    available_cents: available.availableCents,
    receiver_id: receiverId,
    receiver_status: receiverRow?.status ?? null,
    receiver_kyc_status: receiverRow?.kyc_status ?? null,
    receiver_internal_status: receiverRow?.internal_status ?? null,
  }
  const patch = buildMutationPatch({
    before,
    draft,
    available,
    providerEnabled: Boolean(input.providerEnabled),
    eligibilitySnapshot,
  })

  const { data, error } = await input.supabase
    .from('pay_antecipacao')
    .update(patch)
    .eq('organization_id', input.organizationId)
    .eq('id', input.id)
    .eq('is_internal', true)
    .select(
      'id, recebedor_id, requested_amount_centavos, available_amount_centavos, eligible_amount_centavos, estimated_fee_bps, estimated_fee_centavos, net_amount_centavos, fee_centavos, fee_bps, expected_settlement_days, expected_settlement_at, status, provider_reference, provider_status, requested_at, approved_at, paid_at, rejected_at, canceled_at, rejection_reason, internal_notes, is_internal, created_at, updated_at',
    )
    .single()

  if (error) fail('Nao foi possivel atualizar a antecipacao interna.', 500)

  const mappedReceiver = receiverRow ? mapEligibleReceiver(receiverRow) : eligibleReceivers.find((item) => item.id === receiverId) ?? null
  const beforeRedacted = redactAnticipationForAudit(before, mappedReceiver)
  const afterRedacted = redactAnticipationForAudit(data, mappedReceiver)
  const action = getAnticipationAuditAction({ beforeStatus: String(before.status ?? ''), afterStatus: draft.status })

  await insertInternalAnticipationEvent({
    supabase: input.supabase,
    organizationId: input.organizationId,
    anticipationId: input.id,
    action,
    status: String((data as any).status ?? draft.status),
  })
  await insertAnticipationInternalAuditLog({
    supabase: input.supabase,
    organizationId: input.organizationId,
    actorProfileId: input.actorProfileId,
    action,
    entityId: input.id,
    before: beforeRedacted,
    after: afterRedacted,
  })

  return { anticipation: mapAnticipation(data, new Map(mappedReceiver ? [[mappedReceiver.id, mappedReceiver]] : [])) }
}

export async function reviewAnticipation(input: {
  supabase: SupabaseLike
  organizationId: string
  actorProfileId: string
  id: string
  internalNotes?: string | null
}) {
  return mutateAnticipationStatus({
    supabase: input.supabase,
    organizationId: input.organizationId,
    actorProfileId: input.actorProfileId,
    id: input.id,
    nextStatus: 'under_review',
    internalNotes: input.internalNotes,
  })
}

export async function approveAnticipation(input: {
  supabase: SupabaseLike
  organizationId: string
  actorProfileId: string
  id: string
  internalNotes?: string | null
}) {
  return mutateAnticipationStatus({
    supabase: input.supabase,
    organizationId: input.organizationId,
    actorProfileId: input.actorProfileId,
    id: input.id,
    nextStatus: 'approved',
    internalNotes: input.internalNotes,
  })
}

export async function rejectAnticipation(input: {
  supabase: SupabaseLike
  organizationId: string
  actorProfileId: string
  id: string
  rejectionReason: string
  internalNotes?: string | null
}) {
  return mutateAnticipationStatus({
    supabase: input.supabase,
    organizationId: input.organizationId,
    actorProfileId: input.actorProfileId,
    id: input.id,
    nextStatus: 'rejected',
    rejectionReason: input.rejectionReason,
    internalNotes: input.internalNotes,
  })
}

export async function scheduleAnticipation(input: {
  supabase: SupabaseLike
  organizationId: string
  actorProfileId: string
  id: string
  expectedSettlementDate: string
  internalNotes?: string | null
}) {
  return mutateAnticipationStatus({
    supabase: input.supabase,
    organizationId: input.organizationId,
    actorProfileId: input.actorProfileId,
    id: input.id,
    nextStatus: 'scheduled',
    expectedSettlementDate: input.expectedSettlementDate,
    internalNotes: input.internalNotes,
  })
}

export async function cancelAnticipation(input: { supabase: SupabaseLike; organizationId: string; actorProfileId: string; id: string }) {
  const before = await getInternalAnticipationRow({ supabase: input.supabase, organizationId: input.organizationId, id: input.id })
  if (String(before.status ?? '') === 'cancelled') {
    const rows = await loadEligibleReceiverRows(input.supabase, input.organizationId)
    const mapped = rows.map(mapEligibleReceiver)
    const receiverMap = new Map(mapped.map((item) => [item.id, item]))
    return { anticipation: mapAnticipation(before, receiverMap) }
  }
  return mutateAnticipationStatus({
    supabase: input.supabase,
    organizationId: input.organizationId,
    actorProfileId: input.actorProfileId,
    id: input.id,
    nextStatus: 'cancelled',
  })
}

export async function deleteAnticipation(input: {
  supabase: SupabaseLike
  organizationId: string
  actorProfileId: string
  id: string
}) {
  const before = await getInternalAnticipationRow({ supabase: input.supabase, organizationId: input.organizationId, id: input.id })
  if (!['draft', 'rejected', 'cancelled'].includes(String(before.status ?? ''))) {
    fail('Somente solicitacoes em rascunho, reprovadas ou canceladas podem ser excluidas.', 400)
  }

  const receiverRow = before.recebedor_id
    ? await loadReceiverForDraft({ supabase: input.supabase, organizationId: input.organizationId, receiverId: String(before.recebedor_id) })
    : null
  const receiver = receiverRow ? mapEligibleReceiver(receiverRow) : null
  const beforeRedacted = redactAnticipationForAudit(before, receiver)

  const { error } = await input.supabase.from('pay_antecipacao').delete().eq('organization_id', input.organizationId).eq('id', input.id).eq('is_internal', true)
  if (error) fail('Nao foi possivel excluir a antecipacao interna.', 500)

  await insertAnticipationInternalAuditLog({
    supabase: input.supabase,
    organizationId: input.organizationId,
    actorProfileId: input.actorProfileId,
    action: 'DELETE',
    entityId: input.id,
    before: beforeRedacted,
    after: null,
  })

  return { ok: true as const }
}

export async function handleAnticipationWebhook(input: {
  supabase: SupabaseLike
  organizationId: string
  providerEventId: string | null
  type: string
  payload: unknown
  providerAnticipationId: string | null
  anticipationIdFromMeta: string | null
}) {
  const nextStatus = mapAnticipationStatus({ type: input.type })
  if (!nextStatus) return { ok: false as const }

  let anticipation: any = null
  if (input.anticipationIdFromMeta) {
    const { data } = await input.supabase
      .from('pay_antecipacao')
      .select('*')
      .eq('organization_id', input.organizationId)
      .eq('id', input.anticipationIdFromMeta)
      .eq('is_internal', false)
      .maybeSingle()
    anticipation = data
  } else if (input.providerAnticipationId) {
    const byProvider = await input.supabase
      .from('pay_antecipacao')
      .select('*')
      .eq('organization_id', input.organizationId)
      .eq('is_internal', false)
      .eq('acquirer_anticipation_id', input.providerAnticipationId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    anticipation = byProvider.data
    if (!anticipation) {
      const byReference = await input.supabase
        .from('pay_antecipacao')
        .select('*')
        .eq('organization_id', input.organizationId)
        .eq('is_internal', false)
        .eq('provider_reference', input.providerAnticipationId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      anticipation = byReference.data
    }
  }

  if (!anticipation?.id) return { ok: false as const }
  if (input.providerEventId) {
    const { data: exists } = await input.supabase
      .from('pay_antecipacao_events')
      .select('id')
      .eq('organization_id', input.organizationId)
      .eq('provider_event_id', input.providerEventId)
      .maybeSingle()
    if (exists?.id) return { ok: true as const }
  }

  const now = new Date().toISOString()
  const updates: Record<string, unknown> = {
    status: nextStatus,
    provider_status: String(input.type ?? ''),
    provider_payload: input.payload ?? {},
  }
  if (nextStatus === 'provider_processing') updates.approved_at = now
  if (nextStatus === 'paid') {
    updates.paid_at = now
    updates.executed_at = now
  }
  if (nextStatus === 'cancelled') updates.canceled_at = now
  if (nextStatus === 'failed') updates.provider_last_error = 'Falha reportada pelo provider.'

  await input.supabase.from('pay_antecipacao').update(updates).eq('id', anticipation.id)
  await input.supabase.from('pay_antecipacao_events').insert({
    organization_id: input.organizationId,
    antecipacao_id: anticipation.id,
    event_type: input.type,
    payload: input.payload ?? {},
    provider_event_id: input.providerEventId,
  })

  return { ok: true as const }
}

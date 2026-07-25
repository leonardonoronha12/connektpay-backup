import { mapProviderErrorToUserMessage, ProviderError } from '@/lib/acquirer/provider-error'

export const ANTICIPATION_REQUESTER_ALLOWED_ROLES = ['owner', 'financeiro', 'super_admin'] as const
export const ANTICIPATION_ADMIN_ALLOWED_ROLES = ['owner', 'admin', 'super_admin'] as const

export const ANTICIPATION_INTERNAL_STATUSES = [
  'draft',
  'eligible',
  'requested',
  'under_review',
  'approved',
  'rejected',
  'scheduled',
  'provider_pending',
  'provider_processing',
  'paid',
  'failed',
  'cancelled',
] as const

export type AnticipationStatus = (typeof ANTICIPATION_INTERNAL_STATUSES)[number]

export type AnticipationEligibleReceiver = {
  id: string
  name: string
  document: string | null
  type: string | null
  status: string
  kycStatus: string
  internalStatus: string
  bankAccountMasked: {
    bank_code: string | null
    agency: string | null
    account: string | null
    account_digit: string | null
    account_type: string | null
    pix_key: string | null
  } | null
}

export type AnticipationInternalDraft = {
  id?: string | null
  receiverId: string
  requestedAmountCents: number
  eligibleAmountCents: number
  estimatedFeeBps: number
  effectiveFeeBps: number
  estimatedFeeCents: number
  effectiveFeeCents: number
  netAmountCents: number
  expectedSettlementDays: number
  expectedSettlementDate: string | null
  status: AnticipationStatus
  requestedAt: string | null
  approvedAt: string | null
  paidAt: string | null
  rejectedAt: string | null
  rejectionReason: string | null
  internalNotes: string | null
}

export type AnticipationInternalValidationIssue = {
  field: string
  message: string
}

function asText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function toNullText(value: unknown) {
  const text = asText(value)
  return text ? text : null
}

function toInteger(value: unknown, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value)
  if (typeof value === 'string') {
    const normalized = Number(value.replace(',', '.').replace(/[^\d.-]/g, ''))
    if (Number.isFinite(normalized)) return Math.round(normalized)
  }
  return fallback
}

function toDateOnly(value: unknown) {
  const text = asText(value)
  if (!text) return null
  return text.slice(0, 10)
}

function toStatus(value: unknown): AnticipationStatus {
  const raw = asText(value).toLowerCase()
  if (
    raw === 'eligible' ||
    raw === 'requested' ||
    raw === 'under_review' ||
    raw === 'approved' ||
    raw === 'rejected' ||
    raw === 'scheduled' ||
    raw === 'provider_pending' ||
    raw === 'provider_processing' ||
    raw === 'paid' ||
    raw === 'failed' ||
    raw === 'cancelled'
  ) {
    return raw
  }
  return 'draft'
}

export function calculateFee(input: { requestedAmountCents: number; feeBps: number }) {
  const requested = Math.round(input.requestedAmountCents)
  const bps = Math.round(input.feeBps)
  if (!Number.isFinite(requested) || requested <= 0) throw new Error('Invalid amount')
  if (!Number.isFinite(bps) || bps < 0) throw new Error('Invalid feeBps')
  return Math.round((requested * bps) / 10_000)
}

export function calculateNetAmount(input: { requestedAmountCents: number; feeCents: number }) {
  const requested = Math.round(input.requestedAmountCents)
  const fee = Math.round(input.feeCents)
  if (!Number.isFinite(requested) || requested <= 0) throw new Error('Invalid amount')
  if (!Number.isFinite(fee) || fee < 0) throw new Error('Invalid fee')
  const net = requested - fee
  if (net < 0) throw new Error('Invalid net')
  return net
}

export function validateAnticipationAmount(input: { requestedAmountCents: number; availableAmountCents: number }) {
  const requested = Math.round(input.requestedAmountCents)
  const available = Math.round(input.availableAmountCents)
  if (!Number.isFinite(requested) || requested <= 0) throw new Error('Invalid amount')
  if (!Number.isFinite(available) || available < 0) throw new Error('Invalid available')
  if (requested > available) throw new Error('Insufficient available amount')
  return { ok: true as const }
}

export function calculateAnticipation(input: {
  requestedAmountCents: number
  availableAmountCents: number
  feeBps: number
  settlementDays?: number
}) {
  validateAnticipationAmount({ requestedAmountCents: input.requestedAmountCents, availableAmountCents: input.availableAmountCents })
  const feeCents = calculateFee({ requestedAmountCents: input.requestedAmountCents, feeBps: input.feeBps })
  const netCents = calculateNetAmount({ requestedAmountCents: input.requestedAmountCents, feeCents })
  const settlementDays = Math.max(1, Math.round(input.settlementDays ?? 2))
  return {
    requestedAmountCents: Math.round(input.requestedAmountCents),
    availableAmountCents: Math.round(input.availableAmountCents),
    feeBps: Math.round(input.feeBps),
    feeCents,
    netCents,
    settlementDays,
  }
}

export function normalizeAnticipationInternalDraft(input: unknown): AnticipationInternalDraft {
  const raw = (input ?? {}) as Record<string, unknown>
  const requestedAmountCents = Math.max(0, toInteger(raw.requestedAmountCents ?? raw.requested_amount_centavos ?? raw.requestedAmount, 0))
  const eligibleAmountCents = Math.max(0, toInteger(raw.eligibleAmountCents ?? raw.eligible_amount_centavos ?? raw.availableAmountCents, 0))
  const estimatedFeeBps = Math.max(0, toInteger(raw.estimatedFeeBps ?? raw.estimated_fee_bps ?? raw.feeBps, 400))
  const effectiveFeeBps = Math.max(0, toInteger(raw.effectiveFeeBps ?? raw.feeBps ?? raw.fee_bps, estimatedFeeBps))
  const estimatedFeeCents = Math.max(0, toInteger(raw.estimatedFeeCents ?? raw.estimated_fee_centavos, calculateFee({ requestedAmountCents: Math.max(1, requestedAmountCents || 1), feeBps: estimatedFeeBps })))
  const effectiveFeeCents = Math.max(0, toInteger(raw.effectiveFeeCents ?? raw.feeCentavos ?? raw.fee_centavos, calculateFee({ requestedAmountCents: Math.max(1, requestedAmountCents || 1), feeBps: effectiveFeeBps })))
  const netAmountCents = Math.max(0, toInteger(raw.netAmountCents ?? raw.net_amount_centavos, Math.max(0, requestedAmountCents - effectiveFeeCents)))
  const expectedSettlementDays = Math.max(1, toInteger(raw.expectedSettlementDays ?? raw.expected_settlement_days, 2))

  return {
    id: asText(raw.id) || null,
    receiverId: asText(raw.receiverId ?? raw.recebedorId),
    requestedAmountCents,
    eligibleAmountCents,
    estimatedFeeBps,
    effectiveFeeBps,
    estimatedFeeCents,
    effectiveFeeCents,
    netAmountCents,
    expectedSettlementDays,
    expectedSettlementDate: toDateOnly(raw.expectedSettlementDate ?? raw.expected_settlement_at ?? raw.scheduledFor),
    status: toStatus(raw.status),
    requestedAt: toDateOnly(raw.requestedAt),
    approvedAt: toDateOnly(raw.approvedAt),
    paidAt: toDateOnly(raw.paidAt),
    rejectedAt: toDateOnly(raw.rejectedAt),
    rejectionReason: toNullText(raw.rejectionReason),
    internalNotes: toNullText(raw.internalNotes),
  }
}

export function getAnticipationInternalIssues(input: {
  draft: AnticipationInternalDraft
  eligibleReceivers: AnticipationEligibleReceiver[]
  availableAmountCents: number
  providerEnabled: boolean
  hasConflictingOpenRequest?: boolean
  existingStatus?: string | null
}) {
  const issues: AnticipationInternalValidationIssue[] = []
  const receiver = input.eligibleReceivers.find((item) => item.id === input.draft.receiverId)
  const existingStatus = String(input.existingStatus ?? '')
  const finalStatuses = ['rejected', 'paid', 'failed', 'cancelled']

  if (!receiver) issues.push({ field: 'receiverId', message: 'Escolha um recebedor ativo, aprovado internamente e pertencente a organizacao.' })
  if (!Number.isInteger(input.draft.requestedAmountCents) || input.draft.requestedAmountCents <= 0) {
    issues.push({ field: 'requestedAmountCents', message: 'Informe um valor valido para a antecipacao.' })
  }
  if (input.draft.requestedAmountCents > input.availableAmountCents) {
    issues.push({ field: 'requestedAmountCents', message: 'O valor solicitado nao pode ultrapassar o saldo elegivel disponivel.' })
  }
  if (input.hasConflictingOpenRequest) {
    issues.push({ field: 'receiverId', message: 'Ja existe uma solicitacao interna em aberto para este recebedor.' })
  }
  if (!receiver?.bankAccountMasked) {
    issues.push({ field: 'receiverId', message: 'O recebedor precisa ter dados bancarios configurados para solicitar antecipacao.' })
  }
  if (input.draft.status === 'rejected' && !input.draft.rejectionReason) {
    issues.push({ field: 'rejectionReason', message: 'Explique o motivo da reprovacao antes de continuar.' })
  }
  if (input.draft.status === 'scheduled' && !input.draft.expectedSettlementDate) {
    issues.push({ field: 'expectedSettlementDate', message: 'Informe a data prevista antes de agendar a antecipacao.' })
  }
  if (finalStatuses.includes(existingStatus) && existingStatus !== input.draft.status) {
    issues.push({ field: 'status', message: 'Nao e permitido alterar a solicitacao apos estado final.' })
  }
  if (!input.providerEnabled && ['provider_pending', 'provider_processing', 'paid', 'failed'].includes(input.draft.status)) {
    issues.push({ field: 'status', message: 'Statuses de provider ou pagamento real so podem ser usados apos integracao real.' })
  }
  if (!input.providerEnabled && input.draft.paidAt) {
    issues.push({ field: 'paidAt', message: 'A data de pagamento real so pode ser preenchida apos integracao real.' })
  }

  return issues
}

export function getAnticipationAuditAction(input: { beforeStatus?: string | null; afterStatus: AnticipationStatus }) {
  const before = String(input.beforeStatus ?? '')
  const after = input.afterStatus
  if (!before) return after === 'requested' ? 'REQUEST' : 'CREATE'
  if (after === 'approved') return 'APPROVE'
  if (after === 'rejected') return 'REJECT'
  if (after === 'cancelled') return 'CANCEL'
  return 'UPDATE'
}

export function simulateAnticipationInternal(input: {
  requestedAmountCents: number
  availableAmountCents: number
  feeBps?: number
  settlementDays?: number
}) {
  const feeBps = Math.max(0, Math.round(input.feeBps ?? 400))
  const settlementDays = Math.max(1, Math.round(input.settlementDays ?? 2))
  const requestedAmountCents = Math.max(0, Math.round(input.requestedAmountCents))
  const eligibleAmountCents = Math.max(0, Math.round(input.availableAmountCents))
  const feeCents = requestedAmountCents > 0 ? calculateFee({ requestedAmountCents, feeBps }) : 0
  const netAmountCents = Math.max(0, requestedAmountCents - feeCents)
  const discountCents = feeCents
  const remainingEligibleCents = Math.max(0, eligibleAmountCents - requestedAmountCents)

  return {
    requestedAmountCents,
    eligibleAmountCents,
    estimatedFeeBps: feeBps,
    effectiveFeeBps: feeBps,
    estimatedFeeCents: feeCents,
    effectiveFeeCents: feeCents,
    discountCents,
    netAmountCents,
    settlementDays,
    remainingEligibleCents,
  }
}

export function mapAnticipationStatus(input: { type: string }) {
  const t = String(input.type ?? '')
  if (t === 'anticipation.requested') return 'provider_pending' as const
  if (t === 'anticipation.approved') return 'provider_processing' as const
  if (t === 'anticipation.executed') return 'paid' as const
  if (t === 'anticipation.failed') return 'failed' as const
  if (t === 'anticipation.canceled') return 'cancelled' as const
  return null
}

export function mapAnticipationProviderErrorToUserMessage(e: unknown) {
  if (e instanceof ProviderError && e.code === 'NOT_IMPLEMENTED') {
    return 'A antecipação ainda não está disponível para o provedor financeiro ativo.'
  }
  const msg = e instanceof Error ? e.message : 'Erro'
  const lower = msg.toLowerCase()
  if (lower.includes('insufficient')) return 'Valor solicitado maior que o antecipável.'
  return mapProviderErrorToUserMessage(e, 'Não foi possível processar a antecipação.')
}

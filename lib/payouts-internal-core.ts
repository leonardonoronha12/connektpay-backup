import { calculatePayoutFee } from '@/lib/payout-core'

export const PAYOUTS_INTERNAL_ALLOWED_ROLES = ['owner', 'admin', 'financeiro', 'super_admin'] as const

export const PAYOUT_INTERNAL_STATUSES = [
  'draft',
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

export type PayoutInternalStatus = (typeof PAYOUT_INTERNAL_STATUSES)[number]

export type PayoutEligibleReceiver = {
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

export type PayoutBankAccountSnapshot = {
  bank_code: string | null
  agency: string | null
  account: string | null
  account_digit: string | null
  account_type: string | null
  pix_key: string | null
}

export type PayoutInternalDraft = {
  id?: string | null
  receiverId: string
  grossAmountCents: number
  feeBps: number
  feeAmountCents: number
  netAmountCents: number
  status: PayoutInternalStatus
  scheduledFor: string | null
  requestedAt: string | null
  approvedAt: string | null
  executedAt: string | null
  rejectionReason: string | null
  internalNotes: string | null
  bankAccountSnapshot: PayoutBankAccountSnapshot | null
}

export type PayoutInternalValidationIssue = {
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

function toStatus(value: unknown): PayoutInternalStatus {
  const raw = asText(value).toLowerCase()
  if (
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

function toBankSnapshot(value: unknown): PayoutBankAccountSnapshot | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  return {
    bank_code: toNullText(raw.bank_code),
    agency: toNullText(raw.agency),
    account: toNullText(raw.account),
    account_digit: toNullText(raw.account_digit),
    account_type: toNullText(raw.account_type),
    pix_key: toNullText(raw.pix_key),
  }
}

export function normalizePayoutInternalDraft(input: unknown): PayoutInternalDraft {
  const raw = (input ?? {}) as Record<string, unknown>
  const grossAmountCents = Math.max(0, toInteger(raw.grossAmountCents ?? raw.gross_amount ?? raw.amount, 0))
  const feeBps = Math.max(0, toInteger(raw.feeBps, 200))
  const feeAmountCents = Math.max(0, toInteger(raw.feeAmountCents, calculatePayoutFee({ grossAmountCents: Math.max(1, grossAmountCents || 1), feeBps }).feeAmountCents))
  const netAmountCents = Math.max(0, toInteger(raw.netAmountCents, Math.max(0, grossAmountCents - feeAmountCents)))

  return {
    id: asText(raw.id) || null,
    receiverId: asText(raw.receiverId),
    grossAmountCents,
    feeBps,
    feeAmountCents,
    netAmountCents,
    status: toStatus(raw.status),
    scheduledFor: toDateOnly(raw.scheduledFor),
    requestedAt: toDateOnly(raw.requestedAt),
    approvedAt: toDateOnly(raw.approvedAt),
    executedAt: toDateOnly(raw.executedAt),
    rejectionReason: toNullText(raw.rejectionReason),
    internalNotes: toNullText(raw.internalNotes),
    bankAccountSnapshot: toBankSnapshot(raw.bankAccountSnapshot),
  }
}

export function getPayoutInternalIssues(input: {
  draft: PayoutInternalDraft
  eligibleReceivers: PayoutEligibleReceiver[]
  availableBalanceCents: number
  providerEnabled: boolean
  hasConflictingOpenRequest?: boolean
  existingStatus?: string | null
}): PayoutInternalValidationIssue[] {
  const issues: PayoutInternalValidationIssue[] = []
  const receiver = input.eligibleReceivers.find((item) => item.id === input.draft.receiverId)
  const existingStatus = String(input.existingStatus ?? '')
  const finalStatuses = ['rejected', 'paid', 'failed', 'cancelled']

  if (!receiver) issues.push({ field: 'receiverId', message: 'Escolha um recebedor ativo, aprovado internamente e pertencente a organizacao.' })
  if (!Number.isInteger(input.draft.grossAmountCents) || input.draft.grossAmountCents <= 0) {
    issues.push({ field: 'grossAmountCents', message: 'Informe um valor bruto valido para a solicitacao.' })
  }
  if (input.draft.grossAmountCents > input.availableBalanceCents) {
    issues.push({ field: 'grossAmountCents', message: 'O valor solicitado nao pode ultrapassar o saldo disponivel.' })
  }
  if (!receiver?.bankAccountMasked) {
    issues.push({ field: 'bankAccountSnapshot', message: 'O recebedor precisa ter dados bancarios configurados antes de solicitar repasse.' })
  }
  if (input.hasConflictingOpenRequest) {
    issues.push({ field: 'receiverId', message: 'Ja existe uma solicitacao interna em aberto para este recebedor.' })
  }
  if (input.draft.status === 'scheduled' && !input.draft.scheduledFor) {
    issues.push({ field: 'scheduledFor', message: 'Informe a data prevista ao agendar um repasse interno.' })
  }
  if (input.draft.status === 'rejected' && !input.draft.rejectionReason) {
    issues.push({ field: 'rejectionReason', message: 'Explique o motivo da reprovacao antes de continuar.' })
  }
  if (finalStatuses.includes(existingStatus) && existingStatus !== input.draft.status) {
    issues.push({ field: 'status', message: 'Nao e permitido alterar uma solicitacao apos estado final.' })
  }
  if (!input.providerEnabled && ['provider_pending', 'provider_processing', 'paid', 'failed'].includes(input.draft.status)) {
    issues.push({ field: 'status', message: 'Statuses do provider ou pagamento real so podem ser usados apos integracao real.' })
  }
  if (!input.providerEnabled && input.draft.executedAt) {
    issues.push({ field: 'executedAt', message: 'A data de execucao real so pode ser preenchida apos resposta real do provider.' })
  }

  return issues
}

export function getPayoutAuditAction(input: { beforeStatus?: string | null; afterStatus: PayoutInternalStatus }) {
  const before = String(input.beforeStatus ?? '')
  const after = input.afterStatus
  if (!before) return after === 'requested' ? 'REQUEST' : 'CREATE'
  if (after === 'approved') return 'APPROVE'
  if (after === 'rejected') return 'REJECT'
  if (after === 'scheduled') return 'SCHEDULE'
  if (after === 'cancelled') return 'CANCEL'
  return 'UPDATE'
}

export function simulateInternalPayout(input: { grossAmountCents: number; feeBps?: number; availableBalanceCents: number }) {
  const feeBps = Math.max(0, Math.round(input.feeBps ?? 200))
  const calc = calculatePayoutFee({ grossAmountCents: Math.max(1, Math.round(input.grossAmountCents)), feeBps })
  const remainingBalanceCents = Math.max(0, input.availableBalanceCents - Math.max(0, Math.round(input.grossAmountCents)))

  return {
    feeBps,
    grossAmountCents: Math.max(0, Math.round(input.grossAmountCents)),
    feeAmountCents: calc.feeAmountCents,
    netAmountCents: calc.netAmountCents,
    availableBalanceCents: Math.max(0, Math.round(input.availableBalanceCents)),
    remainingBalanceCents,
  }
}

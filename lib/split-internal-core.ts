import { calculateSplit, type PayTaxaConfig, type SplitRuleConfig } from '@/lib/split-core'

export const SPLIT_INTERNAL_ALLOWED_ROLES = ['owner', 'admin', 'super_admin'] as const

export type SplitInternalStatus = 'active' | 'inactive'
export type SplitInternalRuleType = 'percentage' | 'fixed'

export type SplitEligibleReceiver = {
  id: string
  name: string
  document: string | null
  type: string | null
  status: string
  kycStatus: string
  internalStatus: string
}

export type SplitInternalRuleDraft = {
  id?: string | null
  receiverId: string
  type: SplitInternalRuleType
  valueCents: number | null
  percentageBps: number | null
  priority: number
}

export type SplitInternalConfigDraft = {
  name: string
  mainReceiverId: string
  status: SplitInternalStatus
  validFrom: string | null
  validUntil: string | null
  internalNotes: string | null
  rules: SplitInternalRuleDraft[]
}

export type SplitInternalValidationIssue = {
  field: string
  message: string
}

function normalizeText(input: unknown) {
  if (typeof input !== 'string') return null
  const trimmed = input.trim()
  return trimmed || null
}

function normalizeDateOnly(input: unknown) {
  const value = normalizeText(input)
  if (!value) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  return value
}

function normalizeStatus(input: unknown): SplitInternalStatus {
  return String(input ?? '').trim().toLowerCase() === 'inactive' ? 'inactive' : 'active'
}

function normalizeRuleType(input: unknown): SplitInternalRuleType {
  return String(input ?? '').trim().toLowerCase() === 'fixed' ? 'fixed' : 'percentage'
}

function normalizeInteger(input: unknown) {
  if (typeof input === 'number' && Number.isInteger(input)) return input
  if (typeof input === 'string' && /^-?\d+$/.test(input.trim())) return Number(input.trim())
  return null
}

export function toStartOfDayIso(dateOnly: string | null) {
  return dateOnly ? `${dateOnly}T00:00:00.000Z` : null
}

export function toEndOfDayIso(dateOnly: string | null) {
  return dateOnly ? `${dateOnly}T23:59:59.999Z` : null
}

export function normalizeSplitInternalDraft(input: any): SplitInternalConfigDraft {
  const rules = Array.isArray(input?.rules)
    ? input.rules.map((rule: any, index: number) => ({
        id: normalizeText(rule?.id),
        receiverId: normalizeText(rule?.receiverId) ?? '',
        type: normalizeRuleType(rule?.type),
        valueCents: normalizeInteger(rule?.valueCents),
        percentageBps: normalizeInteger(rule?.percentageBps),
        priority: normalizeInteger(rule?.priority) ?? Math.max(0, Array.isArray(input?.rules) ? input.rules.length - index : 0),
      }))
    : []

  return {
    name: normalizeText(input?.name) ?? '',
    mainReceiverId: normalizeText(input?.mainReceiverId) ?? '',
    status: normalizeStatus(input?.status),
    validFrom: normalizeDateOnly(input?.validFrom),
    validUntil: normalizeDateOnly(input?.validUntil),
    internalNotes: normalizeText(input?.internalNotes),
    rules,
  }
}

export function getSplitInternalDraftIssues(input: {
  draft: SplitInternalConfigDraft
  eligibleReceivers: SplitEligibleReceiver[]
  overlappingActiveConfig?: boolean
}): SplitInternalValidationIssue[] {
  const { draft, eligibleReceivers } = input
  const issues: SplitInternalValidationIssue[] = []

  if (!draft.name) issues.push({ field: 'name', message: 'Dê um nome para identificar esta configuração de split.' })
  if (!draft.mainReceiverId) issues.push({ field: 'mainReceiverId', message: 'Selecione o recebedor principal.' })
  if (!draft.rules.length) issues.push({ field: 'rules', message: 'Adicione pelo menos um recebedor à configuração de split.' })

  if ((draft.validFrom && !draft.validUntil && false) || false) {
    // No-op to keep date validation grouped below.
  }
  if ((draft.validFrom && !/^\d{4}-\d{2}-\d{2}$/.test(draft.validFrom)) || (draft.validUntil && !/^\d{4}-\d{2}-\d{2}$/.test(draft.validUntil))) {
    issues.push({ field: 'validity', message: 'Informe datas válidas para a vigência do split.' })
  }
  if (draft.validFrom && draft.validUntil && draft.validUntil < draft.validFrom) {
    issues.push({ field: 'validity', message: 'A data final não pode ser anterior à data inicial.' })
  }

  const eligibleMap = new Map(eligibleReceivers.map((receiver) => [receiver.id, receiver]))
  const seenReceivers = new Set<string>()
  let percentageSum = 0

  for (let index = 0; index < draft.rules.length; index += 1) {
    const rule = draft.rules[index]
    const prefix = `rules.${index}`

    if (!rule.receiverId) {
      issues.push({ field: `${prefix}.receiverId`, message: 'Selecione um recebedor para esta regra.' })
    } else if (seenReceivers.has(rule.receiverId)) {
      issues.push({ field: `${prefix}.receiverId`, message: 'Cada recebedor pode aparecer apenas uma vez na configuração.' })
    } else {
      seenReceivers.add(rule.receiverId)
    }

    const receiver = rule.receiverId ? eligibleMap.get(rule.receiverId) : null
    if (rule.receiverId && !receiver) {
      issues.push({ field: `${prefix}.receiverId`, message: 'O recebedor selecionado não está disponível para split interno.' })
    }

    if (rule.priority < 0) {
      issues.push({ field: `${prefix}.priority`, message: 'A prioridade da regra não pode ser negativa.' })
    }

    if (rule.type === 'percentage') {
      if (rule.percentageBps == null || !Number.isInteger(rule.percentageBps) || rule.percentageBps <= 0) {
        issues.push({ field: `${prefix}.percentageBps`, message: 'Informe um percentual válido para o split.' })
      } else if (rule.percentageBps > 10000) {
        issues.push({ field: `${prefix}.percentageBps`, message: 'O percentual de cada recebedor não pode ultrapassar 100%.' })
      } else {
        percentageSum += rule.percentageBps
      }
    }

    if (rule.type === 'fixed') {
      if (rule.valueCents == null || !Number.isInteger(rule.valueCents) || rule.valueCents <= 0) {
        issues.push({ field: `${prefix}.valueCents`, message: 'Informe um valor fixo válido para o split.' })
      }
    }
  }

  if (percentageSum > 10000) {
    issues.push({ field: 'rules', message: 'A soma dos percentuais não pode ultrapassar 100%.' })
  }

  if (draft.mainReceiverId && !seenReceivers.has(draft.mainReceiverId)) {
    issues.push({ field: 'mainReceiverId', message: 'Inclua o recebedor principal entre as regras do split.' })
  }

  if (draft.status === 'active' && input.overlappingActiveConfig) {
    issues.push({ field: 'validity', message: 'Já existe outra configuração ativa de split para este recebedor principal no mesmo período.' })
  }

  return dedupeIssues(issues)
}

function dedupeIssues(issues: SplitInternalValidationIssue[]) {
  const seen = new Set<string>()
  return issues.filter((issue) => {
    const key = `${issue.field}:${issue.message}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function assertSplitInternalDraft(input: {
  draft: SplitInternalConfigDraft
  eligibleReceivers: SplitEligibleReceiver[]
  overlappingActiveConfig?: boolean
}) {
  const issues = getSplitInternalDraftIssues(input)
  if (issues.length) throw new Error(issues[0].message)
  return input.draft
}

export function areDateRangesOverlapping(input: {
  startA: string | null
  endA: string | null
  startB: string | null
  endB: string | null
}) {
  const startA = input.startA ? new Date(toStartOfDayIso(input.startA) as string).getTime() : Number.NEGATIVE_INFINITY
  const endA = input.endA ? new Date(toEndOfDayIso(input.endA) as string).getTime() : Number.POSITIVE_INFINITY
  const startB = input.startB ? new Date(toStartOfDayIso(input.startB) as string).getTime() : Number.NEGATIVE_INFINITY
  const endB = input.endB ? new Date(toEndOfDayIso(input.endB) as string).getTime() : Number.POSITIVE_INFINITY
  return startA <= endB && startB <= endA
}

export function toSplitRuleConfigs(rules: SplitInternalRuleDraft[]): SplitRuleConfig[] {
  return rules.map((rule, index) => ({
    id: rule.id ?? `draft-${index + 1}`,
    receiverId: rule.receiverId,
    type: rule.type,
    valueCents: rule.type === 'fixed' && typeof rule.valueCents === 'number' ? BigInt(rule.valueCents) : null,
    percentageBps: rule.type === 'percentage' && typeof rule.percentageBps === 'number' ? rule.percentageBps : null,
    priority: Number.isInteger(rule.priority) ? rule.priority : 0,
  }))
}

export function simulateInternalSplit(input: {
  saleAmountCents: number
  taxConfig: PayTaxaConfig | null
  draft: SplitInternalConfigDraft
  eligibleReceivers: SplitEligibleReceiver[]
}) {
  if (!Number.isInteger(input.saleAmountCents) || input.saleAmountCents <= 0) {
    throw new Error('Informe um valor de venda válido para a simulação.')
  }

  assertSplitInternalDraft({ draft: input.draft, eligibleReceivers: input.eligibleReceivers })

  const split = calculateSplit({
    grossAmount: input.saleAmountCents,
    taxConfig: input.taxConfig,
    rules: toSplitRuleConfigs(input.draft.rules),
    defaultReceiverId: input.draft.mainReceiverId,
  })

  const receiverMap = new Map(input.eligibleReceivers.map((receiver) => [receiver.id, receiver]))

  return {
    summary: {
      saleAmountCents: Number(split.grossAmount),
      connektFeeAmount: Number(split.connektFeeAmount),
      receiverTotalAmount: Number(split.receiverTotalAmount),
      ruleCount: input.draft.rules.length,
    },
    receivers: split.receivers.map((row) => {
      const receiver = receiverMap.get(row.receiverId)
      return {
        receiverId: row.receiverId,
        receiverName: receiver?.name ?? 'Recebedor',
        receiverDocument: receiver?.document ?? null,
        isMainReceiver: row.receiverId === input.draft.mainReceiverId,
        amountCents: Number(row.amount),
        percentageBps: row.percentageBps,
        priority: row.priority,
      }
    }),
  }
}


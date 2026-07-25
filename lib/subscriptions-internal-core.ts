import { addCycleUtc, addDaysUtc, computeInitialNextChargeAt, type PlanCycle } from '@/lib/subscription-core'

export const SUBSCRIPTIONS_INTERNAL_READ_ROLES = ['owner', 'admin', 'financeiro', 'super_admin'] as const
export const SUBSCRIPTIONS_INTERNAL_MANAGE_ROLES = ['owner', 'admin', 'super_admin'] as const

export const SUBSCRIPTION_PLAN_STATUSES = ['draft', 'active', 'inactive', 'scheduled', 'expired'] as const
export type SubscriptionPlanStatus = (typeof SUBSCRIPTION_PLAN_STATUSES)[number]

export const SUBSCRIPTION_INTERNAL_STATUSES = [
  'draft',
  'active',
  'trial',
  'scheduled',
  'paused',
  'cancelled',
  'expired',
  'payment_pending',
  'payment_failed',
  'provider_pending',
  'provider_synced',
] as const
export type SubscriptionInternalStatus = (typeof SUBSCRIPTION_INTERNAL_STATUSES)[number]

export type SubscriptionEligibleReceiver = {
  id: string
  name: string
  document: string | null
  type: string | null
  status: string
  kycStatus: string
  internalStatus: string
}

export type SubscriptionCustomerDraft = {
  id?: string | null
  name: string
  email: string | null
  document: string | null
  phone: string | null
}

export type SubscriptionPlanDraft = {
  id?: string | null
  receiverId: string
  name: string
  description: string | null
  amountCents: number
  currency: 'BRL'
  cycle: PlanCycle
  trialDays: number
  billingCyclesLimit: number | null
  isInfinite: boolean
  status: SubscriptionPlanStatus
  startsAt: string | null
  endsAt: string | null
  internalNotes: string | null
}

export type SubscriptionInternalDraft = {
  id?: string | null
  planId: string
  customer: SubscriptionCustomerDraft
  joinedAt: string | null
  nextChargeAt: string | null
  lastChargeAt: string | null
  status: SubscriptionInternalStatus
  internalNotes: string | null
}

export type SubscriptionInternalValidationIssue = {
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

function toCurrency(value: unknown): 'BRL' {
  return 'BRL'
}

function toPlanStatus(value: unknown): SubscriptionPlanStatus {
  const raw = asText(value).toLowerCase()
  if (raw === 'active' || raw === 'inactive' || raw === 'scheduled' || raw === 'expired') return raw
  return 'draft'
}

function toSubscriptionStatus(value: unknown): SubscriptionInternalStatus {
  const raw = asText(value).toLowerCase()
  if (
    raw === 'active' ||
    raw === 'trial' ||
    raw === 'scheduled' ||
    raw === 'paused' ||
    raw === 'cancelled' ||
    raw === 'expired' ||
    raw === 'payment_pending' ||
    raw === 'payment_failed' ||
    raw === 'provider_pending' ||
    raw === 'provider_synced'
  ) {
    return raw
  }
  return 'draft'
}

function toCycle(value: unknown): PlanCycle {
  const raw = asText(value).toLowerCase()
  if (raw === 'weekly' || raw === 'yearly') return raw
  return 'monthly'
}

function toDateOnly(value: unknown) {
  const text = asText(value)
  if (!text) return null
  return text.slice(0, 10)
}

function dateOnlyToIsoStart(dateOnly: string | null) {
  if (!dateOnly) return null
  return `${dateOnly}T00:00:00.000Z`
}

function dateOnlyToIsoEnd(dateOnly: string | null) {
  if (!dateOnly) return null
  return `${dateOnly}T23:59:59.999Z`
}

export function normalizeSubscriptionPlanDraft(input: unknown): SubscriptionPlanDraft {
  const raw = (input ?? {}) as Record<string, unknown>
  const billingCyclesLimit = (() => {
    const value = toInteger(raw.billingCyclesLimit, 0)
    return value > 0 ? value : null
  })()

  const startsAt = toDateOnly(raw.startsAt)
  const endsAt = toDateOnly(raw.endsAt)

  return {
    id: asText(raw.id) || null,
    receiverId: asText(raw.receiverId),
    name: asText(raw.name),
    description: toNullText(raw.description),
    amountCents: Math.max(0, toInteger(raw.amountCents, 0)),
    currency: toCurrency(raw.currency),
    cycle: toCycle(raw.cycle),
    trialDays: Math.max(0, toInteger(raw.trialDays, 0)),
    billingCyclesLimit,
    isInfinite: raw.isInfinite == null ? billingCyclesLimit == null : Boolean(raw.isInfinite),
    status: toPlanStatus(raw.status),
    startsAt,
    endsAt,
    internalNotes: toNullText(raw.internalNotes),
  }
}

export function normalizeSubscriptionInternalDraft(input: unknown): SubscriptionInternalDraft {
  const raw = (input ?? {}) as Record<string, unknown>
  const customerRaw = (raw.customer ?? {}) as Record<string, unknown>
  return {
    id: asText(raw.id) || null,
    planId: asText(raw.planId),
    customer: {
      id: asText(customerRaw.id) || null,
      name: asText(customerRaw.name),
      email: toNullText(customerRaw.email),
      document: toNullText(customerRaw.document),
      phone: toNullText(customerRaw.phone),
    },
    joinedAt: toDateOnly(raw.joinedAt),
    nextChargeAt: toDateOnly(raw.nextChargeAt),
    lastChargeAt: toDateOnly(raw.lastChargeAt),
    status: toSubscriptionStatus(raw.status),
    internalNotes: toNullText(raw.internalNotes),
  }
}

export function getSubscriptionPlanIssues(input: {
  draft: SubscriptionPlanDraft
  eligibleReceivers: SubscriptionEligibleReceiver[]
}): SubscriptionInternalValidationIssue[] {
  const issues: SubscriptionInternalValidationIssue[] = []
  const receiver = input.eligibleReceivers.find((item) => item.id === input.draft.receiverId)

  if (!input.draft.name) issues.push({ field: 'name', message: 'Informe um nome para identificar o plano.' })
  if (!receiver) issues.push({ field: 'receiverId', message: 'Escolha um recebedor ativo e com aprovacao interna.' })
  if (!Number.isInteger(input.draft.amountCents) || input.draft.amountCents <= 0) {
    issues.push({ field: 'amountCents', message: 'Informe um valor valido para o plano.' })
  }
  if (input.draft.currency !== 'BRL') issues.push({ field: 'currency', message: 'Neste momento o modulo interno opera apenas em BRL.' })
  if (!['weekly', 'monthly', 'yearly'].includes(input.draft.cycle)) issues.push({ field: 'cycle', message: 'Escolha uma periodicidade valida.' })
  if (!Number.isInteger(input.draft.trialDays) || input.draft.trialDays < 0) {
    issues.push({ field: 'trialDays', message: 'O periodo de trial precisa ser um numero inteiro maior ou igual a zero.' })
  }
  if (!input.draft.isInfinite) {
    if (!input.draft.billingCyclesLimit || input.draft.billingCyclesLimit <= 0) {
      issues.push({ field: 'billingCyclesLimit', message: 'Informe quantas cobrancas este plano deve gerar.' })
    }
  }
  if (input.draft.startsAt && input.draft.endsAt && input.draft.endsAt < input.draft.startsAt) {
    issues.push({ field: 'endsAt', message: 'A data final precisa ser igual ou posterior a data inicial.' })
  }
  if (input.draft.status === 'scheduled' && !input.draft.startsAt) {
    issues.push({ field: 'startsAt', message: 'Planos agendados precisam ter uma data de inicio.' })
  }

  return issues
}

export function getSubscriptionInternalIssues(input: {
  draft: SubscriptionInternalDraft
  plans: Array<{
    id: string
    receiverId: string
    status: SubscriptionPlanStatus | string
    cycle: PlanCycle
    trialDays: number
    billingCyclesLimit: number | null
    isInfinite: boolean
    startsAt: string | null
    endsAt: string | null
  }>
  eligibleReceivers: SubscriptionEligibleReceiver[]
  providerEnabled: boolean
}): SubscriptionInternalValidationIssue[] {
  const issues: SubscriptionInternalValidationIssue[] = []
  const plan = input.plans.find((item) => item.id === input.draft.planId)
  const joinedAt = input.draft.joinedAt ?? new Date().toISOString().slice(0, 10)

  if (!plan) {
    issues.push({ field: 'planId', message: 'Escolha um plano interno valido antes de continuar.' })
    return issues
  }

  if (!['active', 'scheduled', 'draft'].includes(String(plan.status))) {
    issues.push({ field: 'planId', message: 'Esse plano nao esta disponivel para novas adesoes.' })
  }
  if (!input.draft.customer.name) issues.push({ field: 'customer.name', message: 'Informe o nome do cliente.' })
  if (!input.draft.customer.email && !input.draft.customer.document) {
    issues.push({ field: 'customer.email', message: 'Informe pelo menos e-mail ou documento para identificar o cliente.' })
  }

  const receiver = input.eligibleReceivers.find((item) => item.id === plan.receiverId)
  if (!receiver) issues.push({ field: 'planId', message: 'O recebedor vinculado ao plano nao esta apto para cobranca interna.' })

  if (plan.startsAt && joinedAt < plan.startsAt) {
    issues.push({ field: 'joinedAt', message: 'A adesao nao pode acontecer antes do inicio de vigencia do plano.' })
  }
  if (plan.endsAt && joinedAt > plan.endsAt) {
    issues.push({ field: 'joinedAt', message: 'A adesao nao pode acontecer apos o termino de vigencia do plano.' })
  }
  if (input.draft.lastChargeAt && input.draft.nextChargeAt && input.draft.lastChargeAt > input.draft.nextChargeAt) {
    issues.push({ field: 'nextChargeAt', message: 'A proxima cobranca precisa acontecer depois da ultima cobranca.' })
  }
  if (input.draft.status === 'provider_synced' && !input.providerEnabled) {
    issues.push({ field: 'status', message: 'Sincronizacao com provider so pode ser marcada apos integracao real.' })
  }

  return issues
}

function buildEstimatedExpiryDate(input: {
  firstChargeAt: string
  cycle: PlanCycle
  billingCyclesLimit: number | null
  endsAt: string | null
}) {
  let expiresAt = input.endsAt ? dateOnlyToIsoEnd(input.endsAt) : null
  if (!input.billingCyclesLimit || input.billingCyclesLimit <= 0) return expiresAt

  let cursor = input.firstChargeAt
  for (let index = 1; index < input.billingCyclesLimit; index += 1) cursor = addCycleUtc(cursor, input.cycle)
  const cycleExpiry = cursor
  if (!expiresAt) return cycleExpiry
  return cycleExpiry < expiresAt ? cycleExpiry : expiresAt
}

export function simulateSubscriptionInternal(input: {
  planDraft: SubscriptionPlanDraft
  joinedAt: string | null
  horizonCycles?: number
}) {
  const plan = normalizeSubscriptionPlanDraft(input.planDraft)
  const joinedAt = input.joinedAt ?? new Date().toISOString().slice(0, 10)
  const effectiveStart = (() => {
    if (plan.startsAt && joinedAt < plan.startsAt) return plan.startsAt
    return joinedAt
  })()

  const createdAtIso = dateOnlyToIsoStart(effectiveStart) ?? new Date().toISOString()
  const nextChargeAtIso = computeInitialNextChargeAt({
    createdAtIso,
    trialDays: plan.trialDays,
    cycle: plan.cycle,
  })

  const limitByPlan = plan.isInfinite ? null : plan.billingCyclesLimit
  const horizon = Math.max(1, Math.min(24, Math.round(input.horizonCycles ?? 12)))
  const maxCycles = limitByPlan ? Math.min(limitByPlan, horizon) : horizon

  const recurrences: Array<{ index: number; chargeAt: string; amountCents: number; label: string }> = []
  let cursor = nextChargeAtIso
  for (let index = 0; index < maxCycles; index += 1) {
    if (plan.endsAt && cursor > dateOnlyToIsoEnd(plan.endsAt)!) break
    recurrences.push({
      index: index + 1,
      chargeAt: cursor,
      amountCents: plan.amountCents,
      label: new Date(cursor).toLocaleDateString('pt-BR', { timeZone: 'UTC' }),
    })
    cursor = addCycleUtc(cursor, plan.cycle)
  }

  const calendar = recurrences.reduce(
    (acc, recurrence) => {
      const date = new Date(recurrence.chargeAt)
      const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
      const current = acc.get(key) ?? { month: key, count: 0, amountCents: 0 }
      current.count += 1
      current.amountCents += recurrence.amountCents
      acc.set(key, current)
      return acc
    },
    new Map<string, { month: string; count: number; amountCents: number }>(),
  )

  const trialEndsAtIso = plan.trialDays > 0 ? addDaysUtc(createdAtIso, plan.trialDays) : null
  const estimatedExpiryAt = buildEstimatedExpiryDate({
    firstChargeAt: nextChargeAtIso,
    cycle: plan.cycle,
    billingCyclesLimit: limitByPlan,
    endsAt: plan.endsAt,
  })

  return {
    summary: {
      nextChargeAt: nextChargeAtIso,
      trialEndsAt: trialEndsAtIso,
      recurrenceCount: recurrences.length,
      estimatedRevenueCents: recurrences.reduce((acc, recurrence) => acc + recurrence.amountCents, 0),
      amountCents: plan.amountCents,
      cycle: plan.cycle,
      estimatedExpiryAt,
    },
    recurrences,
    calendar: Array.from(calendar.values()).sort((a, b) => a.month.localeCompare(b.month)),
  }
}

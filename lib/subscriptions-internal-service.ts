import 'server-only'

import {
  SUBSCRIPTION_INTERNAL_STATUSES,
  SUBSCRIPTION_PLAN_STATUSES,
  getSubscriptionInternalIssues,
  getSubscriptionPlanIssues,
  normalizeSubscriptionInternalDraft,
  normalizeSubscriptionPlanDraft,
  simulateSubscriptionInternal,
  type SubscriptionEligibleReceiver,
  type SubscriptionInternalDraft,
  type SubscriptionInternalStatus,
  type SubscriptionInternalValidationIssue,
  type SubscriptionPlanDraft,
  type SubscriptionPlanStatus,
} from '@/lib/subscriptions-internal-core'

type SupabaseLike = any

async function insertSubscriptionsInternalAuditLog(input: {
  supabase: SupabaseLike
  organizationId: string
  actorProfileId: string
  action: string
  entity: string
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
    entity: input.entity,
    entity_id: input.entityId ?? null,
    before: (input.before ?? null) as any,
    after: (input.after ?? null) as any,
  })
  if (error) throw new Error('Nao foi possivel registrar a auditoria desta operacao.')
}

function toDateOnly(input: unknown) {
  if (typeof input !== 'string' || !input) return null
  return input.slice(0, 10)
}

function toStartOfDayIso(dateOnly: string | null) {
  if (!dateOnly) return null
  return `${dateOnly}T00:00:00.000Z`
}

function toEndOfDayIso(dateOnly: string | null) {
  if (!dateOnly) return null
  return `${dateOnly}T23:59:59.999Z`
}

function mapReceiver(row: any): SubscriptionEligibleReceiver {
  return {
    id: String(row.id),
    name: typeof row.name === 'string' && row.name.trim() ? row.name.trim() : 'Recebedor',
    document: row.document ? String(row.document) : null,
    type: row.type ? String(row.type) : null,
    status: String(row.status ?? 'inactive'),
    kycStatus: String(row.kyc_status ?? 'pending'),
    internalStatus: String(row.internal_status ?? 'draft'),
  }
}

function mapCustomer(row: any) {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    email: row.email ? String(row.email) : null,
    document: row.document ? String(row.document) : null,
    phone: row.phone ? String(row.phone) : null,
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  }
}

function mapPlan(row: any, receiverMap: Map<string, SubscriptionEligibleReceiver>) {
  const receiverId = String(row.recebedor_id)
  const receiver = receiverMap.get(receiverId)
  return {
    id: String(row.id),
    receiverId,
    name: String(row.name ?? ''),
    description: typeof row.description === 'string' ? row.description : null,
    amountCents: Number(row.amount_centavos ?? 0),
    currency: String(row.currency ?? 'BRL'),
    cycle: String(row.cycle ?? 'monthly'),
    trialDays: Number(row.trial_days ?? 0),
    billingCyclesLimit: row.billing_cycles_limit == null ? null : Number(row.billing_cycles_limit),
    isInfinite: Boolean(row.is_infinite ?? true),
    status: String(row.status ?? 'draft'),
    startsAt: toDateOnly(row.starts_at),
    endsAt: toDateOnly(row.ends_at),
    internalNotes: typeof row.internal_notes === 'string' ? row.internal_notes : null,
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
        }
      : null,
  }
}

function mapSubscription(row: any, planMap: Map<string, any>, customerMap: Map<string, any>, receiverMap: Map<string, SubscriptionEligibleReceiver>) {
  const planId = String(row.plano_id)
  const customerId = String(row.pagador_id)
  const receiverId = String(row.recebedor_id)
  const plan = planMap.get(planId) ?? null
  const customer = customerMap.get(customerId) ?? null
  const receiver = receiverMap.get(receiverId) ?? null

  return {
    id: String(row.id),
    planId,
    customerId,
    receiverId,
    status: String(row.status ?? 'draft'),
    joinedAt: toDateOnly(row.joined_at ?? row.created_at),
    nextChargeAt: toDateOnly(row.next_charge_at),
    lastChargeAt: toDateOnly(row.last_charge_at),
    pausedAt: row.paused_at ? String(row.paused_at) : null,
    resumedAt: row.resumed_at ? String(row.resumed_at) : null,
    expiresAt: row.expires_at ? String(row.expires_at) : null,
    cancelledAt: row.canceled_at ? String(row.canceled_at) : null,
    billingCyclesCompleted: Number(row.billing_cycles_completed ?? 0),
    internalNotes: typeof row.internal_notes === 'string' ? row.internal_notes : null,
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
    plan,
    customer,
    receiver,
  }
}

export async function loadSubscriptionEligibleReceivers(supabase: SupabaseLike, organizationId: string) {
  const { data, error } = await supabase
    .from('receivers')
    .select('id, name, document, type, status, kyc_status, internal_status')
    .eq('organization_id', organizationId)
    .eq('status', 'active')
    .eq('kyc_status', 'approved')
    .order('created_at', { ascending: false })

  if (error) throw new Error('Nao foi possivel carregar os recebedores elegiveis.')
  return (Array.isArray(data) ? data : []).map(mapReceiver)
}

async function loadInternalPlanRows(supabase: SupabaseLike, organizationId: string) {
  const { data, error } = await supabase
    .from('pay_plano')
    .select(
      'id, recebedor_id, payment_link_id, name, description, amount_centavos, currency, cycle, trial_days, billing_cycles_limit, is_infinite, status, starts_at, ends_at, internal_notes, created_at, updated_at',
    )
    .eq('organization_id', organizationId)
    .is('payment_link_id', null)
    .order('created_at', { ascending: false })

  if (error) throw new Error('Nao foi possivel carregar os planos internos.')
  return Array.isArray(data) ? data : []
}

async function loadCustomerRows(supabase: SupabaseLike, organizationId: string) {
  const { data, error } = await supabase
    .from('pay_pagador')
    .select('id, name, email, document, phone, created_at, updated_at')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })

  if (error) throw new Error('Nao foi possivel carregar os clientes internos.')
  return Array.isArray(data) ? data : []
}

async function loadInternalSubscriptionRows(supabase: SupabaseLike, organizationId: string, internalPlanIds: string[]) {
  if (!internalPlanIds.length) return []
  const { data, error } = await supabase
    .from('pay_assinatura')
    .select(
      'id, plano_id, pagador_id, recebedor_id, status, next_charge_at, last_charge_at, canceled_at, created_at, updated_at, joined_at, paused_at, resumed_at, expires_at, billing_cycles_completed, internal_notes',
    )
    .eq('organization_id', organizationId)
    .in('plano_id', internalPlanIds)
    .order('created_at', { ascending: false })

  if (error) throw new Error('Nao foi possivel carregar as assinaturas internas.')
  return Array.isArray(data) ? data : []
}

async function getInternalPlanRow(input: { supabase: SupabaseLike; organizationId: string; planId: string }) {
  const { data, error } = await input.supabase
    .from('pay_plano')
    .select(
      'id, recebedor_id, payment_link_id, name, description, amount_centavos, currency, cycle, trial_days, billing_cycles_limit, is_infinite, status, starts_at, ends_at, internal_notes, created_at, updated_at',
    )
    .eq('organization_id', input.organizationId)
    .eq('id', input.planId)
    .is('payment_link_id', null)
    .maybeSingle()

  if (error) throw new Error('Nao foi possivel localizar o plano interno.')
  if (!data) throw new Error('Plano interno nao encontrado.')
  return data
}

async function getInternalSubscriptionRow(input: { supabase: SupabaseLike; organizationId: string; subscriptionId: string }) {
  const { data, error } = await input.supabase
    .from('pay_assinatura')
    .select(
      'id, plano_id, pagador_id, recebedor_id, status, next_charge_at, last_charge_at, canceled_at, created_at, updated_at, joined_at, paused_at, resumed_at, expires_at, billing_cycles_completed, internal_notes',
    )
    .eq('organization_id', input.organizationId)
    .eq('id', input.subscriptionId)
    .maybeSingle()

  if (error) throw new Error('Nao foi possivel localizar a assinatura interna.')
  if (!data) throw new Error('Assinatura interna nao encontrada.')
  return data
}

function toPlanDraftFromRow(row: any): SubscriptionPlanDraft {
  return normalizeSubscriptionPlanDraft({
    id: row.id,
    receiverId: row.recebedor_id,
    name: row.name,
    description: row.description,
    amountCents: Number(row.amount_centavos ?? 0),
    currency: row.currency ?? 'BRL',
    cycle: row.cycle ?? 'monthly',
    trialDays: Number(row.trial_days ?? 0),
    billingCyclesLimit: row.billing_cycles_limit == null ? null : Number(row.billing_cycles_limit),
    isInfinite: Boolean(row.is_infinite ?? true),
    status: row.status ?? 'draft',
    startsAt: toDateOnly(row.starts_at),
    endsAt: toDateOnly(row.ends_at),
    internalNotes: row.internal_notes,
  })
}

async function upsertCustomer(input: {
  supabase: SupabaseLike
  organizationId: string
  customer: SubscriptionInternalDraft['customer']
}) {
  if (input.customer.id) {
    const { data: existingById, error } = await input.supabase
      .from('pay_pagador')
      .update({
        name: input.customer.name,
        email: input.customer.email,
        document: input.customer.document,
        phone: input.customer.phone,
      })
      .eq('organization_id', input.organizationId)
      .eq('id', input.customer.id)
      .select('id, name, email, document, phone, created_at, updated_at')
      .maybeSingle()
    if (error) throw new Error('Nao foi possivel atualizar o cliente desta assinatura.')
    if (existingById) return existingById
  }

  let existing = null
  if (input.customer.document) {
    const { data } = await input.supabase
      .from('pay_pagador')
      .select('id, name, email, document, phone, created_at, updated_at')
      .eq('organization_id', input.organizationId)
      .eq('document', input.customer.document)
      .maybeSingle()
    existing = data ?? null
  } else if (input.customer.email) {
    const { data } = await input.supabase
      .from('pay_pagador')
      .select('id, name, email, document, phone, created_at, updated_at')
      .eq('organization_id', input.organizationId)
      .eq('email', input.customer.email)
      .maybeSingle()
    existing = data ?? null
  }

  if (existing?.id) {
    const { data, error } = await input.supabase
      .from('pay_pagador')
      .update({
        name: input.customer.name,
        email: input.customer.email,
        document: input.customer.document,
        phone: input.customer.phone,
      })
      .eq('organization_id', input.organizationId)
      .eq('id', existing.id)
      .select('id, name, email, document, phone, created_at, updated_at')
      .single()
    if (error) throw new Error('Nao foi possivel atualizar o cadastro do cliente.')
    return data
  }

  const { data, error } = await input.supabase
    .from('pay_pagador')
    .insert({
      organization_id: input.organizationId,
      name: input.customer.name,
      email: input.customer.email,
      document: input.customer.document,
      phone: input.customer.phone,
      card_token_ref: null,
    })
    .select('id, name, email, document, phone, created_at, updated_at')
    .single()

  if (error) throw new Error('Nao foi possivel cadastrar o cliente desta assinatura.')
  return data
}

export async function listSubscriptionsInternal(input: { supabase: SupabaseLike; organizationId: string }) {
  const [planRows, customerRows, eligibleReceivers] = await Promise.all([
    loadInternalPlanRows(input.supabase, input.organizationId),
    loadCustomerRows(input.supabase, input.organizationId),
    loadSubscriptionEligibleReceivers(input.supabase, input.organizationId),
  ])

  const subscriptionRows = await loadInternalSubscriptionRows(
    input.supabase,
    input.organizationId,
    planRows.map((row) => String(row.id)),
  )

  const receiverMap = new Map(eligibleReceivers.map((receiver) => [receiver.id, receiver]))
  const customerMap = new Map(customerRows.map((row) => [String(row.id), mapCustomer(row)]))
  const planMap = new Map(planRows.map((row) => [String(row.id), mapPlan(row, receiverMap)]))

  return {
    plans: planRows.map((row) => mapPlan(row, receiverMap)),
    customers: customerRows.map(mapCustomer),
    subscriptions: subscriptionRows.map((row) => mapSubscription(row, planMap, customerMap, receiverMap)),
    eligibleReceivers,
  }
}

export async function getSubscriptionsInternalBootstrap(input: {
  supabase: SupabaseLike
  organizationId: string
  providerEnabled: boolean
}) {
  const out = await listSubscriptionsInternal({ supabase: input.supabase, organizationId: input.organizationId })
  return {
    ...out,
    providerEnabled: input.providerEnabled,
  }
}

export async function createSubscriptionPlanInternal(input: {
  supabase: SupabaseLike
  organizationId: string
  actorProfileId: string
  rawDraft: unknown
}) {
  const draft = normalizeSubscriptionPlanDraft(input.rawDraft)
  const eligibleReceivers = await loadSubscriptionEligibleReceivers(input.supabase, input.organizationId)
  const issues = getSubscriptionPlanIssues({ draft, eligibleReceivers })
  if (issues.length) throw new Error(issues[0].message)

  const { data, error } = await input.supabase
    .from('pay_plano')
    .insert({
      organization_id: input.organizationId,
      recebedor_id: draft.receiverId,
      payment_link_id: null,
      name: draft.name,
      description: draft.description,
      amount_centavos: draft.amountCents,
      currency: draft.currency,
      cycle: draft.cycle,
      trial_days: draft.trialDays,
      payment_method: 'card',
      billing_cycles_limit: draft.isInfinite ? null : draft.billingCyclesLimit,
      is_infinite: draft.isInfinite,
      status: draft.status,
      starts_at: toStartOfDayIso(draft.startsAt),
      ends_at: toEndOfDayIso(draft.endsAt),
      internal_notes: draft.internalNotes,
    })
    .select(
      'id, recebedor_id, payment_link_id, name, description, amount_centavos, currency, cycle, trial_days, billing_cycles_limit, is_infinite, status, starts_at, ends_at, internal_notes, created_at, updated_at',
    )
    .single()

  if (error) throw new Error('Nao foi possivel criar o plano interno.')

  await insertSubscriptionsInternalAuditLog({
    supabase: input.supabase,
    organizationId: input.organizationId,
    actorProfileId: input.actorProfileId,
    action: 'CREATE',
    entity: 'subscription_plan_internal',
    entityId: data.id as string,
    before: null,
    after: data,
  })

  const receiverMap = new Map(eligibleReceivers.map((receiver) => [receiver.id, receiver]))
  return mapPlan(data, receiverMap)
}

export async function updateSubscriptionPlanInternal(input: {
  supabase: SupabaseLike
  organizationId: string
  actorProfileId: string
  planId: string
  rawDraft: unknown
}) {
  const before = await getInternalPlanRow({ supabase: input.supabase, organizationId: input.organizationId, planId: input.planId })
  const rawDraft = typeof input.rawDraft === 'object' && input.rawDraft ? (input.rawDraft as Record<string, unknown>) : {}
  const draft = normalizeSubscriptionPlanDraft({ ...rawDraft, id: input.planId })
  const eligibleReceivers = await loadSubscriptionEligibleReceivers(input.supabase, input.organizationId)
  const issues = getSubscriptionPlanIssues({ draft, eligibleReceivers })
  if (issues.length) throw new Error(issues[0].message)

  const nextStatus = draft.status
  const { data, error } = await input.supabase
    .from('pay_plano')
    .update({
      recebedor_id: draft.receiverId,
      name: draft.name,
      description: draft.description,
      amount_centavos: draft.amountCents,
      currency: draft.currency,
      cycle: draft.cycle,
      trial_days: draft.trialDays,
      billing_cycles_limit: draft.isInfinite ? null : draft.billingCyclesLimit,
      is_infinite: draft.isInfinite,
      status: nextStatus,
      starts_at: toStartOfDayIso(draft.startsAt),
      ends_at: toEndOfDayIso(draft.endsAt),
      internal_notes: draft.internalNotes,
    })
    .eq('organization_id', input.organizationId)
    .eq('id', input.planId)
    .is('payment_link_id', null)
    .select(
      'id, recebedor_id, payment_link_id, name, description, amount_centavos, currency, cycle, trial_days, billing_cycles_limit, is_infinite, status, starts_at, ends_at, internal_notes, created_at, updated_at',
    )
    .single()

  if (error) throw new Error('Nao foi possivel atualizar o plano interno.')

  const action =
    String((before as any).status) !== nextStatus && nextStatus === 'active'
      ? 'ACTIVATE'
      : String((before as any).status) !== nextStatus && nextStatus === 'inactive'
        ? 'DEACTIVATE'
        : 'UPDATE'

  await insertSubscriptionsInternalAuditLog({
    supabase: input.supabase,
    organizationId: input.organizationId,
    actorProfileId: input.actorProfileId,
    action,
    entity: 'subscription_plan_internal',
    entityId: input.planId,
    before,
    after: data,
  })

  const receiverMap = new Map(eligibleReceivers.map((receiver) => [receiver.id, receiver]))
  return mapPlan(data, receiverMap)
}

export async function duplicateSubscriptionPlanInternal(input: {
  supabase: SupabaseLike
  organizationId: string
  actorProfileId: string
  planId: string
}) {
  const source = await getInternalPlanRow({ supabase: input.supabase, organizationId: input.organizationId, planId: input.planId })
  const clone = await createSubscriptionPlanInternal({
    supabase: input.supabase,
    organizationId: input.organizationId,
    actorProfileId: input.actorProfileId,
    rawDraft: {
      receiverId: source.recebedor_id,
      name: `${source.name} - copia`,
      description: source.description,
      amountCents: Number(source.amount_centavos ?? 0),
      currency: source.currency ?? 'BRL',
      cycle: source.cycle,
      trialDays: Number(source.trial_days ?? 0),
      billingCyclesLimit: source.billing_cycles_limit == null ? null : Number(source.billing_cycles_limit),
      isInfinite: Boolean(source.is_infinite ?? true),
      status: 'draft',
      startsAt: toDateOnly(source.starts_at),
      endsAt: toDateOnly(source.ends_at),
      internalNotes: source.internal_notes,
    },
  })
  return clone
}

export async function deleteSubscriptionPlanInternal(input: {
  supabase: SupabaseLike
  organizationId: string
  actorProfileId: string
  planId: string
}) {
  const before = await getInternalPlanRow({ supabase: input.supabase, organizationId: input.organizationId, planId: input.planId })
  const { count, error: countError } = await input.supabase
    .from('pay_assinatura')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', input.organizationId)
    .eq('plano_id', input.planId)
  if (countError) throw new Error('Nao foi possivel validar o uso deste plano.')
  if ((count ?? 0) > 0) throw new Error('Remova ou cancele as assinaturas vinculadas antes de excluir este plano.')

  const { error } = await input.supabase
    .from('pay_plano')
    .delete()
    .eq('organization_id', input.organizationId)
    .eq('id', input.planId)
    .is('payment_link_id', null)
  if (error) throw new Error('Nao foi possivel excluir o plano interno.')

  await insertSubscriptionsInternalAuditLog({
    supabase: input.supabase,
    organizationId: input.organizationId,
    actorProfileId: input.actorProfileId,
    action: 'DELETE',
    entity: 'subscription_plan_internal',
    entityId: input.planId,
    before,
    after: null,
  })

  return { ok: true }
}

export async function simulateSubscriptionInternalDraft(input: {
  supabase: SupabaseLike
  organizationId: string
  rawPlanDraft: unknown
  joinedAt: string | null
}) {
  const draft = normalizeSubscriptionPlanDraft(input.rawPlanDraft)
  const eligibleReceivers = await loadSubscriptionEligibleReceivers(input.supabase, input.organizationId)
  const issues = getSubscriptionPlanIssues({ draft, eligibleReceivers })
  if (issues.length) return { ok: false, issues, simulation: null }
  return { ok: true, issues: [] as SubscriptionInternalValidationIssue[], simulation: simulateSubscriptionInternal({ planDraft: draft, joinedAt: input.joinedAt }) }
}

export async function createSubscriptionInternal(input: {
  supabase: SupabaseLike
  organizationId: string
  actorProfileId: string
  rawDraft: unknown
  providerEnabled: boolean
}) {
  const draft = normalizeSubscriptionInternalDraft(input.rawDraft)
  const [eligibleReceivers, planRows] = await Promise.all([
    loadSubscriptionEligibleReceivers(input.supabase, input.organizationId),
    loadInternalPlanRows(input.supabase, input.organizationId),
  ])
  const mappedPlans = planRows.map((row) => {
    const planDraft = toPlanDraftFromRow(row)
    return {
      id: String(row.id),
      receiverId: planDraft.receiverId,
      status: planDraft.status,
      cycle: planDraft.cycle,
      trialDays: planDraft.trialDays,
      billingCyclesLimit: planDraft.billingCyclesLimit,
      isInfinite: planDraft.isInfinite,
      startsAt: planDraft.startsAt,
      endsAt: planDraft.endsAt,
    }
  })
  const issues = getSubscriptionInternalIssues({
    draft,
    plans: mappedPlans,
    eligibleReceivers,
    providerEnabled: input.providerEnabled,
  })
  if (issues.length) throw new Error(issues[0].message)

  const selectedPlanRow = planRows.find((row) => String(row.id) === draft.planId)
  if (!selectedPlanRow) throw new Error('Plano interno nao encontrado.')
  const selectedPlanDraft = toPlanDraftFromRow(selectedPlanRow)
  const simulation = simulateSubscriptionInternal({ planDraft: selectedPlanDraft, joinedAt: draft.joinedAt })
  const customerRow = await upsertCustomer({ supabase: input.supabase, organizationId: input.organizationId, customer: draft.customer })

  const { data, error } = await input.supabase
    .from('pay_assinatura')
    .insert({
      organization_id: input.organizationId,
      plano_id: draft.planId,
      pagador_id: customerRow.id,
      recebedor_id: selectedPlanRow.recebedor_id,
      status: draft.status,
      next_charge_at: toStartOfDayIso(draft.nextChargeAt) ?? simulation.summary.nextChargeAt,
      attempts_failed: 0,
      acquirer_subscription_id: null,
      last_charge_at: toStartOfDayIso(draft.lastChargeAt),
      canceled_at: draft.status === 'cancelled' ? new Date().toISOString() : null,
      payment_method: 'card',
      joined_at: toStartOfDayIso(draft.joinedAt ?? new Date().toISOString().slice(0, 10)),
      paused_at: draft.status === 'paused' ? new Date().toISOString() : null,
      resumed_at: null,
      expires_at: simulation.summary.estimatedExpiryAt,
      billing_cycles_completed: 0,
      internal_notes: draft.internalNotes,
    })
    .select(
      'id, plano_id, pagador_id, recebedor_id, status, next_charge_at, last_charge_at, canceled_at, created_at, updated_at, joined_at, paused_at, resumed_at, expires_at, billing_cycles_completed, internal_notes',
    )
    .single()

  if (error) throw new Error('Nao foi possivel criar a assinatura interna.')

  await insertSubscriptionsInternalAuditLog({
    supabase: input.supabase,
    organizationId: input.organizationId,
    actorProfileId: input.actorProfileId,
    action: 'CREATE',
    entity: 'subscription_internal',
    entityId: data.id as string,
    before: null,
    after: data,
  })

  const receiverMap = new Map(eligibleReceivers.map((receiver) => [receiver.id, receiver]))
  const mappedPlan = mapPlan(selectedPlanRow, receiverMap)
  const customerMap = new Map([[String(customerRow.id), mapCustomer(customerRow)]])
  const planMap = new Map([[mappedPlan.id, mappedPlan]])
  return mapSubscription(data, planMap, customerMap, receiverMap)
}

export async function updateSubscriptionInternal(input: {
  supabase: SupabaseLike
  organizationId: string
  actorProfileId: string
  subscriptionId: string
  rawDraft: unknown
  providerEnabled: boolean
}) {
  const before = await getInternalSubscriptionRow({
    supabase: input.supabase,
    organizationId: input.organizationId,
    subscriptionId: input.subscriptionId,
  })
  const rawDraft = typeof input.rawDraft === 'object' && input.rawDraft ? (input.rawDraft as Record<string, unknown>) : {}
  const draft = normalizeSubscriptionInternalDraft({ ...rawDraft, id: input.subscriptionId, planId: rawDraft.planId ?? before.plano_id })
  const [eligibleReceivers, planRows] = await Promise.all([
    loadSubscriptionEligibleReceivers(input.supabase, input.organizationId),
    loadInternalPlanRows(input.supabase, input.organizationId),
  ])
  const mappedPlans = planRows.map((row) => {
    const planDraft = toPlanDraftFromRow(row)
    return {
      id: String(row.id),
      receiverId: planDraft.receiverId,
      status: planDraft.status,
      cycle: planDraft.cycle,
      trialDays: planDraft.trialDays,
      billingCyclesLimit: planDraft.billingCyclesLimit,
      isInfinite: planDraft.isInfinite,
      startsAt: planDraft.startsAt,
      endsAt: planDraft.endsAt,
    }
  })
  const issues = getSubscriptionInternalIssues({
    draft,
    plans: mappedPlans,
    eligibleReceivers,
    providerEnabled: input.providerEnabled,
  })
  if (issues.length) throw new Error(issues[0].message)

  const selectedPlanRow = planRows.find((row) => String(row.id) === draft.planId)
  if (!selectedPlanRow) throw new Error('Plano interno nao encontrado.')
  const selectedPlanDraft = toPlanDraftFromRow(selectedPlanRow)
  const simulation = simulateSubscriptionInternal({ planDraft: selectedPlanDraft, joinedAt: draft.joinedAt })
  const customerRow = await upsertCustomer({ supabase: input.supabase, organizationId: input.organizationId, customer: draft.customer })

  const previousStatus = String(before.status ?? 'draft') as SubscriptionInternalStatus
  const nextStatus = draft.status
  const action =
    previousStatus !== nextStatus && nextStatus === 'paused'
      ? 'PAUSE'
      : previousStatus !== nextStatus && nextStatus === 'cancelled'
        ? 'CANCEL'
        : previousStatus !== nextStatus && (nextStatus === 'active' || nextStatus === 'trial')
          ? 'RESUME'
          : 'UPDATE'

  const { data, error } = await input.supabase
    .from('pay_assinatura')
    .update({
      plano_id: draft.planId,
      pagador_id: customerRow.id,
      recebedor_id: selectedPlanRow.recebedor_id,
      status: nextStatus,
      next_charge_at: toStartOfDayIso(draft.nextChargeAt) ?? simulation.summary.nextChargeAt,
      last_charge_at: toStartOfDayIso(draft.lastChargeAt),
      canceled_at: nextStatus === 'cancelled' ? new Date().toISOString() : null,
      joined_at: toStartOfDayIso(draft.joinedAt ?? new Date().toISOString().slice(0, 10)),
      paused_at: nextStatus === 'paused' ? new Date().toISOString() : null,
      resumed_at: action === 'RESUME' ? new Date().toISOString() : null,
      expires_at: simulation.summary.estimatedExpiryAt,
      internal_notes: draft.internalNotes,
    })
    .eq('organization_id', input.organizationId)
    .eq('id', input.subscriptionId)
    .select(
      'id, plano_id, pagador_id, recebedor_id, status, next_charge_at, last_charge_at, canceled_at, created_at, updated_at, joined_at, paused_at, resumed_at, expires_at, billing_cycles_completed, internal_notes',
    )
    .single()

  if (error) throw new Error('Nao foi possivel atualizar a assinatura interna.')

  await insertSubscriptionsInternalAuditLog({
    supabase: input.supabase,
    organizationId: input.organizationId,
    actorProfileId: input.actorProfileId,
    action,
    entity: 'subscription_internal',
    entityId: input.subscriptionId,
    before,
    after: data,
  })

  const receiverMap = new Map(eligibleReceivers.map((receiver) => [receiver.id, receiver]))
  const mappedPlan = mapPlan(selectedPlanRow, receiverMap)
  const customerMap = new Map([[String(customerRow.id), mapCustomer(customerRow)]])
  const planMap = new Map([[mappedPlan.id, mappedPlan]])
  return mapSubscription(data, planMap, customerMap, receiverMap)
}

export async function deleteSubscriptionInternal(input: {
  supabase: SupabaseLike
  organizationId: string
  actorProfileId: string
  subscriptionId: string
}) {
  const before = await getInternalSubscriptionRow({
    supabase: input.supabase,
    organizationId: input.organizationId,
    subscriptionId: input.subscriptionId,
  })
  if (!['draft', 'cancelled', 'expired'].includes(String(before.status ?? 'draft'))) {
    throw new Error('Somente assinaturas em rascunho, canceladas ou expiradas podem ser excluidas.')
  }

  const { error } = await input.supabase
    .from('pay_assinatura')
    .delete()
    .eq('organization_id', input.organizationId)
    .eq('id', input.subscriptionId)
  if (error) throw new Error('Nao foi possivel excluir a assinatura interna.')

  await insertSubscriptionsInternalAuditLog({
    supabase: input.supabase,
    organizationId: input.organizationId,
    actorProfileId: input.actorProfileId,
    action: 'DELETE',
    entity: 'subscription_internal',
    entityId: input.subscriptionId,
    before,
    after: null,
  })

  return { ok: true }
}

export function toSubscriptionsInternalValidationResponse(issues: SubscriptionInternalValidationIssue[]) {
  return {
    ok: issues.length === 0,
    issues,
  }
}

export function isValidPlanStatus(status: unknown): status is SubscriptionPlanStatus {
  return SUBSCRIPTION_PLAN_STATUSES.includes(String(status ?? '') as SubscriptionPlanStatus)
}

export function isValidSubscriptionStatus(status: unknown): status is SubscriptionInternalStatus {
  return SUBSCRIPTION_INTERNAL_STATUSES.includes(String(status ?? '') as SubscriptionInternalStatus)
}

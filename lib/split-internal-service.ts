import {
  areDateRangesOverlapping,
  assertSplitInternalDraft,
  getSplitInternalDraftIssues,
  normalizeSplitInternalDraft,
  simulateInternalSplit,
  toEndOfDayIso,
  toStartOfDayIso,
  type SplitEligibleReceiver,
  type SplitInternalConfigDraft,
  type SplitInternalValidationIssue,
} from '@/lib/split-internal-core'

type SupabaseLike = any
type SplitInternalServiceDeps = {
  insertAuditLogFn?: (input: any) => Promise<unknown>
  loadPayTaxaConfigFn?: (supabase: SupabaseLike, organizationId: string) => Promise<any>
}

async function defaultInsertAuditLog(input: any) {
  const { insertAuditLog } = await import('@/lib/audit-log')
  return insertAuditLog(input)
}

async function defaultLoadPayTaxaConfig(supabase: SupabaseLike, organizationId: string) {
  const { loadPayTaxaConfig } = await import('@/lib/split-service')
  return loadPayTaxaConfig(supabase, organizationId)
}

function toDateOnly(input: unknown) {
  if (typeof input !== 'string') return null
  return input.slice(0, 10)
}

function mapReceiverForSplit(row: any): SplitEligibleReceiver {
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

function mapRuleRow(row: any, receiverMap: Map<string, SplitEligibleReceiver>) {
  const receiverId = String(row.receiver_id)
  const receiver = receiverMap.get(receiverId)
  return {
    id: String(row.id),
    receiverId,
    type: row.type === 'fixed' ? 'fixed' : 'percentage',
    valueCents: row.value_cents == null ? null : Number(row.value_cents),
    percentageBps: row.percentage_bps == null ? null : Number(row.percentage_bps),
    priority: Number(row.priority ?? 0),
    status: String(row.status ?? 'active'),
    receiver: receiver
      ? {
          id: receiver.id,
          name: receiver.name,
          document: receiver.document,
          type: receiver.type,
          status: receiver.status,
          kyc_status: receiver.kycStatus,
          internal_status: receiver.internalStatus,
        }
      : null,
  }
}

function mapConfigRow(row: any, rules: any[], receiverMap: Map<string, SplitEligibleReceiver>) {
  const mainReceiverId = String(row.main_receiver_id)
  const mainReceiver = receiverMap.get(mainReceiverId)
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    status: String(row.status ?? 'inactive'),
    mainReceiverId,
    mainReceiver: mainReceiver
      ? {
          id: mainReceiver.id,
          name: mainReceiver.name,
          document: mainReceiver.document,
          type: mainReceiver.type,
          status: mainReceiver.status,
          kyc_status: mainReceiver.kycStatus,
          internal_status: mainReceiver.internalStatus,
        }
      : null,
    validFrom: toDateOnly(row.valid_from),
    validUntil: toDateOnly(row.valid_until),
    internalNotes: typeof row.internal_notes === 'string' ? row.internal_notes : null,
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
    ruleCount: rules.length,
    rules,
  }
}

function buildSplitRuleInsertRows(input: { organizationId: string; splitConfigId: string; rules: SplitInternalConfigDraft['rules'] }) {
  return input.rules.map((rule) => ({
    organization_id: input.organizationId,
    split_config_id: input.splitConfigId,
    receiver_id: rule.receiverId,
    payment_link_id: null,
    type: rule.type,
    value: rule.type === 'fixed' ? Number(rule.valueCents ?? 0) : Number((rule.percentageBps ?? 0) / 100),
    value_cents: rule.type === 'fixed' ? Number(rule.valueCents ?? 0) : null,
    percentage_bps: rule.type === 'percentage' ? Number(rule.percentageBps ?? 0) : null,
    priority: Number(rule.priority ?? 0),
    status: 'active',
  }))
}

export async function loadSplitEligibleReceivers(supabase: SupabaseLike, organizationId: string) {
  const { data, error } = await supabase
    .from('receivers')
    .select('id, name, document, type, status, kyc_status, internal_status')
    .eq('organization_id', organizationId)
    .eq('status', 'active')
    .eq('kyc_status', 'approved')
    .order('created_at', { ascending: false })

  if (error) throw new Error('Não foi possível carregar os recebedores elegíveis para split.')
  return (Array.isArray(data) ? data : []).map(mapReceiverForSplit)
}

async function hasOverlappingActiveConfig(input: {
  supabase: SupabaseLike
  organizationId: string
  mainReceiverId: string
  validFrom: string | null
  validUntil: string | null
  ignoreConfigId?: string | null
}) {
  let query = input.supabase
    .from('split_configs')
    .select('id, valid_from, valid_until')
    .eq('organization_id', input.organizationId)
    .eq('main_receiver_id', input.mainReceiverId)
    .eq('status', 'active')

  if (input.ignoreConfigId) query = query.neq('id', input.ignoreConfigId)

  const { data, error } = await query
  if (error) throw new Error('Não foi possível validar conflitos de split.')

  for (const row of data ?? []) {
    if (
      areDateRangesOverlapping({
        startA: input.validFrom,
        endA: input.validUntil,
        startB: toDateOnly((row as any).valid_from),
        endB: toDateOnly((row as any).valid_until),
      })
    ) {
      return true
    }
  }

  return false
}

export async function validateSplitConfigDraft(input: {
  supabase: SupabaseLike
  organizationId: string
  rawDraft: unknown
  ignoreConfigId?: string | null
}) {
  const draft = normalizeSplitInternalDraft(input.rawDraft)
  const eligibleReceivers = await loadSplitEligibleReceivers(input.supabase, input.organizationId)
  const overlappingActiveConfig =
    draft.status === 'active' && draft.mainReceiverId
      ? await hasOverlappingActiveConfig({
          supabase: input.supabase,
          organizationId: input.organizationId,
          mainReceiverId: draft.mainReceiverId,
          validFrom: draft.validFrom,
          validUntil: draft.validUntil,
          ignoreConfigId: input.ignoreConfigId ?? null,
        })
      : false

  const issues = getSplitInternalDraftIssues({
    draft,
    eligibleReceivers,
    overlappingActiveConfig,
  })

  return {
    draft,
    eligibleReceivers,
    issues,
    ok: issues.length === 0,
  }
}

export async function listSplitConfigs(input: { supabase: SupabaseLike; organizationId: string }) {
  const [configsRes, rulesRes, receivers] = await Promise.all([
    input.supabase
      .from('split_configs')
      .select('id, name, main_receiver_id, status, valid_from, valid_until, internal_notes, created_at, updated_at')
      .eq('organization_id', input.organizationId)
      .order('created_at', { ascending: false }),
    input.supabase
      .from('split_rules')
      .select('id, split_config_id, receiver_id, type, value_cents, percentage_bps, priority, status')
      .eq('organization_id', input.organizationId)
      .not('split_config_id', 'is', null)
      .order('priority', { ascending: false }),
    loadSplitEligibleReceivers(input.supabase, input.organizationId),
  ])

  if (configsRes.error) throw new Error('Não foi possível carregar as configurações de split.')
  if (rulesRes.error) throw new Error('Não foi possível carregar as regras de split.')

  const receiverMap = new Map(receivers.map((receiver) => [receiver.id, receiver]))
  const rulesByConfig = new Map<string, any[]>()

  for (const row of rulesRes.data ?? []) {
    const configId = String((row as any).split_config_id)
    const list = rulesByConfig.get(configId) ?? []
    list.push(mapRuleRow(row, receiverMap))
    rulesByConfig.set(configId, list)
  }

  return {
    splitConfigs: (configsRes.data ?? []).map((row: any) => mapConfigRow(row, rulesByConfig.get(String(row.id)) ?? [], receiverMap)),
    eligibleReceivers: receivers,
  }
}

export async function getSplitConfigById(input: { supabase: SupabaseLike; organizationId: string; id: string }) {
  const [configRes, rulesRes, receivers] = await Promise.all([
    input.supabase
      .from('split_configs')
      .select('id, name, main_receiver_id, status, valid_from, valid_until, internal_notes, created_at, updated_at')
      .eq('organization_id', input.organizationId)
      .eq('id', input.id)
      .maybeSingle(),
    input.supabase
      .from('split_rules')
      .select('id, split_config_id, receiver_id, type, value_cents, percentage_bps, priority, status')
      .eq('organization_id', input.organizationId)
      .eq('split_config_id', input.id)
      .order('priority', { ascending: false }),
    loadSplitEligibleReceivers(input.supabase, input.organizationId),
  ])

  if (configRes.error) throw new Error('Não foi possível carregar a configuração de split.')
  if (!configRes.data) throw new Error('Regra não encontrada.')
  if (rulesRes.error) throw new Error('Não foi possível carregar as regras de split.')

  const receiverMap = new Map(receivers.map((receiver) => [receiver.id, receiver]))
  const rules = (rulesRes.data ?? []).map((row: any) => mapRuleRow(row, receiverMap))
  return mapConfigRow(configRes.data, rules, receiverMap)
}

export async function createSplitConfig(input: {
  supabase: SupabaseLike
  organizationId: string
  actorProfileId: string
  rawDraft: unknown
  deps?: SplitInternalServiceDeps
}) {
  const validation = await validateSplitConfigDraft({
    supabase: input.supabase,
    organizationId: input.organizationId,
    rawDraft: input.rawDraft,
  })

  assertSplitInternalDraft({
    draft: validation.draft,
    eligibleReceivers: validation.eligibleReceivers,
    overlappingActiveConfig: validation.issues.some((issue) => issue.field === 'validity' && issue.message.includes('Já existe outra configuração ativa')),
  })

  const configInsert = await input.supabase
    .from('split_configs')
    .insert({
      organization_id: input.organizationId,
      name: validation.draft.name,
      main_receiver_id: validation.draft.mainReceiverId,
      status: validation.draft.status,
      valid_from: toStartOfDayIso(validation.draft.validFrom),
      valid_until: toEndOfDayIso(validation.draft.validUntil),
      internal_notes: validation.draft.internalNotes,
    })
    .select('id')
    .single()

  if (configInsert.error) throw new Error('Não foi possível criar a configuração de split agora.')

  const splitConfigId = String(configInsert.data.id)
  const rulesInsert = await input.supabase.from('split_rules').insert(
    buildSplitRuleInsertRows({
      organizationId: input.organizationId,
      splitConfigId,
      rules: validation.draft.rules,
    }),
  )

  if (rulesInsert.error) {
    await input.supabase.from('split_configs').delete().eq('organization_id', input.organizationId).eq('id', splitConfigId)
    throw new Error('Não foi possível salvar as regras de split agora.')
  }

  const created = await getSplitConfigById({
    supabase: input.supabase,
    organizationId: input.organizationId,
    id: splitConfigId,
  })

  const insertAuditLogFn = input.deps?.insertAuditLogFn ?? defaultInsertAuditLog

  await insertAuditLogFn({
    organizationId: input.organizationId,
    actorProfileId: input.actorProfileId,
    actorUserId: input.actorProfileId,
    authType: 'api_key',
    origin: 'internal_api',
    action: 'CREATE',
    entity: 'split_config',
    entityId: splitConfigId,
    before: null,
    after: created,
  })

  return created
}

export async function updateSplitConfig(input: {
  supabase: SupabaseLike
  organizationId: string
  actorProfileId: string
  id: string
  rawDraft: unknown
  deps?: SplitInternalServiceDeps
}) {
  const before = await getSplitConfigById({
    supabase: input.supabase,
    organizationId: input.organizationId,
    id: input.id,
  })

  const validation = await validateSplitConfigDraft({
    supabase: input.supabase,
    organizationId: input.organizationId,
    rawDraft: input.rawDraft,
    ignoreConfigId: input.id,
  })

  assertSplitInternalDraft({
    draft: validation.draft,
    eligibleReceivers: validation.eligibleReceivers,
    overlappingActiveConfig: validation.issues.some((issue) => issue.field === 'validity' && issue.message.includes('Já existe outra configuração ativa')),
  })

  const previousRulesRes = await input.supabase
    .from('split_rules')
    .select('id, organization_id, split_config_id, receiver_id, payment_link_id, type, value, value_cents, percentage_bps, priority, status')
    .eq('organization_id', input.organizationId)
    .eq('split_config_id', input.id)

  if (previousRulesRes.error) throw new Error('Não foi possível atualizar a configuração de split agora.')
  const previousRules = Array.isArray(previousRulesRes.data) ? previousRulesRes.data : []

  const configUpdate = await input.supabase
    .from('split_configs')
    .update({
      name: validation.draft.name,
      main_receiver_id: validation.draft.mainReceiverId,
      status: validation.draft.status,
      valid_from: toStartOfDayIso(validation.draft.validFrom),
      valid_until: toEndOfDayIso(validation.draft.validUntil),
      internal_notes: validation.draft.internalNotes,
    })
    .eq('organization_id', input.organizationId)
    .eq('id', input.id)

  if (configUpdate.error) throw new Error('Não foi possível atualizar a configuração de split agora.')

  const deleteExistingRules = await input.supabase.from('split_rules').delete().eq('organization_id', input.organizationId).eq('split_config_id', input.id)
  if (deleteExistingRules.error) throw new Error('Não foi possível atualizar as regras de split agora.')

  const insertRules = await input.supabase.from('split_rules').insert(
    buildSplitRuleInsertRows({
      organizationId: input.organizationId,
      splitConfigId: input.id,
      rules: validation.draft.rules,
    }),
  )

  if (insertRules.error) {
    await input.supabase.from('split_rules').delete().eq('organization_id', input.organizationId).eq('split_config_id', input.id)
    if (previousRules.length) await input.supabase.from('split_rules').insert(previousRules)
    throw new Error('Não foi possível atualizar as regras de split agora.')
  }

  const updated = await getSplitConfigById({
    supabase: input.supabase,
    organizationId: input.organizationId,
    id: input.id,
  })

  const insertAuditLogFn = input.deps?.insertAuditLogFn ?? defaultInsertAuditLog

  await insertAuditLogFn({
    organizationId: input.organizationId,
    actorProfileId: input.actorProfileId,
    actorUserId: input.actorProfileId,
    authType: 'api_key',
    origin: 'internal_api',
    action: 'UPDATE',
    entity: 'split_config',
    entityId: input.id,
    before,
    after: updated,
  })

  return updated
}

export async function updateSplitConfigStatus(input: {
  supabase: SupabaseLike
  organizationId: string
  actorProfileId: string
  id: string
  status: 'active' | 'inactive'
  deps?: SplitInternalServiceDeps
}) {
  const before = await getSplitConfigById({
    supabase: input.supabase,
    organizationId: input.organizationId,
    id: input.id,
  })

  if (input.status === 'active') {
    const overlappingActiveConfig = await hasOverlappingActiveConfig({
      supabase: input.supabase,
      organizationId: input.organizationId,
      mainReceiverId: before.mainReceiverId,
      validFrom: before.validFrom,
      validUntil: before.validUntil,
      ignoreConfigId: input.id,
    })
    if (overlappingActiveConfig) {
      throw new Error('Já existe outra configuração ativa de split para este recebedor principal no mesmo período.')
    }
  }

  const { error } = await input.supabase
    .from('split_configs')
    .update({ status: input.status })
    .eq('organization_id', input.organizationId)
    .eq('id', input.id)

  if (error) throw new Error('Não foi possível atualizar o status do split agora.')

  const updated = await getSplitConfigById({
    supabase: input.supabase,
    organizationId: input.organizationId,
    id: input.id,
  })

  const insertAuditLogFn = input.deps?.insertAuditLogFn ?? defaultInsertAuditLog

  await insertAuditLogFn({
    organizationId: input.organizationId,
    actorProfileId: input.actorProfileId,
    actorUserId: input.actorProfileId,
    authType: 'api_key',
    origin: 'internal_api',
    action: input.status === 'active' ? 'ACTIVATE' : 'DEACTIVATE',
    entity: 'split_config',
    entityId: input.id,
    before,
    after: updated,
  })

  return updated
}

export async function deleteSplitConfig(input: {
  supabase: SupabaseLike
  organizationId: string
  actorProfileId: string
  id: string
  deps?: SplitInternalServiceDeps
}) {
  const before = await getSplitConfigById({
    supabase: input.supabase,
    organizationId: input.organizationId,
    id: input.id,
  })

  const { error } = await input.supabase.from('split_configs').delete().eq('organization_id', input.organizationId).eq('id', input.id)
  if (error) throw new Error('Não foi possível excluir a configuração de split agora.')

  const insertAuditLogFn = input.deps?.insertAuditLogFn ?? defaultInsertAuditLog

  await insertAuditLogFn({
    organizationId: input.organizationId,
    actorProfileId: input.actorProfileId,
    actorUserId: input.actorProfileId,
    authType: 'api_key',
    origin: 'internal_api',
    action: 'DELETE',
    entity: 'split_config',
    entityId: input.id,
    before,
    after: null,
  })

  return { ok: true as const }
}

export async function simulateSplitConfigDraft(input: {
  supabase: SupabaseLike
  organizationId: string
  rawDraft: unknown
  saleAmountCents: number
  deps?: SplitInternalServiceDeps
}) {
  const validation = await validateSplitConfigDraft({
    supabase: input.supabase,
    organizationId: input.organizationId,
    rawDraft: input.rawDraft,
  })
  const loadPayTaxaConfigFn = input.deps?.loadPayTaxaConfigFn ?? defaultLoadPayTaxaConfig
  const taxConfig = await loadPayTaxaConfigFn(input.supabase, input.organizationId)
  const result = simulateInternalSplit({
    saleAmountCents: input.saleAmountCents,
    taxConfig,
    draft: validation.draft,
    eligibleReceivers: validation.eligibleReceivers,
  })
  return {
    ...result,
    draft: validation.draft,
    eligibleReceivers: validation.eligibleReceivers,
  }
}

export function toSplitValidationResponse(issues: SplitInternalValidationIssue[]) {
  return {
    ok: issues.length === 0,
    issues,
    error: issues[0]?.message ?? null,
  }
}

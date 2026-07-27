import crypto from 'crypto'
import { getFinancialEnvironment } from '@/lib/env'

import {
  calculateSplit,
  toBigintCents,
  type PayTaxaConfig,
  type ReceiverConfig,
  type SplitRuleConfig,
} from '@/lib/split-core'

export class InternalPaymentError extends Error {
  status: number
  code: string

  constructor(message: string, options?: { status?: number; code?: string }) {
    super(message)
    this.name = 'InternalPaymentError'
    this.status = options?.status ?? 400
    this.code = options?.code ?? 'internal_payment_error'
  }
}

export type CheckoutPaymentLinkRecord = {
  id: string
  organization_id: string
  amount: number
  currency: string
  name: string
  description: string | null
  type: string
  methods: Record<string, unknown> | null
  max_installments: number | null
  status: string
  slug: string
  metadata?: Record<string, unknown> | null
}

export type InternalSplitSnapshot = {
  gross_amount: number
  connekt_fee_amount: number
  receiver_total_amount: number
  currency: 'BRL'
  validated_total_amount: number
  default_receiver_id: string | null
  tax_config: {
    fee_fixed_amount: number
    fee_percentage_bps: number
    min_fee_amount: number | null
    max_fee_amount: number | null
  } | null
  rules: Array<{
    id: string
    receiver_id: string
    type: 'fixed' | 'percentage'
    value_cents: number | null
    percentage_bps: number | null
    priority: number
  }>
  receivers: Array<{
    receiver_id: string
    status: string
    kyc_status: string
    provider_reference_present: boolean
  }>
  applied_receivers: Array<{
    receiver_id: string
    rule_id: string | null
    priority: number
    amount: number
    percentage_bps: number
  }>
}

export type InternalPaymentRecord = {
  transactionId: string
  publicToken: string | null
  idempotencyKey: string
  status: string
  reused: boolean
  splitSnapshot: InternalSplitSnapshot
}

export type Phase2CheckoutCustomer = {
  name?: string | null
  email?: string | null
  document?: string | null
}

export type CreatePhase2InternalPaymentResult = {
  transaction: InternalPaymentRecord
  amount: number
  currency: 'BRL'
  splitSnapshot: InternalSplitSnapshot
  paySplitRows: Array<Record<string, unknown>>
}

// #region debug-point A:reporter
async function reportSplitInvalidReceiverDebug(input: {
  hypothesisId: 'A' | 'B' | 'C' | 'D' | 'E'
  location: string
  msg: string
  data: Record<string, unknown>
  traceId?: string | null
}) {
  try {
    const fs = await import('node:fs')
    let url = 'http://127.0.0.1:7777/event'
    let sessionId = 'split-invalid-receiver'
    try {
      const env = fs.readFileSync('.dbg/split-invalid-receiver.env', 'utf8')
      url = env.match(/DEBUG_SERVER_URL=(.+)/)?.[1]?.trim() || url
      sessionId = env.match(/DEBUG_SESSION_ID=(.+)/)?.[1]?.trim() || sessionId
    } catch {}
    await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        runId: 'pre-fix',
        hypothesisId: input.hypothesisId,
        location: input.location,
        msg: `[DEBUG] ${input.msg}`,
        data: input.data,
        traceId: input.traceId ?? undefined,
        ts: Date.now(),
      }),
    }).catch(() => null)
  } catch {}
}
// #endregion

function safeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function asMetadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function stripUndefinedValues<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T
}

async function loadPayTaxaConfig(supabase: any, organizationId: string): Promise<PayTaxaConfig | null> {
  const { data } = await supabase
    .from('pay_taxa_config')
    .select('fee_fixed_amount, fee_percentage_bps, min_fee_amount, max_fee_amount, status')
    .eq('organization_id', organizationId)
    .eq('status', 'active')
    .maybeSingle()

  if (!data) return null

  return {
    feeFixedAmount: toBigintCents((data as any).fee_fixed_amount ?? 0),
    feePercentageBps: Number((data as any).fee_percentage_bps ?? 0),
    minFeeAmount: (data as any).min_fee_amount === null ? null : toBigintCents((data as any).min_fee_amount),
    maxFeeAmount: (data as any).max_fee_amount === null ? null : toBigintCents((data as any).max_fee_amount),
  }
}

async function loadSplitRules(supabase: any, input: { organizationId: string; paymentLinkId: string | null }): Promise<SplitRuleConfig[]> {
  let query = supabase
    .from('split_rules')
    .select('id, receiver_id, type, value_cents, percentage_bps, priority, status')
    .eq('organization_id', input.organizationId)
    .eq('status', 'active')
    .order('priority', { ascending: false })

  if (input.paymentLinkId) {
    query = query.eq('payment_link_id', input.paymentLinkId)
  } else {
    query = query.is('payment_link_id', null)
  }

  const { data } = await query
  const rows = Array.isArray(data) ? data : []
  return rows.map((row: any) => ({
    id: String(row.id),
    receiverId: String(row.receiver_id),
    type: row.type === 'fixed' ? 'fixed' : 'percentage',
    valueCents: row.value_cents === null ? null : toBigintCents(row.value_cents),
    percentageBps: row.percentage_bps === null ? null : Number(row.percentage_bps),
    priority: typeof row.priority === 'number' ? row.priority : 0,
  }))
}

async function loadReceivers(supabase: any, input: {
  organizationId: string
  receiverIds: string[]
  provider: string
  providerEnvironment: string
}): Promise<ReceiverConfig[]> {
  if (!input.receiverIds.length) return []

  const { data } = await supabase
    .from('receivers')
    .select('id, provider, provider_environment, provider_reference, status, kyc_status')
    .eq('organization_id', input.organizationId)
    .eq('provider', input.provider)
    .eq('provider_environment', input.providerEnvironment)
    .in('id', input.receiverIds)

  const rows = Array.isArray(data) ? data : []
  return rows.map((row: any) => ({
    id: String(row.id),
    provider: row.provider ? String(row.provider) : null,
    providerEnvironment: row.provider_environment ? String(row.provider_environment) : null,
    providerReference: row.provider_reference ? String(row.provider_reference) : null,
    status: String(row.status ?? 'active'),
    kycStatus: String(row.kyc_status ?? 'pending'),
  }))
}

async function pickDefaultReceiver(supabase: any, input: {
  organizationId: string
  provider: string
  providerEnvironment: string
}): Promise<ReceiverConfig | null> {
  const { data } = await supabase
    .from('receivers')
    .select('id, provider, provider_environment, provider_reference, status, kyc_status, created_at')
    .eq('organization_id', input.organizationId)
    .eq('provider', input.provider)
    .eq('provider_environment', input.providerEnvironment)
    .eq('status', 'active')
    .eq('kyc_status', 'approved')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!data) return null

  return {
    id: String((data as any).id),
    provider: (data as any).provider ? String((data as any).provider) : null,
    providerEnvironment: (data as any).provider_environment ? String((data as any).provider_environment) : null,
    providerReference: (data as any).provider_reference ? String((data as any).provider_reference) : null,
    status: String((data as any).status ?? 'active'),
    kycStatus: String((data as any).kyc_status ?? 'approved'),
  }
}

function readPaymentLinkExpiration(link: CheckoutPaymentLinkRecord) {
  const metadata = asMetadataObject(link.metadata)
  const raw = metadata.expires_at ?? metadata.valid_until ?? null
  const iso = safeString(raw)
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return date
}

export function validateCheckoutPaymentLink(input: {
  link: CheckoutPaymentLinkRecord | null
  method: 'pix' | 'card'
  expectedOrganizationId?: string | null
}) {
  const link = input.link
  if (!link) throw new InternalPaymentError('Link de pagamento não encontrado.', { status: 404, code: 'payment_link_not_found' })
  if (safeString(link.status) !== 'active') {
    throw new InternalPaymentError('Link de pagamento inativo.', { status: 409, code: 'payment_link_inactive' })
  }
  if (!safeString(link.organization_id)) {
    throw new InternalPaymentError('organization_id inválido para o link de pagamento.', { status: 500, code: 'payment_link_invalid_organization' })
  }
  if (input.expectedOrganizationId && link.organization_id !== input.expectedOrganizationId) {
    throw new InternalPaymentError('Link de pagamento não pertence à organização informada.', { status: 404, code: 'payment_link_tenant_mismatch' })
  }
  const metadata = asMetadataObject(link.metadata)
  const runtime = getFinancialEnvironment()
  const linkProviderId = safeString(metadata.provider_id)
  const linkProviderEnvironment = safeString(metadata.provider_environment)
  if (linkProviderId && linkProviderId !== runtime.providerId) {
    throw new InternalPaymentError('Link de pagamento configurado para outro provedor.', { status: 409, code: 'payment_link_provider_mismatch' })
  }
  if (linkProviderEnvironment && linkProviderEnvironment !== runtime.environment) {
    throw new InternalPaymentError('Link de pagamento pertence a outro ambiente financeiro.', { status: 409, code: 'payment_link_environment_mismatch' })
  }
  if (!Number.isInteger(link.amount) || link.amount <= 0) {
    throw new InternalPaymentError('Valor inválido no link de pagamento.', { status: 400, code: 'payment_link_invalid_amount' })
  }
  if (safeString(link.currency || 'BRL').toUpperCase() !== 'BRL') {
    throw new InternalPaymentError('Moeda inválida no link de pagamento.', { status: 400, code: 'payment_link_invalid_currency' })
  }
  const expiresAt = readPaymentLinkExpiration(link)
  if (expiresAt && expiresAt.getTime() <= Date.now()) {
    throw new InternalPaymentError('Link de pagamento expirado.', { status: 410, code: 'payment_link_expired' })
  }
  const methods = (link.methods ?? {}) as Record<string, unknown>
  if (input.method === 'pix' && methods.pix === false) {
    throw new InternalPaymentError('PIX não habilitado para este link.', { status: 400, code: 'payment_link_pix_disabled' })
  }
  if (input.method === 'card' && methods.card === false) {
    throw new InternalPaymentError('Cartão não habilitado para este link.', { status: 400, code: 'payment_link_card_disabled' })
  }
}

export function buildInternalPaymentIdempotencyKey(input: {
  organizationId: string
  paymentLinkId: string | null
  provider: string
  providerEnvironment: string
  method: 'pix' | 'card'
  amount: number
  currency: string
  customer: { email?: string | null; document?: string | null }
  installments?: number
  explicitKey?: string | null
  requestId?: string | null
  attemptId?: string | null
}) {
  const material = [
    safeString(input.explicitKey || null),
    safeString(input.attemptId || null),
    safeString(input.requestId || null),
    input.organizationId,
    input.paymentLinkId ?? '',
    input.provider,
    input.providerEnvironment,
    input.method,
    String(Math.round(input.amount)),
    safeString(input.currency || 'BRL').toUpperCase(),
    safeString(input.customer.email || null).toLowerCase(),
    safeString(input.customer.document || null).replace(/\D+/g, ''),
    typeof input.installments === 'number' ? String(input.installments) : '',
  ].join('|')
  return crypto.createHash('sha256').update(material).digest('hex')
}

function serializeTaxConfig(taxConfig: PayTaxaConfig | null) {
  if (!taxConfig) return null
  return {
    fee_fixed_amount: Number(taxConfig.feeFixedAmount),
    fee_percentage_bps: taxConfig.feePercentageBps,
    min_fee_amount: taxConfig.minFeeAmount === null ? null : Number(taxConfig.minFeeAmount),
    max_fee_amount: taxConfig.maxFeeAmount === null ? null : Number(taxConfig.maxFeeAmount),
  }
}

function buildNoSplitSnapshot(input: { grossAmount: number; taxConfig: PayTaxaConfig | null }): InternalSplitSnapshot {
  return {
    gross_amount: input.grossAmount,
    connekt_fee_amount: 0,
    receiver_total_amount: input.grossAmount,
    currency: 'BRL',
    validated_total_amount: input.grossAmount,
    default_receiver_id: null,
    tax_config: serializeTaxConfig(input.taxConfig),
    rules: [],
    receivers: [],
    applied_receivers: [],
  }
}

export async function buildInternalSplitSnapshot(input: {
  supabase: any
  organizationId: string
  paymentLinkId: string | null
  grossAmount: number
  provider: string
  providerEnvironment: string
}) {
  const taxConfig = await loadPayTaxaConfig(input.supabase, input.organizationId)
  const rules = await loadSplitRules(input.supabase, { organizationId: input.organizationId, paymentLinkId: input.paymentLinkId })
  if (!rules.length) {
    // #region debug-point A:no-explicit-split
    await reportSplitInvalidReceiverDebug({
      hypothesisId: 'A',
      location: 'lib/payments-internal.ts:buildInternalSplitSnapshot:no-explicit-split',
      msg: 'payment has no explicit split rules; skipping receiver validation',
      traceId: `${input.organizationId}:${input.paymentLinkId ?? 'standalone'}:${input.providerEnvironment}`,
      data: {
        organizationId: input.organizationId,
        paymentLinkId: input.paymentLinkId,
        provider: input.provider,
        providerEnvironment: input.providerEnvironment,
        grossAmount: input.grossAmount,
        splitRequested: false,
        splitRuleCount: 0,
        receiverOrigin: 'none',
      },
    })
    // #endregion
    return {
      split: null,
      splitSnapshot: buildNoSplitSnapshot({ grossAmount: input.grossAmount, taxConfig }),
      paySplitRows: [],
    }
  }
  const receiverIds = Array.from(new Set(rules.map((rule) => rule.receiverId)))
  const receivers = await loadReceivers(input.supabase, {
    organizationId: input.organizationId,
    receiverIds,
    provider: input.provider,
    providerEnvironment: input.providerEnvironment,
  })
  const receiverMap = new Map<string, ReceiverConfig>(receivers.map((receiver) => [receiver.id, receiver]))
  const defaultReceiver = await pickDefaultReceiver(input.supabase, {
    organizationId: input.organizationId,
    provider: input.provider,
    providerEnvironment: input.providerEnvironment,
  })

  // #region debug-point A:pre-validation-snapshot
  await reportSplitInvalidReceiverDebug({
    hypothesisId: 'A',
    location: 'lib/payments-internal.ts:buildInternalSplitSnapshot',
    msg: 'split snapshot loaded before receiver validation',
    traceId: `${input.organizationId}:${input.paymentLinkId ?? 'standalone'}:${input.providerEnvironment}`,
    data: {
      organizationId: input.organizationId,
      paymentLinkId: input.paymentLinkId,
      provider: input.provider,
      providerEnvironment: input.providerEnvironment,
      grossAmount: input.grossAmount,
      splitRequested: rules.length > 0,
      splitRuleCount: rules.length,
      splitRuleReceiverIds: rules.map((rule) => rule.receiverId),
      defaultReceiverId: defaultReceiver?.id ?? null,
      defaultReceiverProvider: defaultReceiver?.provider ?? null,
      defaultReceiverProviderEnvironment: defaultReceiver?.providerEnvironment ?? null,
      defaultReceiverProviderReferencePresent: Boolean(defaultReceiver?.providerReference),
      loadedReceiverCount: receivers.length,
      loadedReceivers: receivers.map((receiver) => ({
        id: receiver.id,
        provider: receiver.provider,
        providerEnvironment: receiver.providerEnvironment,
        providerReferencePresent: Boolean(receiver.providerReference),
        status: receiver.status,
        kycStatus: receiver.kycStatus,
      })),
      receiverOrigin: rules.length > 0 ? 'split_rules_table' : defaultReceiver ? 'default_receiver' : 'none',
    },
  })
  // #endregion

  for (const rule of rules) {
    const receiver = receiverMap.get(rule.receiverId)
    if (!receiver) {
      // #region debug-point B:missing-rule-receiver
      await reportSplitInvalidReceiverDebug({
        hypothesisId: 'B',
        location: 'lib/payments-internal.ts:buildInternalSplitSnapshot:missing-receiver',
        msg: 'split rule receiver not found during validation',
        traceId: `${input.organizationId}:${input.paymentLinkId ?? 'standalone'}:${input.providerEnvironment}`,
        data: {
          organizationId: input.organizationId,
          paymentLinkId: input.paymentLinkId,
          provider: input.provider,
          providerEnvironment: input.providerEnvironment,
          failingRuleReceiverId: rule.receiverId,
          failingRuleId: rule.id,
          availableReceiverIds: receivers.map((entry) => entry.id),
          splitRuleReceiverIds: rules.map((entry) => entry.receiverId),
          defaultReceiverId: defaultReceiver?.id ?? null,
          splitRequested: rules.length > 0,
        },
      })
      // #endregion
      throw new InternalPaymentError('Split inválido: recebedor inexistente para a organização.', { status: 400, code: 'split_invalid_receiver' })
    }
    if (safeString(receiver.status) !== 'active') {
      throw new InternalPaymentError('Split inválido: recebedor inativo.', { status: 400, code: 'split_receiver_inactive' })
    }
    if (safeString(receiver.kycStatus) !== 'approved') {
      throw new InternalPaymentError('Split inválido: recebedor sem KYC aprovado.', { status: 400, code: 'split_receiver_kyc_pending' })
    }
  }

  let split
  try {
    split = calculateSplit({
      grossAmount: input.grossAmount,
      taxConfig,
      rules,
      defaultReceiverId: defaultReceiver?.id ?? null,
    })
  } catch (error) {
    const detail = error instanceof Error ? error.message : ''
    if (detail === 'Split result mismatch') {
      throw new InternalPaymentError('Split inválido: soma final divergente do valor bruto.', { status: 400, code: 'split_total_mismatch' })
    }
    if (detail.includes('exceed')) {
      throw new InternalPaymentError('Split inválido: soma das regras excede o valor disponível.', { status: 400, code: 'split_total_mismatch' })
    }
    if (detail === 'No split rules and no default receiver') {
      throw new InternalPaymentError('Split inválido: nenhuma regra ativa e nenhum recebedor padrão aprovado.', { status: 400, code: 'split_not_configured' })
    }
    throw new InternalPaymentError('Split inválido: configuração inconsistente.', { status: 400, code: 'split_invalid' })
  }

  const snapshot: InternalSplitSnapshot = {
    gross_amount: Number(split.grossAmount),
    connekt_fee_amount: Number(split.connektFeeAmount),
    receiver_total_amount: Number(split.receiverTotalAmount),
    currency: 'BRL',
    validated_total_amount: Number(split.connektFeeAmount + split.receiverTotalAmount),
    default_receiver_id: defaultReceiver?.id ?? null,
    tax_config: serializeTaxConfig(taxConfig),
    rules: rules.map((rule: SplitRuleConfig) => ({
      id: rule.id,
      receiver_id: rule.receiverId,
      type: rule.type,
      value_cents: rule.valueCents === null ? null : Number(rule.valueCents),
      percentage_bps: rule.percentageBps,
      priority: rule.priority,
    })),
    receivers: receivers.map((receiver) => ({
      receiver_id: receiver.id,
      status: receiver.status,
      kyc_status: receiver.kycStatus,
      provider_reference_present: Boolean(receiver.providerReference),
    })),
    applied_receivers: split.receivers.map((receiver) => ({
      receiver_id: receiver.receiverId,
      rule_id: receiver.ruleId,
      priority: receiver.priority,
      amount: Number(receiver.amount),
      percentage_bps: receiver.percentageBps,
    })),
  }

  if (snapshot.validated_total_amount !== input.grossAmount) {
    throw new InternalPaymentError('Split inválido: soma final divergente do valor bruto.', { status: 400, code: 'split_total_mismatch' })
  }

  return {
    split,
    splitSnapshot: snapshot,
    paySplitRows: [
      {
        receiver_id: '',
        kind: 'connekt_fee',
        amount: snapshot.connekt_fee_amount,
        percentage_bps: snapshot.gross_amount > 0 ? Math.round((snapshot.connekt_fee_amount * 10000) / snapshot.gross_amount) : 0,
        rule_id: '',
      },
      ...snapshot.applied_receivers.map((receiver) => ({
        receiver_id: receiver.receiver_id,
        kind: 'receiver',
        amount: receiver.amount,
        percentage_bps: receiver.percentage_bps,
        rule_id: receiver.rule_id ?? '',
      })),
    ],
  }
}

function buildRpcPayload(input: {
  transactionId: string | null
  organizationId: string
  customerId: string | null
  paymentLinkId: string | null
  amount: number
  currency: 'BRL'
  method: 'pix' | 'card'
  status: string
  provider: string
  providerEnvironment: string
  idempotencyKey: string
  transactionMetadata: Record<string, unknown>
  splitSnapshot: InternalSplitSnapshot
  paySplitRows: Array<Record<string, unknown>>
}) {
  return {
    p_transaction_id: input.transactionId,
    p_organization_id: input.organizationId,
    p_customer_id: input.customerId,
    p_payment_link_id: input.paymentLinkId,
    p_amount: input.amount,
    p_currency: input.currency,
    p_method: input.method,
    p_status: input.status,
    p_provider: input.provider,
    p_provider_environment: input.providerEnvironment,
    p_idempotency_key: input.idempotencyKey,
    p_transaction_metadata: input.transactionMetadata,
    p_split_summary: input.splitSnapshot,
    p_split_rows: input.paySplitRows,
  }
}

async function persistInternalPaymentFallback(input: {
  supabase: any
  transactionId: string | null
  organizationId: string
  customerId: string | null
  paymentLinkId: string | null
  amount: number
  currency: 'BRL'
  method: 'pix' | 'card'
  status: string
  provider: string
  providerEnvironment: string
  idempotencyKey: string
  transactionMetadata: Record<string, unknown>
  splitSnapshot: InternalSplitSnapshot
  paySplitRows: Array<Record<string, unknown>>
}) {
  const existing = await input.supabase
    .from('transactions')
    .select('id, public_token, status')
    .eq('organization_id', input.organizationId)
    .eq('idempotency_key', input.idempotencyKey)
    .maybeSingle()

  if (existing.data?.id) {
    return {
      transactionId: String(existing.data.id),
      publicToken: existing.data.public_token ? String(existing.data.public_token) : null,
      status: String(existing.data.status ?? input.status),
      idempotencyKey: input.idempotencyKey,
      reused: true,
      splitSnapshot: input.splitSnapshot,
    }
  }

  const inserted = await input.supabase
    .from('transactions')
    .insert({
      id: input.transactionId ?? crypto.randomUUID(),
      organization_id: input.organizationId,
      customer_id: input.customerId,
      payment_link_id: input.paymentLinkId,
      amount: input.amount,
      currency: input.currency,
      method: input.method,
      status: input.status,
      provider: input.provider,
      provider_environment: input.providerEnvironment,
      provider_reference: null,
      provider_order_id: null,
      provider_charge_id: null,
      provider_payload: {},
      idempotency_key: input.idempotencyKey,
      metadata: input.transactionMetadata,
      public_token: crypto.randomUUID(),
    })
    .select('id, public_token, status')
    .single()

  if (inserted.error) {
    throw new InternalPaymentError('Não foi possível criar a transação interna agora.', { status: 500, code: 'transaction_insert_failed' })
  }

  const transactionId = String(inserted.data.id)
  await input.supabase.from('pay_transacao').upsert(
    [
      {
        transaction_id: transactionId,
        organization_id: input.organizationId,
        payment_link_id: input.paymentLinkId,
        gross_amount: input.splitSnapshot.gross_amount,
        connekt_fee_amount: input.splitSnapshot.connekt_fee_amount,
        receiver_total_amount: input.splitSnapshot.receiver_total_amount,
        currency: input.currency,
        status: input.status,
        provider: input.provider,
        provider_environment: input.providerEnvironment,
        provider_reference: null,
        provider_order_id: null,
        provider_charge_id: null,
        provider_payload: {},
        provider_split_payload: {},
        idempotency_key: input.idempotencyKey,
        split_snapshot: input.splitSnapshot,
      },
    ],
    { onConflict: 'transaction_id' },
  )

  await input.supabase.from('pay_split').upsert(
    input.paySplitRows.map((row) => ({
      transaction_id: transactionId,
      organization_id: input.organizationId,
      receiver_id: row.receiver_id ? row.receiver_id : null,
      kind: row.kind,
      amount: row.amount,
      percentage_bps: row.percentage_bps,
      rule_id: row.rule_id ? row.rule_id : null,
    })),
    { onConflict: 'transaction_id,kind,receiver_id' },
  )

  return {
    transactionId,
    publicToken: inserted.data.public_token ? String(inserted.data.public_token) : null,
    status: String(inserted.data.status ?? input.status),
    idempotencyKey: input.idempotencyKey,
    reused: false,
    splitSnapshot: input.splitSnapshot,
  }
}

export async function persistInternalPaymentRecord(input: {
  supabase: any
  transactionId: string | null
  organizationId: string
  customerId: string | null
  paymentLinkId: string | null
  amount: number
  currency: 'BRL'
  method: 'pix' | 'card'
  status: string
  provider: string
  providerEnvironment: string
  idempotencyKey: string
  transactionMetadata: Record<string, unknown>
  splitSnapshot: InternalSplitSnapshot
  paySplitRows: Array<Record<string, unknown>>
}): Promise<InternalPaymentRecord> {
  const rpcPayload = buildRpcPayload(input)
  const rpc = await input.supabase.rpc('create_internal_checkout_transaction', rpcPayload as any)

  if (!rpc.error) {
    const row = Array.isArray(rpc.data) ? rpc.data[0] : rpc.data
    return {
      transactionId: String((row as any)?.transaction_id),
      publicToken: (row as any)?.public_token ? String((row as any).public_token) : null,
      status: String((row as any)?.status ?? input.status),
      idempotencyKey: String((row as any)?.idempotency_key ?? input.idempotencyKey),
      reused: Boolean((row as any)?.reused),
      splitSnapshot: input.splitSnapshot,
    }
  }

  return persistInternalPaymentFallback(input)
}

export async function createPhase2InternalPayment(input: {
  supabase: any
  organizationId: string
  paymentLink: CheckoutPaymentLinkRecord | null
  method: 'pix' | 'card'
  customer: Phase2CheckoutCustomer
  customerId: string | null
  provider: string
  providerEnvironment: string
  amount?: number | null
  currency?: string | null
  metadata?: Record<string, unknown>
  explicitIdempotencyKey?: string | null
  requestId?: string | null
  attemptId?: string | null
  installments?: number
  phase2ProviderErrorCode: string
  phase2ProviderErrorMessage: string
}): Promise<CreatePhase2InternalPaymentResult> {
  if (input.paymentLink) {
    validateCheckoutPaymentLink({
      link: input.paymentLink,
      method: input.method,
      expectedOrganizationId: input.organizationId,
    })
  }

  const amount = input.paymentLink ? Number(input.paymentLink.amount) : Number(input.amount ?? 0)
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new InternalPaymentError('Valor inválido para criar a transação interna.', { status: 400, code: 'payment_invalid_amount' })
  }

  const currency = safeString(input.paymentLink?.currency ?? input.currency ?? 'BRL').toUpperCase() || 'BRL'
  if (currency !== 'BRL') {
    throw new InternalPaymentError('Moeda inválida para criar a transação interna.', { status: 400, code: 'payment_invalid_currency' })
  }

  // #region debug-point E:payment-entry
  await reportSplitInvalidReceiverDebug({
    hypothesisId: 'E',
    location: 'lib/payments-internal.ts:createPhase2InternalPayment',
    msg: 'phase2 internal payment entering split snapshot build',
    traceId: `${input.organizationId}:${input.paymentLink?.id ?? 'standalone'}:${input.providerEnvironment}:${input.method}`,
    data: {
      organizationId: input.organizationId,
      paymentLinkId: input.paymentLink?.id ?? null,
      paymentLinkSlug: input.paymentLink?.slug ?? null,
      checkoutSource: input.paymentLink ? 'payment_link' : 'standalone',
      method: input.method,
      provider: input.provider,
      providerEnvironment: input.providerEnvironment,
      amount,
      currency,
      installments: typeof input.installments === 'number' ? input.installments : null,
      metadataKeys: Object.keys(input.metadata ?? {}),
    },
  })
  // #endregion

  const splitResult = await buildInternalSplitSnapshot({
    supabase: input.supabase,
    organizationId: input.organizationId,
    paymentLinkId: input.paymentLink?.id ?? null,
    grossAmount: amount,
    provider: input.provider,
    providerEnvironment: input.providerEnvironment,
  })

  const requestedTransactionId = crypto.randomUUID()
  const idempotencyKey = buildInternalPaymentIdempotencyKey({
    organizationId: input.organizationId,
    paymentLinkId: input.paymentLink?.id ?? null,
    provider: input.provider,
    providerEnvironment: input.providerEnvironment,
    method: input.method,
    amount,
    currency,
    customer: input.customer,
    installments: typeof input.installments === 'number' ? input.installments : undefined,
    explicitKey: input.explicitIdempotencyKey,
    requestId: input.requestId,
    attemptId: input.attemptId,
  })

  const transactionMetadata = stripUndefinedValues({
    internal_transaction_id: requestedTransactionId,
    organization_id: input.organizationId,
    payment_link_id: input.paymentLink?.id ?? null,
    payment_link_slug: input.paymentLink?.slug ?? null,
    provider_environment: input.providerEnvironment,
    checkout_source: input.paymentLink ? 'payment_link' : 'standalone',
    customer_reference: input.customerId,
    request_id: input.requestId ?? null,
    ...input.metadata,
  })

  const transaction = await persistInternalPaymentRecord({
    supabase: input.supabase,
    transactionId: requestedTransactionId,
    organizationId: input.organizationId,
    customerId: input.customerId,
    paymentLinkId: input.paymentLink?.id ?? null,
    amount,
    currency: 'BRL',
    method: input.method,
    status: 'created',
    provider: input.provider,
    providerEnvironment: input.providerEnvironment,
    idempotencyKey,
    transactionMetadata,
    splitSnapshot: splitResult.splitSnapshot,
    paySplitRows: splitResult.paySplitRows,
  })

  await markTransactionProviderError({
    supabase: input.supabase,
    transactionId: transaction.transactionId,
    organizationId: input.organizationId,
    code: input.phase2ProviderErrorCode,
    message: input.phase2ProviderErrorMessage,
  })

  return {
    transaction,
    amount,
    currency: 'BRL',
    splitSnapshot: splitResult.splitSnapshot,
    paySplitRows: splitResult.paySplitRows,
  }
}

export async function markTransactionProviderError(input: {
  supabase: any
  transactionId: string
  organizationId: string
  code: string
  message: string
}) {
  await input.supabase
    .from('transactions')
    .update({
      status: 'provider_error',
      provider_error_code: input.code,
      provider_error_message: input.message,
    })
    .eq('organization_id', input.organizationId)
    .eq('id', input.transactionId)

  await input.supabase
    .from('pay_transacao')
    .update({
      status: 'provider_error',
      provider_error_code: input.code,
      provider_error_message: input.message,
      provider_last_error: input.message,
      provider_last_error_at: new Date().toISOString(),
    })
    .eq('organization_id', input.organizationId)
    .eq('transaction_id', input.transactionId)
}

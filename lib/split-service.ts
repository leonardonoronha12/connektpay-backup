import { appendLedgerEntryAdmin } from '@/lib/ledger-admin'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import {
  calculateSplit,
  createSplitPayloadForMyGateway,
  mapMyGatewayErrorToUserMessage,
  mapSplitConfigErrorToUserMessage,
  percentageBpsRounded,
  toBigintCents,
  type CalculatedSplit,
  type MyGatewaySplitPayload,
  type PayTaxaConfig,
  type ReceiverConfig,
  type SplitRuleConfig,
} from '@/lib/split-core'

export type { PayTaxaConfig, ReceiverConfig, SplitRuleConfig, CalculatedSplit, MyGatewaySplitPayload } from '@/lib/split-core'
export { calculateSplit, createSplitPayloadForMyGateway, mapMyGatewayErrorToUserMessage, mapSplitConfigErrorToUserMessage } from '@/lib/split-core'

export async function ensurePayLedgerFromSplitOnce(input: { organizationId: string; transactionId: string }) {
  const supabase = getSupabaseAdminClient()
  const { data: splits } = await supabase
    .from('pay_split')
    .select('kind, receiver_id, amount')
    .eq('organization_id', input.organizationId)
    .eq('transaction_id', input.transactionId)

  const list = Array.isArray(splits) ? splits : []
  for (const s of list) {
    const kind = String((s as any).kind ?? '')
    const receiverId = (s as any).receiver_id as string | null
    const amount = Number((s as any).amount ?? 0)
    if (!amount || amount <= 0) continue

    if (kind === 'connekt_fee') {
      const { data: existing } = await supabase
        .from('ledger_entries')
        .select('id')
        .eq('organization_id', input.organizationId)
        .eq('transaction_id', input.transactionId)
        .eq('type', 'fee')
        .eq('origin', 'connekt_fee')
        .limit(1)
        .maybeSingle()
      if (!existing?.id) {
        await appendLedgerEntryAdmin({
          organizationId: input.organizationId,
          transactionId: input.transactionId,
          type: 'fee',
          direction: 'debit',
          amount,
          origin: 'connekt_fee',
        })
      }
    }

    if (kind === 'receiver') {
      const origin = receiverId ? `split:${receiverId}` : 'split:unknown'
      const { data: existing } = await supabase
        .from('ledger_entries')
        .select('id')
        .eq('organization_id', input.organizationId)
        .eq('transaction_id', input.transactionId)
        .eq('type', 'split')
        .eq('origin', origin)
        .limit(1)
        .maybeSingle()
      if (!existing?.id) {
        await appendLedgerEntryAdmin({
          organizationId: input.organizationId,
          transactionId: input.transactionId,
          type: 'split',
          direction: 'debit',
          amount,
          origin,
        })
      }
    }
  }

  const ledgerRows = list
    .filter((s: any) => Number(s.amount ?? 0) > 0)
    .flatMap((s: any) => {
      const kind = String(s.kind ?? '')
      const receiverId = (s.receiver_id as string | null) ?? null
      const amount = BigInt(s.amount ?? 0)
      if (amount <= 0n) return []
      if (kind === 'connekt_fee') {
        return [{ type: 'fee', direction: 'debit', receiver_id: null, amount: Number(amount) }]
      }
      if (kind === 'receiver') {
        return [{ type: 'split', direction: 'debit', receiver_id: receiverId, amount: Number(amount) }]
      }
      return []
    })

  if (ledgerRows.length) {
    await supabase.from('pay_ledger').upsert(
      ledgerRows.map((r) => ({
        organization_id: input.organizationId,
        transaction_id: input.transactionId,
        receiver_id: r.receiver_id,
        type: r.type,
        direction: r.direction,
        amount: r.amount,
      })),
      { onConflict: 'transaction_id,type,receiver_id,direction' },
    )
  }
}

export async function loadPayTaxaConfig(supabase: any, organizationId: string): Promise<PayTaxaConfig | null> {
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

export async function loadSplitRules(supabase: any, input: { organizationId: string; paymentLinkId: string | null }): Promise<SplitRuleConfig[]> {
  let query = supabase
    .from('split_rules')
    .select('id, receiver_id, type, value_cents, percentage_bps, priority, status')
    .eq('organization_id', input.organizationId)
    .eq('status', 'active')
    .order('priority', { ascending: false })

  if (input.paymentLinkId) {
    query = query.or(`payment_link_id.eq.${input.paymentLinkId},payment_link_id.is.null`)
  } else {
    query = query.is('payment_link_id', null)
  }

  const { data } = await query
  const rows = Array.isArray(data) ? data : []
  return rows.map((r: any) => ({
    id: String(r.id),
    receiverId: String(r.receiver_id),
    type: r.type === 'fixed' ? 'fixed' : 'percentage',
    valueCents: r.value_cents === null ? null : toBigintCents(r.value_cents),
    percentageBps: r.percentage_bps === null ? null : Number(r.percentage_bps),
    priority: typeof r.priority === 'number' ? r.priority : 0,
  }))
}

export async function loadReceivers(supabase: any, input: { organizationId: string; receiverIds: string[] }): Promise<ReceiverConfig[]> {
  if (!input.receiverIds.length) return []
  const { data } = await supabase
    .from('receivers')
    .select('id, provider_reference, status, kyc_status')
    .eq('organization_id', input.organizationId)
    .in('id', input.receiverIds)
  const rows = Array.isArray(data) ? data : []
  return rows.map((r: any) => ({
    id: String(r.id),
    providerReference: r.provider_reference ? String(r.provider_reference) : null,
    status: String(r.status ?? 'active'),
    kycStatus: String(r.kyc_status ?? 'pending'),
  }))
}

export async function pickDefaultReceiver(supabase: any, organizationId: string): Promise<ReceiverConfig | null> {
  const { data } = await supabase
    .from('receivers')
    .select('id, provider_reference, status, kyc_status, created_at')
    .eq('organization_id', organizationId)
    .eq('status', 'active')
    .eq('kyc_status', 'approved')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!data) return null
  return {
    id: String((data as any).id),
    providerReference: (data as any).provider_reference ? String((data as any).provider_reference) : null,
    status: String((data as any).status ?? 'active'),
    kycStatus: String((data as any).kyc_status ?? 'approved'),
  }
}

export async function calculateSplitForProvider(
  supabase: any,
  input: { organizationId: string; paymentLinkId: string | null; grossAmount: bigint | number },
  defaultReceiverId?: string | null,
) {
  const taxConfig = await loadPayTaxaConfig(supabase, input.organizationId)
  const rules = await loadSplitRules(supabase, { organizationId: input.organizationId, paymentLinkId: input.paymentLinkId })
  const receiverIds = rules.map((r) => r.receiverId)
  const receivers = await loadReceivers(supabase, { organizationId: input.organizationId, receiverIds })
  const fallback = defaultReceiverId ? await loadReceivers(supabase, { organizationId: input.organizationId, receiverIds: [defaultReceiverId] }).then((r) => r[0] ?? null) : await pickDefaultReceiver(supabase, input.organizationId)
  const split = calculateSplit({
    grossAmount: input.grossAmount,
    taxConfig,
    rules,
    defaultReceiverId: fallback?.id ?? null,
  })
  const providerSplit = createSplitPayloadForMyGateway({ split, receivers: receivers.length ? receivers : fallback ? [fallback] : [] })
  return { split, providerSplit, receivers: receivers.length ? receivers : fallback ? [fallback] : [] }
}

export async function persistSplitSnapshot(input: {
  supabase: any
  transactionId: string
  organizationId: string
  paymentLinkId: string | null
  currency: 'BRL'
  split: CalculatedSplit
  providerSplit: MyGatewaySplitPayload
}) {
  const supabase = input.supabase
  await supabase.from('pay_transacao').upsert(
    [
      {
        transaction_id: input.transactionId,
        organization_id: input.organizationId,
        payment_link_id: input.paymentLinkId,
        gross_amount: Number(input.split.grossAmount),
        connekt_fee_amount: Number(input.split.connektFeeAmount),
        receiver_total_amount: Number(input.split.receiverTotalAmount),
        currency: input.currency,
        status: 'created',
        provider_split_payload: input.providerSplit as any,
      },
    ],
    { onConflict: 'transaction_id' },
  )

  const rows = [
    {
      transaction_id: input.transactionId,
      organization_id: input.organizationId,
      receiver_id: null,
      kind: 'connekt_fee',
      amount: Number(input.split.connektFeeAmount),
      percentage_bps: percentageBpsRounded(input.split.connektFeeAmount, input.split.grossAmount),
      rule_id: null,
    },
    ...input.split.receivers.map((r) => ({
      transaction_id: input.transactionId,
      organization_id: input.organizationId,
      receiver_id: r.receiverId,
      kind: 'receiver',
      amount: Number(r.amount),
      percentage_bps: r.percentageBps,
      rule_id: r.ruleId,
    })),
  ]

  await supabase.from('pay_split').upsert(rows as any, { onConflict: 'transaction_id,kind,receiver_id' })
}

export async function markPayTransacaoProviderSuccess(input: {
  supabase: any
  transactionId: string
  providerReference: string
  providerPayload: unknown
  status: string
}) {
  await input.supabase
    .from('pay_transacao')
    .update({
      status: input.status,
      provider_reference: input.providerReference,
      provider_payload: (input.providerPayload ?? {}) as any,
      provider_last_error: null,
      provider_last_error_at: null,
    })
    .eq('transaction_id', input.transactionId)
}

export async function markPayTransacaoProviderError(input: { supabase: any; transactionId: string; message: string }) {
  const now = new Date().toISOString()
  await input.supabase
    .from('pay_transacao')
    .update({
      status: 'failed',
      provider_last_error: input.message,
      provider_last_error_at: now,
    })
    .eq('transaction_id', input.transactionId)
}

import 'server-only'

import { getFinancialEnvironment } from '@/lib/env'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

type LedgerDirection = 'credit' | 'debit'

type LedgerScope = {
  provider: string
  providerEnvironment: string
  providerOrderId: string | null
  providerChargeId: string | null
  providerReference: string | null
}

function safeString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

async function resolveLedgerScope(input: {
  supabase: any
  organizationId: string
  transactionId?: string | null
  payoutId?: string | null
  anticipationRequestId?: string | null
  provider?: string | null
  providerEnvironment?: string | null
  providerOrderId?: string | null
  providerChargeId?: string | null
  providerReference?: string | null
}): Promise<LedgerScope> {
  const runtime = getFinancialEnvironment()

  const scope: LedgerScope = {
    provider: safeString(input.provider) ?? runtime.providerId,
    providerEnvironment: safeString(input.providerEnvironment) ?? runtime.environment,
    providerOrderId: safeString(input.providerOrderId),
    providerChargeId: safeString(input.providerChargeId),
    providerReference: safeString(input.providerReference),
  }

  if (input.transactionId) {
    const { data } = await input.supabase
      .from('transactions')
      .select('provider, provider_environment, provider_order_id, provider_charge_id, provider_reference')
      .eq('organization_id', input.organizationId)
      .eq('id', input.transactionId)
      .maybeSingle()

    if (data) {
      scope.provider = safeString((data as any).provider) ?? scope.provider
      scope.providerEnvironment = safeString((data as any).provider_environment) ?? scope.providerEnvironment
      scope.providerOrderId = safeString((data as any).provider_order_id) ?? scope.providerOrderId
      scope.providerChargeId = safeString((data as any).provider_charge_id) ?? scope.providerChargeId
      scope.providerReference = safeString((data as any).provider_reference) ?? scope.providerReference
      return scope
    }
  }

  if (input.payoutId) {
    const { data } = await input.supabase
      .from('payouts')
      .select('provider, provider_environment, provider_reference')
      .eq('organization_id', input.organizationId)
      .eq('id', input.payoutId)
      .maybeSingle()

    if (data) {
      scope.provider = safeString((data as any).provider) ?? scope.provider
      scope.providerEnvironment = safeString((data as any).provider_environment) ?? scope.providerEnvironment
      scope.providerReference = safeString((data as any).provider_reference) ?? scope.providerReference
      return scope
    }
  }

  if (input.anticipationRequestId) {
    const { data } = await input.supabase
      .from('pay_antecipacao')
      .select('provider, provider_environment, provider_reference, acquirer_anticipation_id')
      .eq('organization_id', input.organizationId)
      .eq('id', input.anticipationRequestId)
      .maybeSingle()

    if (data) {
      scope.provider = safeString((data as any).provider) ?? scope.provider
      scope.providerEnvironment = safeString((data as any).provider_environment) ?? scope.providerEnvironment
      scope.providerReference =
        safeString((data as any).provider_reference) ?? safeString((data as any).acquirer_anticipation_id) ?? scope.providerReference
    }
  }

  return scope
}

export async function appendLedgerEntryAdmin(input: {
  organizationId: string
  type: string
  direction: LedgerDirection
  amount: number
  origin?: string
  occurredAt?: string
  transactionId?: string | null
  payoutId?: string | null
  anticipationRequestId?: string | null
  provider?: string | null
  providerEnvironment?: string | null
  providerOrderId?: string | null
  providerChargeId?: string | null
  providerReference?: string | null
}) {
  const supabase = getSupabaseAdminClient()
  const scope = await resolveLedgerScope({
    supabase,
    organizationId: input.organizationId,
    transactionId: input.transactionId ?? null,
    payoutId: input.payoutId ?? null,
    anticipationRequestId: input.anticipationRequestId ?? null,
    provider: input.provider ?? null,
    providerEnvironment: input.providerEnvironment ?? null,
    providerOrderId: input.providerOrderId ?? null,
    providerChargeId: input.providerChargeId ?? null,
    providerReference: input.providerReference ?? null,
  })
  const payload = {
    p_organization_id: input.organizationId,
    p_transaction_id: input.transactionId ?? null,
    p_payout_id: input.payoutId ?? null,
    p_anticipation_request_id: input.anticipationRequestId ?? null,
    p_provider: scope.provider,
    p_provider_environment: scope.providerEnvironment,
    p_provider_order_id: scope.providerOrderId,
    p_provider_charge_id: scope.providerChargeId,
    p_provider_reference: scope.providerReference,
    p_type: input.type,
    p_direction: input.direction,
    p_amount: Math.round(input.amount),
    p_origin: input.origin ?? 'system',
    p_occurred_at: input.occurredAt ?? new Date().toISOString(),
  }

  const rpc = await supabase.rpc('append_ledger_entry', payload as any)
  if (!rpc.error) return rpc.data

  const { data: last } = await supabase
    .from('ledger_entries')
    .select('balance_after')
    .eq('organization_id', input.organizationId)
    .eq('provider', scope.provider)
    .eq('provider_environment', scope.providerEnvironment)
    .order('occurred_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const current = Number((last as any)?.balance_after ?? 0)
  const delta = input.direction === 'credit' ? Math.round(input.amount) : -Math.round(input.amount)
  const balanceAfter = current + delta

  const ins = await supabase.from('ledger_entries').insert({
    organization_id: input.organizationId,
    transaction_id: input.transactionId ?? null,
    payout_id: input.payoutId ?? null,
    anticipation_request_id: input.anticipationRequestId ?? null,
    provider: scope.provider,
    provider_environment: scope.providerEnvironment,
    provider_order_id: scope.providerOrderId,
    provider_charge_id: scope.providerChargeId,
    provider_reference: scope.providerReference,
    type: input.type,
    direction: input.direction,
    amount: Math.round(input.amount),
    balance_after: balanceAfter,
    origin: input.origin ?? 'system',
    occurred_at: input.occurredAt ?? new Date().toISOString(),
  })

  if (ins.error) throw new Error(rpc.error?.message ?? ins.error.message)
  return null
}

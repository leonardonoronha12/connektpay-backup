import 'server-only'

import { getSupabaseAdminClient } from '@/lib/supabase-admin'

type LedgerDirection = 'credit' | 'debit'

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
}) {
  const supabase = getSupabaseAdminClient()
  const payload = {
    p_organization_id: input.organizationId,
    p_transaction_id: input.transactionId ?? null,
    p_payout_id: input.payoutId ?? null,
    p_anticipation_request_id: input.anticipationRequestId ?? null,
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


import { getFinancialEnvironment, isSupabaseServiceConfigured } from '@/lib/env'
import { checkPublicRateLimit } from '@/lib/public-rate-limit'
import { getOrgFromApiKey } from '@/lib/public-api-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

export async function GET(request: Request) {
  if (!isSupabaseServiceConfigured()) return json({ error: 'Funcionalidade indisponÃ­vel no momento.' }, { status: 503 })

  const ctx = await getOrgFromApiKey(request)
  if (!ctx?.apiKeyHash) return json({ error: 'Unauthorized' }, { status: 401 })

  const allowed = await checkPublicRateLimit({ organizationId: ctx.organizationId, apiKeyHash: ctx.apiKeyHash, limit: 120, windowSeconds: 60 })
  if (!allowed) return json({ error: 'Rate limit exceeded' }, { status: 429 })

  const supabase = getSupabaseAdminClient()
  const runtime = getFinancialEnvironment()
  const { data: entries, error } = await supabase
    .from('ledger_entries')
    .select('id, type, direction, amount, balance_after, origin, provider, provider_environment, occurred_at')
    .eq('organization_id', ctx.organizationId)
    .eq('provider', runtime.providerId)
    .eq('provider_environment', runtime.environment)
    .order('occurred_at', { ascending: false })
    .limit(200)

  if (error) return json({ error: 'NÃ£o foi possÃ­vel carregar o extrato agora.' }, { status: 500 })
  const balance = entries && entries.length > 0 ? Number((entries[0] as any).balance_after ?? 0) : 0
  return json({ balance, ledgerEntries: entries ?? [] })
}


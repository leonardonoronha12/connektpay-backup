import 'server-only'

import { getSupabaseAdminClient } from '@/lib/supabase-admin'

export async function checkPublicRateLimit(input: { organizationId: string; apiKeyHash: string; limit: number; windowSeconds?: number }) {
  const supabase = getSupabaseAdminClient()
  const windowSeconds = typeof input.windowSeconds === 'number' ? input.windowSeconds : 60

  const rpc = await supabase.rpc('rate_limit_check', {
    p_organization_id: input.organizationId,
    p_api_key_hash: input.apiKeyHash,
    p_limit: input.limit,
    p_window_seconds: windowSeconds,
  } as any)

  if (!rpc.error) return Boolean(rpc.data)

  const ws = new Date(Math.floor(Date.now() / (windowSeconds * 1000)) * (windowSeconds * 1000)).toISOString()
  const { data: existing } = await supabase
    .from('api_rate_limits')
    .select('count')
    .eq('organization_id', input.organizationId)
    .eq('api_key_hash', input.apiKeyHash)
    .eq('window_start', ws)
    .maybeSingle()

  const current = Number((existing as any)?.count ?? 0)
  const next = current + 1
  await supabase
    .from('api_rate_limits')
    .upsert({ organization_id: input.organizationId, api_key_hash: input.apiKeyHash, window_start: ws, count: next }, { onConflict: 'organization_id,api_key_hash,window_start' })

  return next <= input.limit
}


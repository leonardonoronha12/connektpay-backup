import { isSupabaseServiceConfigured } from '@/lib/env'
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

  const url = new URL(request.url)
  const status = url.searchParams.get('status')
  const q = url.searchParams.get('q')

  const supabase = getSupabaseAdminClient()
  let query = supabase
    .from('transactions')
    .select('id, amount, currency, method, status, provider_reference, created_at')
    .eq('organization_id', ctx.organizationId)
    .order('created_at', { ascending: false })
    .limit(200)
  if (status) query = query.eq('status', status)
  if (q) query = query.or(`id.ilike.%${q}%,provider_reference.ilike.%${q}%`)

  const { data, error } = await query
  if (error) return json({ error: 'NÃ£o foi possÃ­vel carregar transaÃ§Ãµes agora.' }, { status: 500 })
  return json({ transactions: data ?? [] })
}


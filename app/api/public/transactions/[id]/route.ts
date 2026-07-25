import { isSupabaseServiceConfigured } from '@/lib/env'
import { checkPublicRateLimit } from '@/lib/public-rate-limit'
import { getOrgFromApiKey } from '@/lib/public-api-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

export async function GET(request: Request, ctxRoute: { params: Promise<{ id: string }> }) {
  if (!isSupabaseServiceConfigured()) return json({ error: 'Funcionalidade indisponÃ­vel no momento.' }, { status: 503 })

  const ctx = await getOrgFromApiKey(request)
  if (!ctx?.apiKeyHash) return json({ error: 'Unauthorized' }, { status: 401 })

  const allowed = await checkPublicRateLimit({ organizationId: ctx.organizationId, apiKeyHash: ctx.apiKeyHash, limit: 120, windowSeconds: 60 })
  if (!allowed) return json({ error: 'Rate limit exceeded' }, { status: 429 })

  const { id } = await ctxRoute.params
  const supabase = getSupabaseAdminClient()

  const { data, error } = await supabase
    .from('transactions')
    .select('id, amount, currency, method, status, provider_reference, created_at')
    .eq('organization_id', ctx.organizationId)
    .eq('id', id)
    .maybeSingle()

  if (error) return json({ error: 'NÃ£o foi possÃ­vel carregar a transaÃ§Ã£o agora.' }, { status: 500 })
  if (!data) return json({ error: 'TransaÃ§Ã£o nÃ£o encontrada.' }, { status: 404 })
  return json({ transaction: data })
}


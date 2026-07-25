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

  const supabase = getSupabaseAdminClient()
  const { data, error } = await supabase
    .from('customers')
    .select('id, name, email, document, phone, created_at')
    .eq('organization_id', ctx.organizationId)
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) return json({ error: 'NÃ£o foi possÃ­vel carregar clientes agora.' }, { status: 500 })
  return json({ customers: data ?? [] })
}

export async function POST(request: Request) {
  if (!isSupabaseServiceConfigured()) return json({ error: 'Funcionalidade indisponÃ­vel no momento.' }, { status: 503 })
  const ctx = await getOrgFromApiKey(request)
  if (!ctx?.apiKeyHash) return json({ error: 'Unauthorized' }, { status: 401 })
  const allowed = await checkPublicRateLimit({ organizationId: ctx.organizationId, apiKeyHash: ctx.apiKeyHash, limit: 60, windowSeconds: 60 })
  if (!allowed) return json({ error: 'Rate limit exceeded' }, { status: 429 })

  const body = (await request.json().catch(() => null)) as null | { name?: string; email?: string; document?: string; phone?: string }
  if (!body?.name && !body?.email) return json({ error: 'Missing customer data' }, { status: 400 })

  const supabase = getSupabaseAdminClient()
  const { data, error } = await supabase
    .from('customers')
    .insert({
      organization_id: ctx.organizationId,
      name: body.name ?? body.email ?? 'Cliente',
      email: body.email ?? null,
      document: body.document ?? null,
      phone: body.phone ?? null,
    })
    .select('id, name, email, document, phone, created_at')
    .single()
  if (error) return json({ error: 'NÃ£o foi possÃ­vel criar o cliente agora.' }, { status: 500 })
  return json({ customer: data }, { status: 201 })
}


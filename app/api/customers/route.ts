﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿import { isSupabaseConfigured, isSupabaseServiceConfigured } from '@/lib/env'
import { getOrgFromApiKey } from '@/lib/public-api-auth'
import { checkPublicRateLimit } from '@/lib/public-rate-limit'
import { assertRole, requireSessionOrgContext } from '@/lib/session-org-context'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import { classifyInternalApiError } from '@/lib/api-error'
import { NextResponse } from 'next/server'

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) return json({ customers: [] })

  try {
    const apiKeyCtx = await getOrgFromApiKey(request)
    if (apiKeyCtx?.apiKeyHash) {
      const allowed = await checkPublicRateLimit({ organizationId: apiKeyCtx.organizationId, apiKeyHash: apiKeyCtx.apiKeyHash, limit: 120, windowSeconds: 60 })
      if (!allowed) return json({ error: 'Rate limit exceeded' }, { status: 429 })
    }
    const ctx = apiKeyCtx ? null : await requireSessionOrgContext()
    if (!apiKeyCtx) assertRole(ctx!.role, ['owner', 'admin', 'operacional', 'super_admin'])
    const supabase = apiKeyCtx ? getSupabaseAdminClient() : await getSupabaseServerClient()
    const organizationId = apiKeyCtx ? apiKeyCtx.organizationId : (ctx!.organizationId as string)
    const { data, error } = await supabase
      .from('customers')
      .select('id, name, email, document, phone, created_at')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })

    if (error) return json({ error: 'NÃ£o foi possÃ­vel carregar clientes agora.' }, { status: 500 })
    return json({ customers: data })
  } catch (e) {
    const err = classifyInternalApiError(e)
    return json({ error: err.message }, { status: err.status })
  }
}

export async function POST(request: Request) {
  if (!isSupabaseServiceConfigured()) return json({ error: 'Funcionalidade indisponÃ­vel no momento.' }, { status: 503 })

  try {
    const apiKeyCtx = await getOrgFromApiKey(request)
    if (apiKeyCtx?.apiKeyHash) {
      const allowed = await checkPublicRateLimit({ organizationId: apiKeyCtx.organizationId, apiKeyHash: apiKeyCtx.apiKeyHash, limit: 60, windowSeconds: 60 })
      if (!allowed) return json({ error: 'Rate limit exceeded' }, { status: 429 })
    }
    const ctx = apiKeyCtx ? null : await requireSessionOrgContext()
    if (!apiKeyCtx) assertRole(ctx!.role, ['owner', 'admin', 'operacional', 'super_admin'])
    const body = (await request.json().catch(() => null)) as
      | null
      | { name?: string; email?: string; document?: string; phone?: string }

    if (!body?.name && !body?.email) return json({ error: 'Missing customer data' }, { status: 400 })

    const supabase = apiKeyCtx ? getSupabaseAdminClient() : await getSupabaseServerClient()
    const organizationId = apiKeyCtx ? apiKeyCtx.organizationId : (ctx!.organizationId as string)
    const { data, error } = await supabase
      .from('customers')
      .insert({
        organization_id: organizationId,
        name: body.name ?? body.email ?? 'Cliente',
        email: body.email ?? null,
        document: body.document ?? null,
        phone: body.phone ?? null,
      })
      .select('id, name, email, document, phone, created_at')
      .single()

    if (error) return json({ error: 'NÃ£o foi possÃ­vel criar o cliente agora.' }, { status: 500 })
    return json({ customer: data }, { status: 201 })
  } catch (e) {
    const err = classifyInternalApiError(e)
    return json({ error: err.message }, { status: err.status })
  }
}


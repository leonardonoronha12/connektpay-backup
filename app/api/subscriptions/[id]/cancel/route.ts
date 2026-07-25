import { classifyInternalApiError } from '@/lib/api-error'
import { isSupabaseConfigured, isSupabaseServiceConfigured } from '@/lib/env'
import { assertRole, requireSessionOrgContext } from '@/lib/session-org-context'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import { cancelSubscription } from '@/lib/subscription-service'
import { NextResponse } from 'next/server'

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

export async function POST(request: Request, ctxRoute: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return json({ error: 'Funcionalidade indisponÃ­vel no momento.' }, { status: 503 })
  if (!isSupabaseServiceConfigured()) return json({ error: 'Funcionalidade indisponÃ­vel no momento.' }, { status: 503 })
  try {
    const ctx = await requireSessionOrgContext()
    assertRole(ctx.role, ['owner', 'admin', 'super_admin'])
    const { id } = await ctxRoute.params
    const body = (await request.json().catch(() => null)) as null | { reason?: string }
    const supabase = await getSupabaseServerClient()
    const out = await cancelSubscription({
      supabase,
      organizationId: ctx.organizationId,
      actorProfileId: ctx.actorProfileId,
      subscriptionId: id,
      reason: body?.reason ?? null,
    })
    return json(out)
  } catch (e) {
    const err = classifyInternalApiError(e)
    return json({ error: err.message }, { status: err.status })
  }
}


import { classifyInternalApiError } from '@/lib/api-error'
import { isSupabaseConfigured, isSupabaseServiceConfigured } from '@/lib/env'
import { assertRole, requireSessionOrgContext } from '@/lib/session-org-context'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import { getSubscription, updateSubscriptionAdmin } from '@/lib/subscription-service'
import { NextResponse } from 'next/server'

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

export async function PATCH(request: Request, ctxRoute: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return json({ error: 'Funcionalidade indisponível no momento.' }, { status: 503 })
  try {
    const ctx = await requireSessionOrgContext()
    assertRole(ctx.role, ['owner', 'admin', 'financeiro', 'super_admin'])
    const { id } = await ctxRoute.params
    const body = (await request.json().catch(() => null)) as
      | null
      | { status?: 'pending' | 'past_due' | 'failed'; nextChargeAt?: string | null; attemptsFailed?: number }
    if (!body) return json({ error: 'Invalid body' }, { status: 400 })
    const supabase = isSupabaseServiceConfigured() ? getSupabaseAdminClient() : await getSupabaseServerClient()
    const out = await updateSubscriptionAdmin({
      supabase,
      organizationId: ctx.organizationId,
      actorProfileId: ctx.actorProfileId,
      subscriptionId: id,
      patch: {
        ...(typeof body.status === 'string' ? { status: body.status } : null),
        ...(Object.prototype.hasOwnProperty.call(body, 'nextChargeAt') ? { nextChargeAt: body.nextChargeAt ?? null } : null),
        ...(typeof body.attemptsFailed === 'number' ? { attemptsFailed: body.attemptsFailed } : null),
      },
    })
    return json(out)
  } catch (e) {
    const err = classifyInternalApiError(e)
    return json({ error: err.message }, { status: err.status })
  }
}

export async function GET(request: Request, ctxRoute: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return json({ error: 'Funcionalidade indisponível no momento.' }, { status: 503 })
  try {
    const ctx = await requireSessionOrgContext()
    assertRole(ctx.role, ['owner', 'admin', 'financeiro', 'super_admin'])
    const supabase = isSupabaseServiceConfigured() ? getSupabaseAdminClient() : await getSupabaseServerClient()
    const { id } = await ctxRoute.params
    const out = await getSubscription({ supabase, organizationId: ctx.organizationId, subscriptionId: id })
    return json(out)
  } catch (e) {
    const err = classifyInternalApiError(e)
    return json({ error: err.message }, { status: err.status })
  }
}

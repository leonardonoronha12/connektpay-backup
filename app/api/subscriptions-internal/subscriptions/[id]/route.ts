﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿import { classifyInternalApiError } from '@/lib/api-error'
import { isSubscriptionsProviderEnabled, isSupabaseConfigured, isSupabaseServiceConfigured } from '@/lib/env'
import { SUBSCRIPTIONS_INTERNAL_MANAGE_ROLES, SUBSCRIPTIONS_INTERNAL_READ_ROLES } from '@/lib/subscriptions-internal-core'
import { deleteSubscriptionInternal, listSubscriptionsInternal, updateSubscriptionInternal } from '@/lib/subscriptions-internal-service'
import { assertRole, requireSessionOrgContext } from '@/lib/session-org-context'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

export async function GET(_: Request, routeCtx: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return json({ error: 'Funcionalidade indisponivel no momento.' }, { status: 503 })

  try {
    const ctx = await requireSessionOrgContext()
    assertRole(ctx.role, [...SUBSCRIPTIONS_INTERNAL_READ_ROLES])
    const supabase = isSupabaseServiceConfigured() ? getSupabaseAdminClient() : await getSupabaseServerClient()
    const { id } = await routeCtx.params
    const out = await listSubscriptionsInternal({ supabase, organizationId: ctx.organizationId })
    const subscription = out.subscriptions.find((item) => item.id === id)
    if (!subscription) return json({ error: 'Assinatura interna nao encontrada.' }, { status: 404 })
    return json({ subscription })
  } catch (e) {
    const err = classifyInternalApiError(e)
    return json({ error: err.message }, { status: err.status })
  }
}

export async function PATCH(request: Request, routeCtx: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return json({ error: 'Funcionalidade indisponivel no momento.' }, { status: 503 })

  try {
    const ctx = await requireSessionOrgContext()
    assertRole(ctx.role, [...SUBSCRIPTIONS_INTERNAL_MANAGE_ROLES])
    const body = await request.json().catch(() => null)
    if (!body) return json({ error: 'Dados invalidos.' }, { status: 400 })
    const { id } = await routeCtx.params
    const supabase = isSupabaseServiceConfigured() ? getSupabaseAdminClient() : await getSupabaseServerClient()
    const subscription = await updateSubscriptionInternal({
      supabase,
      organizationId: ctx.organizationId,
      actorProfileId: ctx.actorProfileId,
      subscriptionId: id,
      rawDraft: body,
      providerEnabled: isSubscriptionsProviderEnabled(),
    })
    return json({ subscription })
  } catch (e) {
    const err = classifyInternalApiError(e)
    const status = err.status === 500 && e instanceof Error ? 400 : err.status
    return json({ error: e instanceof Error ? e.message : err.message }, { status })
  }
}

export async function DELETE(_: Request, routeCtx: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return json({ error: 'Funcionalidade indisponivel no momento.' }, { status: 503 })

  try {
    const ctx = await requireSessionOrgContext()
    assertRole(ctx.role, [...SUBSCRIPTIONS_INTERNAL_MANAGE_ROLES])
    const { id } = await routeCtx.params
    const supabase = isSupabaseServiceConfigured() ? getSupabaseAdminClient() : await getSupabaseServerClient()
    const out = await deleteSubscriptionInternal({
      supabase,
      organizationId: ctx.organizationId,
      actorProfileId: ctx.actorProfileId,
      subscriptionId: id,
    })
    return json(out)
  } catch (e) {
    const err = classifyInternalApiError(e)
    const status = err.status === 500 && e instanceof Error ? 400 : err.status
    return json({ error: e instanceof Error ? e.message : err.message }, { status })
  }
}


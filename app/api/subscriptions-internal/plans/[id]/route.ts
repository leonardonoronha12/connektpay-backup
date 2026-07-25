﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿import { classifyInternalApiError } from '@/lib/api-error'
import { isSupabaseConfigured, isSupabaseServiceConfigured } from '@/lib/env'
import { SUBSCRIPTIONS_INTERNAL_MANAGE_ROLES, SUBSCRIPTIONS_INTERNAL_READ_ROLES } from '@/lib/subscriptions-internal-core'
import { deleteSubscriptionPlanInternal, listSubscriptionsInternal, updateSubscriptionPlanInternal } from '@/lib/subscriptions-internal-service'
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
    const plan = out.plans.find((item) => item.id === id)
    if (!plan) return json({ error: 'Plano interno nao encontrado.' }, { status: 404 })
    return json({ plan })
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
    const plan = await updateSubscriptionPlanInternal({
      supabase,
      organizationId: ctx.organizationId,
      actorProfileId: ctx.actorProfileId,
      planId: id,
      rawDraft: body,
    })
    return json({ plan })
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
    const out = await deleteSubscriptionPlanInternal({
      supabase,
      organizationId: ctx.organizationId,
      actorProfileId: ctx.actorProfileId,
      planId: id,
    })
    return json(out)
  } catch (e) {
    const err = classifyInternalApiError(e)
    const status = err.status === 500 && e instanceof Error ? 400 : err.status
    return json({ error: e instanceof Error ? e.message : err.message }, { status })
  }
}


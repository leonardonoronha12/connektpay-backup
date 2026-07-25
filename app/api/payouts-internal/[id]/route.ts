﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿import { isPayoutProviderEnabled, isSupabaseConfigured, isSupabaseServiceConfigured } from '@/lib/env'
import { PAYOUTS_INTERNAL_ALLOWED_ROLES } from '@/lib/payouts-internal-core'
import { deletePayoutInternal, getPayoutInternalDetail, updatePayoutInternal } from '@/lib/payouts-internal-service'
import { assertRole, requireSessionOrgContext } from '@/lib/session-org-context'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import { classifyInternalApiError } from '@/lib/api-error'
import { NextResponse } from 'next/server'

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

export async function GET(_: Request, routeCtx: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return json({ error: 'Funcionalidade indisponivel no momento.' }, { status: 503 })

  try {
    const { id } = await routeCtx.params
    const ctx = await requireSessionOrgContext()
    assertRole(ctx.role, [...PAYOUTS_INTERNAL_ALLOWED_ROLES])
    const supabase = isSupabaseServiceConfigured() ? getSupabaseAdminClient() : await getSupabaseServerClient()
    const out = await getPayoutInternalDetail({
      supabase,
      organizationId: ctx.organizationId,
      payoutId: id,
    })
    return json(out)
  } catch (e) {
    const err = classifyInternalApiError(e)
    return json({ error: err.message }, { status: err.status })
  }
}

export async function PATCH(request: Request, routeCtx: { params: Promise<{ id: string }> }) {
  if (!isSupabaseServiceConfigured()) return json({ error: 'Funcionalidade indisponivel no momento.' }, { status: 503 })

  try {
    const { id } = await routeCtx.params
    const ctx = await requireSessionOrgContext()
    assertRole(ctx.role, [...PAYOUTS_INTERNAL_ALLOWED_ROLES])
    const body = (await request.json().catch(() => null)) as unknown
    const payout = await updatePayoutInternal({
      supabase: getSupabaseAdminClient(),
      organizationId: ctx.organizationId,
      actorProfileId: ctx.actorProfileId,
      payoutId: id,
      rawDraft: body,
      providerEnabled: isPayoutProviderEnabled(),
    })
    return json({ payout })
  } catch (e) {
    const err = classifyInternalApiError(e)
    return json({ error: err.message }, { status: err.status })
  }
}

export async function DELETE(_: Request, routeCtx: { params: Promise<{ id: string }> }) {
  if (!isSupabaseServiceConfigured()) return json({ error: 'Funcionalidade indisponivel no momento.' }, { status: 503 })

  try {
    const { id } = await routeCtx.params
    const ctx = await requireSessionOrgContext()
    assertRole(ctx.role, [...PAYOUTS_INTERNAL_ALLOWED_ROLES])
    const out = await deletePayoutInternal({
      supabase: getSupabaseAdminClient(),
      organizationId: ctx.organizationId,
      actorProfileId: ctx.actorProfileId,
      payoutId: id,
    })
    return json(out)
  } catch (e) {
    const err = classifyInternalApiError(e)
    return json({ error: err.message }, { status: err.status })
  }
}


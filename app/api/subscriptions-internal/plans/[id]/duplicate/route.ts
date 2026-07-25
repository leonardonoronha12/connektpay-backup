﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿import { classifyInternalApiError } from '@/lib/api-error'
import { isSupabaseConfigured, isSupabaseServiceConfigured } from '@/lib/env'
import { SUBSCRIPTIONS_INTERNAL_MANAGE_ROLES } from '@/lib/subscriptions-internal-core'
import { duplicateSubscriptionPlanInternal } from '@/lib/subscriptions-internal-service'
import { assertRole, requireSessionOrgContext } from '@/lib/session-org-context'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

export async function POST(_: Request, routeCtx: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return json({ error: 'Funcionalidade indisponivel no momento.' }, { status: 503 })

  try {
    const ctx = await requireSessionOrgContext()
    assertRole(ctx.role, [...SUBSCRIPTIONS_INTERNAL_MANAGE_ROLES])
    const { id } = await routeCtx.params
    const supabase = isSupabaseServiceConfigured() ? getSupabaseAdminClient() : await getSupabaseServerClient()
    const plan = await duplicateSubscriptionPlanInternal({
      supabase,
      organizationId: ctx.organizationId,
      actorProfileId: ctx.actorProfileId,
      planId: id,
    })
    return json({ plan }, { status: 201 })
  } catch (e) {
    const err = classifyInternalApiError(e)
    const status = err.status === 500 && e instanceof Error ? 400 : err.status
    return json({ error: e instanceof Error ? e.message : err.message }, { status })
  }
}


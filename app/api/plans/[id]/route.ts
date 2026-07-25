﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿import { classifyInternalApiError } from '@/lib/api-error'
import { isSupabaseConfigured, isSupabaseServiceConfigured } from '@/lib/env'
import { assertRole, requireSessionOrgContext } from '@/lib/session-org-context'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import { isMissingSubscriptionDbObjectError, updatePlan } from '@/lib/subscription-service'
import { NextResponse } from 'next/server'

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

export async function PATCH(request: Request, ctxRoute: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return json({ error: 'Funcionalidade indisponÃ­vel no momento.' }, { status: 503 })

  try {
    const ctx = await requireSessionOrgContext()
    assertRole(ctx.role, ['owner', 'admin', 'super_admin'])
    const { id } = await ctxRoute.params
    const body = (await request.json().catch(() => null)) as
      | null
      | Partial<{ name: string; description: string | null; amountCents: number; cycle: 'monthly' | 'yearly' | 'weekly'; trialDays: number; status: 'active' | 'inactive' }>
    if (!body) return json({ error: 'Invalid body' }, { status: 400 })

    const supabase = isSupabaseServiceConfigured() ? getSupabaseAdminClient() : await getSupabaseServerClient()
    let out
    try {
      out = await updatePlan({ supabase, organizationId: ctx.organizationId, actorProfileId: ctx.actorProfileId, planId: id, patch: body })
    } catch (e) {
      if (isMissingSubscriptionDbObjectError(e)) {
        return json({ error: 'O mÃ³dulo de planos ainda nÃ£o estÃ¡ disponÃ­vel neste ambiente.' }, { status: 503 })
      }
      throw e
    }
    return json(out)
  } catch (e) {
    const err = classifyInternalApiError(e)
    return json({ error: err.message }, { status: err.status })
  }
}


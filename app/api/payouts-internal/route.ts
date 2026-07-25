﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿import { isPayoutProviderEnabled, isSupabaseConfigured, isSupabaseServiceConfigured } from '@/lib/env'
import { PAYOUTS_INTERNAL_ALLOWED_ROLES } from '@/lib/payouts-internal-core'
import { createPayoutInternal, getPayoutsInternalBootstrap } from '@/lib/payouts-internal-service'
import { assertRole, requireSessionOrgContext } from '@/lib/session-org-context'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import { classifyInternalApiError } from '@/lib/api-error'
import { NextResponse } from 'next/server'

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

export async function GET() {
  if (!isSupabaseConfigured()) {
    return json({
      availableBalanceCents: 0,
      providerEnabled: false,
      eligibleReceivers: [],
      payouts: [],
      summary: { total: 0, requested: 0, underReview: 0, approvedOrScheduled: 0, cancelledOrRejected: 0 },
    })
  }

  try {
    const ctx = await requireSessionOrgContext()
    assertRole(ctx.role, [...PAYOUTS_INTERNAL_ALLOWED_ROLES])
    const supabase = isSupabaseServiceConfigured() ? getSupabaseAdminClient() : await getSupabaseServerClient()
    const out = await getPayoutsInternalBootstrap({
      supabase,
      organizationId: ctx.organizationId,
      providerEnabled: isPayoutProviderEnabled(),
    })
    return json(out)
  } catch (e) {
    const err = classifyInternalApiError(e)
    return json({ error: err.message }, { status: err.status })
  }
}

export async function POST(request: Request) {
  if (!isSupabaseServiceConfigured()) return json({ error: 'Funcionalidade indisponivel no momento.' }, { status: 503 })

  try {
    const ctx = await requireSessionOrgContext()
    assertRole(ctx.role, [...PAYOUTS_INTERNAL_ALLOWED_ROLES])
    const body = (await request.json().catch(() => null)) as unknown
    const payout = await createPayoutInternal({
      supabase: getSupabaseAdminClient(),
      organizationId: ctx.organizationId,
      actorProfileId: ctx.actorProfileId,
      rawDraft: body,
      providerEnabled: isPayoutProviderEnabled(),
    })
    return json({ payout }, { status: 201 })
  } catch (e) {
    const err = classifyInternalApiError(e)
    return json({ error: err.message }, { status: err.status })
  }
}


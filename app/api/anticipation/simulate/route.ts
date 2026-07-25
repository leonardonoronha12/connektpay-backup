﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿import { isSupabaseConfigured } from '@/lib/env'
import { assertRole, requireSessionOrgContext } from '@/lib/session-org-context'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import { classifyInternalApiError, logApiError } from '@/lib/api-error'
import { AnticipationInternalError, getAvailableAnticipationAmount, simulateAnticipation } from '@/lib/anticipation-service'
import { NextResponse } from 'next/server'

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return json({ error: 'Funcionalidade indisponÃ­vel no momento.' }, { status: 503 })
  }

  try {
    const ctx = await requireSessionOrgContext()
    assertRole(ctx.role, ['owner', 'financeiro', 'super_admin'])
    const body = (await request.json().catch(() => null)) as null | { requestedAmountCents?: number; feeBps?: number; receiverId?: string | null }
    const supabase = getSupabaseAdminClient()

    const requested = typeof body?.requestedAmountCents === 'number' && Number.isFinite(body.requestedAmountCents) ? Math.max(0, Math.round(body.requestedAmountCents)) : 0
    const feeBps = typeof body?.feeBps === 'number' && Number.isFinite(body.feeBps) ? Math.max(0, Math.round(body.feeBps)) : 400

    if (!requested) {
      const avail = await getAvailableAnticipationAmount({ supabase, organizationId: ctx.organizationId })
      return json({ ...avail, feeBpsDefault: feeBps, availableAmountCents: avail.availableCents, feeBps, eligibleReceivers: [], issues: [], ok: true })
    }

    const sim = await simulateAnticipation({
      supabase,
      organizationId: ctx.organizationId,
      requestedAmountCents: requested,
      feeBps,
      receiverId: typeof body?.receiverId === 'string' ? body.receiverId : null,
    })
    return json({
      ok: sim.ok,
      availableCents: sim.availableAmountCents,
      balanceCents: sim.balanceCents,
      reservedCents: sim.reservedCents,
      feeBpsDefault: sim.estimatedFeeBps,
      availableAmountCents: sim.availableAmountCents,
      feeBps: sim.estimatedFeeBps,
      feeCents: sim.estimatedFeeCents,
      netCents: sim.netAmountCents,
      requestedAmountCents: sim.requestedAmountCents,
      settlementDays: sim.settlementDays,
      discountCents: sim.discountCents,
      eligibleReceivers: sim.eligibleReceivers,
      issues: sim.issues,
    })
  } catch (e) {
    if (e instanceof AnticipationInternalError) return json({ error: e.message }, { status: e.status })
    logApiError('POST /api/anticipation/simulate failed', e)
    const err = classifyInternalApiError(e)
    return json({ error: err.message }, { status: err.status })
  }
}

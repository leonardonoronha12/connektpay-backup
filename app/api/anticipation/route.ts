﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿import { isAnticipationProviderEnabled, isSupabaseConfigured, isSupabaseServiceConfigured } from '@/lib/env'
import { assertRole, requireSessionOrgContext } from '@/lib/session-org-context'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import { classifyInternalApiError, logApiError } from '@/lib/api-error'
import {
  AnticipationInternalError,
  getAnticipationBootstrap,
  requestAnticipation,
} from '@/lib/anticipation-service'
import { NextResponse } from 'next/server'

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

export async function GET(request: Request) {
  void request
  if (!isSupabaseConfigured()) {
    return json({
      anticipations: [],
      eligibleReceivers: [],
      availableCents: 0,
      balanceCents: 0,
      reservedCents: 0,
      providerEnabled: false,
      summary: { total: 0, requested: 0, underReview: 0, approvedOrScheduled: 0, cancelledOrRejected: 0 },
    })
  }

  try {
    const ctx = await requireSessionOrgContext()
    assertRole(ctx.role, ['owner', 'financeiro', 'super_admin'])
    const supabase = isSupabaseServiceConfigured() ? getSupabaseAdminClient() : await getSupabaseServerClient()
    const out = await getAnticipationBootstrap({
      supabase,
      organizationId: ctx.organizationId,
      providerEnabled: isAnticipationProviderEnabled(),
    })
    return json(out)
  } catch (e) {
    if (e instanceof AnticipationInternalError) return json({ error: e.message }, { status: e.status })
    logApiError('GET /api/anticipation failed', e)
    const err = classifyInternalApiError(e)
    return json({ error: err.message }, { status: err.status })
  }
}

export async function POST(request: Request) {
  if (!isSupabaseServiceConfigured()) return json({ error: 'Funcionalidade indisponivel no momento.' }, { status: 503 })

  try {
    const ctx = await requireSessionOrgContext()
    assertRole(ctx.role, ['owner', 'financeiro', 'super_admin'])
    const body = (await request.json().catch(() => null)) as
      | null
      | {
          requestedAmountCents?: number
          recebedorId?: string | null
          feeBps?: number
          status?: 'draft' | 'requested'
          internalNotes?: string | null
        }
    if (!body || typeof body.requestedAmountCents !== 'number') return json({ error: 'Valor da solicitacao nao informado.' }, { status: 400 })
    if (!body.recebedorId || typeof body.recebedorId !== 'string') return json({ error: 'Recebedor nao informado.' }, { status: 400 })
    const supabase = getSupabaseAdminClient()
    const out = await requestAnticipation({
      supabase,
      organizationId: ctx.organizationId,
      actorProfileId: ctx.actorProfileId,
      recebedorId: typeof body.recebedorId === 'string' ? body.recebedorId : null,
      requestedAmountCents: Math.round(body.requestedAmountCents),
      feeBps: typeof body.feeBps === 'number' ? Math.round(body.feeBps) : undefined,
      status: body.status === 'draft' ? 'draft' : 'requested',
      internalNotes: typeof body.internalNotes === 'string' ? body.internalNotes : null,
    })
    return json(out, { status: 201 })
  } catch (e) {
    if (e instanceof AnticipationInternalError) return json({ error: e.message }, { status: e.status })
    logApiError('POST /api/anticipation failed', e)
    const err = classifyInternalApiError(e)
    return json({ error: err.message }, { status: err.status })
  }
}

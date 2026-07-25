﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿import { classifyInternalApiError } from '@/lib/api-error'
import { isAnticipationProviderEnabled, isSupabaseConfigured, isSupabaseServiceConfigured } from '@/lib/env'
import { assertRole, requireSessionOrgContext } from '@/lib/session-org-context'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import {
  AnticipationInternalError,
  approveAnticipation,
  deleteAnticipation,
  getAnticipationBootstrap,
  rejectAnticipation,
  reviewAnticipation,
  scheduleAnticipation,
} from '@/lib/anticipation-service'
import { NextResponse } from 'next/server'

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

export async function GET() {
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
    assertRole(ctx.role, ['owner', 'admin', 'super_admin'])
    const supabase = isSupabaseServiceConfigured() ? getSupabaseAdminClient() : await getSupabaseServerClient()
    const out = await getAnticipationBootstrap({
      supabase,
      organizationId: ctx.organizationId,
      providerEnabled: isAnticipationProviderEnabled(),
    })
    return json(out)
  } catch (e) {
    if (e instanceof AnticipationInternalError) return json({ error: e.message }, { status: e.status })
    const err = classifyInternalApiError(e)
    return json({ error: err.message }, { status: err.status })
  }
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return json({ error: 'Funcionalidade indisponÃ­vel no momento.' }, { status: 503 })
  if (!isSupabaseServiceConfigured()) return json({ error: 'Funcionalidade indisponÃ­vel no momento.' }, { status: 503 })
  try {
    const ctx = await requireSessionOrgContext()
    assertRole(ctx.role, ['owner', 'admin', 'super_admin'])
    const body = (await request.json().catch(() => null)) as
      | null
      | { action?: 'approve' | 'reject' | 'review' | 'schedule' | 'delete'; id?: string; rejectionReason?: string; expectedSettlementDate?: string; internalNotes?: string }
    if (!body?.id) return json({ error: 'Identificador da solicitacao nao informado.' }, { status: 400 })
    if (!body.action) return json({ error: 'Acao nao informada.' }, { status: 400 })
    const supabase = getSupabaseAdminClient()
    let out: unknown
    if (body.action === 'approve') {
      out = await approveAnticipation({
        supabase,
        organizationId: ctx.organizationId,
        actorProfileId: ctx.actorProfileId,
        id: body.id,
        internalNotes: typeof body.internalNotes === 'string' ? body.internalNotes : null,
      })
    } else if (body.action === 'reject') {
      if (!body.rejectionReason) return json({ error: 'Motivo da reprovacao nao informado.' }, { status: 400 })
      out = await rejectAnticipation({
        supabase,
        organizationId: ctx.organizationId,
        actorProfileId: ctx.actorProfileId,
        id: body.id,
        rejectionReason: body.rejectionReason,
        internalNotes: typeof body.internalNotes === 'string' ? body.internalNotes : null,
      })
    } else if (body.action === 'review') {
      out = await reviewAnticipation({
        supabase,
        organizationId: ctx.organizationId,
        actorProfileId: ctx.actorProfileId,
        id: body.id,
        internalNotes: typeof body.internalNotes === 'string' ? body.internalNotes : null,
      })
    } else if (body.action === 'schedule') {
      if (!body.expectedSettlementDate) return json({ error: 'Data prevista nao informada.' }, { status: 400 })
      out = await scheduleAnticipation({
        supabase,
        organizationId: ctx.organizationId,
        actorProfileId: ctx.actorProfileId,
        id: body.id,
        expectedSettlementDate: body.expectedSettlementDate,
        internalNotes: typeof body.internalNotes === 'string' ? body.internalNotes : null,
      })
    } else if (body.action === 'delete') {
      out = await deleteAnticipation({
        supabase,
        organizationId: ctx.organizationId,
        actorProfileId: ctx.actorProfileId,
        id: body.id,
      })
    } else {
      return json({ error: 'Acao invalida.' }, { status: 400 })
    }
    return json(out)
  } catch (e) {
    if (e instanceof AnticipationInternalError) return json({ error: e.message }, { status: e.status })
    const err = classifyInternalApiError(e)
    return json({ error: err.message }, { status: err.status })
  }
}


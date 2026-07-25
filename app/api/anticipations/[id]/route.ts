import { isSupabaseConfigured, isSupabaseServiceConfigured } from '@/lib/env'
import { assertRole, requireSessionOrgContext } from '@/lib/session-org-context'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import {
  approveAnticipation,
  AnticipationInternalError,
  cancelAnticipation,
  rejectAnticipation,
  reviewAnticipation,
  scheduleAnticipation,
} from '@/lib/anticipation-service'
import { classifyInternalApiError } from '@/lib/api-error'
import { NextResponse } from 'next/server'

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

export async function PATCH(request: Request, ctxRoute: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return json({ error: 'Funcionalidade indisponível no momento.' }, { status: 503 })
  try {
    const ctx = await requireSessionOrgContext()
    assertRole(ctx.role, ['owner', 'financeiro', 'super_admin'])
    const { id } = await ctxRoute.params
    const body = (await request.json().catch(() => null)) as
      | null
      | {
          action?: 'review' | 'approve' | 'reject' | 'schedule' | 'cancel'
          status?: 'under_review' | 'approved' | 'rejected' | 'scheduled' | 'cancelled'
          rejectionReason?: string | null
          expectedSettlementDate?: string | null
          internalNotes?: string | null
        }
    if (!body) return json({ error: 'Invalid body' }, { status: 400 })

    const action =
      typeof body.action === 'string'
        ? body.action
        : body.status === 'under_review'
          ? 'review'
          : body.status === 'approved'
            ? 'approve'
            : body.status === 'rejected'
              ? 'reject'
              : body.status === 'scheduled'
                ? 'schedule'
                : body.status === 'cancelled'
                  ? 'cancel'
                  : null
    if (!action) return json({ error: 'Informe uma ação válida para a antecipação.' }, { status: 400 })

    const supabase = isSupabaseServiceConfigured() ? getSupabaseAdminClient() : await getSupabaseServerClient()
    let out
    if (action === 'review') {
      out = await reviewAnticipation({
        supabase,
        organizationId: ctx.organizationId,
        actorProfileId: ctx.actorProfileId,
        id,
        internalNotes: typeof body.internalNotes === 'string' ? body.internalNotes : null,
      })
    } else if (action === 'approve') {
      out = await approveAnticipation({
        supabase,
        organizationId: ctx.organizationId,
        actorProfileId: ctx.actorProfileId,
        id,
        internalNotes: typeof body.internalNotes === 'string' ? body.internalNotes : null,
      })
    } else if (action === 'reject') {
      const rejectionReason = typeof body.rejectionReason === 'string' ? body.rejectionReason.trim() : ''
      if (!rejectionReason) return json({ error: 'Informe o motivo da rejeição.' }, { status: 400 })
      out = await rejectAnticipation({
        supabase,
        organizationId: ctx.organizationId,
        actorProfileId: ctx.actorProfileId,
        id,
        rejectionReason,
        internalNotes: typeof body.internalNotes === 'string' ? body.internalNotes : null,
      })
    } else if (action === 'schedule') {
      const expectedSettlementDate =
        typeof body.expectedSettlementDate === 'string' ? body.expectedSettlementDate.trim() : ''
      if (!expectedSettlementDate) return json({ error: 'Informe a data prevista para o agendamento.' }, { status: 400 })
      out = await scheduleAnticipation({
        supabase,
        organizationId: ctx.organizationId,
        actorProfileId: ctx.actorProfileId,
        id,
        expectedSettlementDate,
        internalNotes: typeof body.internalNotes === 'string' ? body.internalNotes : null,
      })
    } else {
      out = await cancelAnticipation({
        supabase,
        organizationId: ctx.organizationId,
        actorProfileId: ctx.actorProfileId,
        id,
      })
    }
    return json(out)
  } catch (e) {
    if (e instanceof AnticipationInternalError) return json({ error: e.message }, { status: e.status })
    const err = classifyInternalApiError(e)
    return json({ error: err.message }, { status: err.status })
  }
}

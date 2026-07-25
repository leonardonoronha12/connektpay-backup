﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿import { isSupabaseConfigured, isSupabaseServiceConfigured } from '@/lib/env'
import { assertRole, requireSessionOrgContext } from '@/lib/session-org-context'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import { classifyInternalApiError } from '@/lib/api-error'
import { AnticipationInternalError, listAnticipations, requestAnticipation, simulateAnticipation } from '@/lib/anticipation-service'
import { NextResponse } from 'next/server'

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) return json({ anticipationRequests: [] })

  try {
    const ctx = await requireSessionOrgContext()
    assertRole(ctx.role, ['owner', 'financeiro', 'super_admin'])
    const supabase = isSupabaseServiceConfigured() ? getSupabaseAdminClient() : await getSupabaseServerClient()
    const out = await listAnticipations({ supabase, organizationId: ctx.organizationId })
    return json({ anticipationRequests: out.anticipations })
  } catch (e) {
    if (e instanceof AnticipationInternalError) return json({ error: e.message }, { status: e.status })
    const err = classifyInternalApiError(e)
    return json({ error: err.message }, { status: err.status })
  }
}

export async function POST(request: Request) {
  if (!isSupabaseServiceConfigured()) return json({ error: 'Funcionalidade indisponÃ­vel no momento.' }, { status: 503 })
  try {
    const ctx = await requireSessionOrgContext()
    assertRole(ctx.role, ['owner', 'financeiro', 'super_admin'])
    const body = (await request.json().catch(() => null)) as null | { requestedAmount?: number; recebedorId?: string | null; feeBps?: number }
    if (!body || typeof body.requestedAmount !== 'number') return json({ error: 'Valor da solicitacao nao informado.' }, { status: 400 })
    if (!body.recebedorId || typeof body.recebedorId !== 'string') return json({ error: 'Recebedor nao informado.' }, { status: 400 })
    const supabase = getSupabaseAdminClient()
    const sim = await simulateAnticipation({
      supabase,
      organizationId: ctx.organizationId,
      requestedAmountCents: body.requestedAmount,
      feeBps: body.feeBps,
      receiverId: body.recebedorId,
    })
    const out = await requestAnticipation({
      supabase,
      organizationId: ctx.organizationId,
      actorProfileId: ctx.actorProfileId,
      recebedorId: typeof body.recebedorId === 'string' ? body.recebedorId : null,
      requestedAmountCents: sim.requestedAmountCents,
      feeBps: sim.estimatedFeeBps,
    })
    return json(out, { status: 201 })
  } catch (e) {
    if (e instanceof AnticipationInternalError) return json({ error: e.message }, { status: e.status })
    const err = classifyInternalApiError(e)
    return json({ error: err.message }, { status: err.status })
  }
}


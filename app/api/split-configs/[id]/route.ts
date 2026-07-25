﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿import { isSupabaseConfigured, isSupabaseServiceConfigured } from '@/lib/env'
import { classifyInternalApiError } from '@/lib/api-error'
import { assertRole, requireSessionOrgContext } from '@/lib/session-org-context'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import {
  deleteSplitConfig,
  getSplitConfigById,
  updateSplitConfig,
  updateSplitConfigStatus,
} from '@/lib/split-internal-service'
import { SPLIT_INTERNAL_ALLOWED_ROLES } from '@/lib/split-internal-core'
import { NextResponse } from 'next/server'

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

export async function GET(_request: Request, routeCtx: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return json({ error: 'Funcionalidade indisponÃ­vel no momento.' }, { status: 503 })

  try {
    const { id } = await routeCtx.params
    const ctx = await requireSessionOrgContext()
    assertRole(ctx.role, [...SPLIT_INTERNAL_ALLOWED_ROLES])
    const supabase = isSupabaseServiceConfigured() ? getSupabaseAdminClient() : await getSupabaseServerClient()
    const splitConfig = await getSplitConfigById({ supabase, organizationId: ctx.organizationId, id })
    return json({ splitConfig })
  } catch (e) {
    const err = classifyInternalApiError(e)
    const status = err.status === 500 && e instanceof Error && e.message === 'Regra nÃ£o encontrada.' ? 404 : err.status
    return json({ error: e instanceof Error ? e.message : err.message }, { status })
  }
}

export async function PATCH(request: Request, routeCtx: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return json({ error: 'Funcionalidade indisponÃ­vel no momento.' }, { status: 503 })

  try {
    const { id } = await routeCtx.params
    const ctx = await requireSessionOrgContext()
    assertRole(ctx.role, [...SPLIT_INTERNAL_ALLOWED_ROLES])
    const body = await request.json().catch(() => null)
    if (!body) return json({ error: 'Dados invÃ¡lidos.' }, { status: 400 })

    const supabase = isSupabaseServiceConfigured() ? getSupabaseAdminClient() : await getSupabaseServerClient()
    const statusOnly = Object.keys(body).length === 1 && (body.status === 'active' || body.status === 'inactive')
    const splitConfig = statusOnly
      ? await updateSplitConfigStatus({
          supabase,
          organizationId: ctx.organizationId,
          actorProfileId: ctx.actorProfileId,
          id,
          status: body.status,
        })
      : await updateSplitConfig({
          supabase,
          organizationId: ctx.organizationId,
          actorProfileId: ctx.actorProfileId,
          id,
          rawDraft: body,
        })

    return json({ splitConfig })
  } catch (e) {
    const err = classifyInternalApiError(e)
    const status = err.status === 500 && e instanceof Error ? 400 : err.status
    return json({ error: e instanceof Error ? e.message : err.message }, { status })
  }
}

export async function DELETE(_request: Request, routeCtx: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return json({ error: 'Funcionalidade indisponÃ­vel no momento.' }, { status: 503 })

  try {
    const { id } = await routeCtx.params
    const ctx = await requireSessionOrgContext()
    assertRole(ctx.role, [...SPLIT_INTERNAL_ALLOWED_ROLES])
    const supabase = isSupabaseServiceConfigured() ? getSupabaseAdminClient() : await getSupabaseServerClient()
    const result = await deleteSplitConfig({
      supabase,
      organizationId: ctx.organizationId,
      actorProfileId: ctx.actorProfileId,
      id,
    })
    return json(result)
  } catch (e) {
    const err = classifyInternalApiError(e)
    const status = err.status === 500 && e instanceof Error ? 400 : err.status
    return json({ error: e instanceof Error ? e.message : err.message }, { status })
  }
}


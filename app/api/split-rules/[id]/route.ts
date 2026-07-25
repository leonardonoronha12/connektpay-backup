﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿import { isSupabaseConfigured, isSupabaseServiceConfigured } from '@/lib/env'
import { insertAuditLog } from '@/lib/audit-log'
import { assertRole, requireSessionOrgContext } from '@/lib/session-org-context'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import { classifyInternalApiError } from '@/lib/api-error'
import { NextResponse } from 'next/server'

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

function isLegacySplitRuleSchemaError(error: unknown) {
  const text = String((error as any)?.message ?? (error as any)?.details ?? '').toLowerCase()
  return text.includes('value_cents') || text.includes('percentage_bps')
}

async function supportsExpandedSplitRuleFields(supabase: any) {
  const { error } = await supabase.from('split_rules').select('id, value_cents, percentage_bps').limit(1)
  if (!error) return true
  if (isLegacySplitRuleSchemaError(error)) return false
  throw error
}

function mapLegacySplitRule(row: any) {
  const numericValue = typeof row?.value === 'number' ? row.value : Number(row?.value ?? 0)
  const isFixed = row?.type === 'fixed'
  return {
    id: row?.id ?? null,
    receiver_id: row?.receiver_id ?? null,
    payment_link_id: row?.payment_link_id ?? null,
    type: row?.type ?? null,
    value_cents: isFixed && Number.isFinite(numericValue) ? Math.round(numericValue) : null,
    percentage_bps: !isFixed && Number.isFinite(numericValue) ? Math.round(numericValue * 100) : null,
    priority: typeof row?.priority === 'number' ? row.priority : 0,
    status: row?.status ?? 'active',
    created_at: row?.created_at ?? null,
  }
}

export async function PATCH(request: Request, ctxRoute: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return json({ error: 'Funcionalidade indisponÃ­vel no momento.' }, { status: 503 })
  if (!isSupabaseServiceConfigured()) return json({ error: 'Funcionalidade indisponÃ­vel no momento.' }, { status: 503 })

  try {
    const { id } = await ctxRoute.params
    const ctx = await requireSessionOrgContext()
    assertRole(ctx.role, ['owner', 'admin', 'operacional', 'super_admin'])

    const body = (await request.json().catch(() => null)) as
      | null
      | {
          status?: 'active' | 'inactive'
          priority?: number
          valueCents?: number
          percentageBps?: number
        }
    if (!body) return json({ error: 'Invalid body' }, { status: 400 })

    const supabase = isSupabaseServiceConfigured() ? getSupabaseAdminClient() : await getSupabaseServerClient()
    const expandedFields = await supportsExpandedSplitRuleFields(supabase)

    const { data: before } = await supabase
      .from('split_rules')
      .select(expandedFields ? 'id, receiver_id, payment_link_id, type, value_cents, percentage_bps, priority, status, created_at' : 'id, receiver_id, payment_link_id, type, value, priority, status, created_at')
      .eq('organization_id', ctx.organizationId)
      .eq('id', id)
      .maybeSingle()

    if (!before) return json({ error: 'Regra nÃ£o encontrada.' }, { status: 404 })

    const updates: Record<string, unknown> = {}
    if (body.status) updates.status = body.status
    if (typeof body.priority === 'number' && Number.isInteger(body.priority)) updates.priority = body.priority

    if (typeof body.valueCents === 'number' || typeof body.percentageBps === 'number') {
      if ((before as any).type === 'fixed') {
        const valueCents = typeof body.valueCents === 'number' && Number.isInteger(body.valueCents) && body.valueCents > 0 ? body.valueCents : null
        if (!valueCents) return json({ error: 'Invalid valueCents' }, { status: 400 })
        if (expandedFields) {
          updates.value_cents = valueCents
          updates.percentage_bps = null
        }
        updates.value = valueCents
      } else {
        const percentageBps =
          typeof body.percentageBps === 'number' && Number.isInteger(body.percentageBps) && body.percentageBps > 0 && body.percentageBps <= 10000
            ? body.percentageBps
            : null
        if (!percentageBps) return json({ error: 'Invalid percentageBps' }, { status: 400 })
        if (expandedFields) {
          updates.percentage_bps = percentageBps
          updates.value_cents = null
        }
        updates.value = percentageBps / 100
      }
    }

    const { data, error } = await supabase
      .from('split_rules')
      .update(updates)
      .eq('organization_id', ctx.organizationId)
      .eq('id', id)
      .select(expandedFields ? 'id, receiver_id, payment_link_id, type, value_cents, percentage_bps, priority, status, created_at' : 'id, receiver_id, payment_link_id, type, value, priority, status, created_at')
      .single()

    if (error) return json({ error: 'NÃ£o foi possÃ­vel atualizar a regra agora.' }, { status: 500 })
    const updatedRule = data as any

    await insertAuditLog({
      organizationId: ctx.organizationId,
      actorProfileId: ctx.actorProfileId,
      actorUserId: ctx.actorProfileId,
      authType: 'session',
      origin: 'internal_api',
      action: 'UPDATE',
      entity: 'split_rule',
      entityId: id,
      before,
      after: updatedRule,
    })

    return json({ splitRule: expandedFields ? updatedRule : mapLegacySplitRule(updatedRule) })
  } catch (e) {
    const err = classifyInternalApiError(e)
    return json({ error: err.message }, { status: err.status })
  }
}

export async function DELETE(request: Request, ctxRoute: { params: Promise<{ id: string }> }) {
  void request
  if (!isSupabaseConfigured()) return json({ error: 'Funcionalidade indisponÃ­vel no momento.' }, { status: 503 })
  if (!isSupabaseServiceConfigured()) return json({ error: 'Funcionalidade indisponÃ­vel no momento.' }, { status: 503 })

  try {
    const { id } = await ctxRoute.params
    const ctx = await requireSessionOrgContext()
    assertRole(ctx.role, ['owner', 'admin', 'operacional', 'super_admin'])

    const supabase = isSupabaseServiceConfigured() ? getSupabaseAdminClient() : await getSupabaseServerClient()
    const expandedFields = await supportsExpandedSplitRuleFields(supabase)

    const { data: before } = await supabase
      .from('split_rules')
      .select(expandedFields ? 'id, receiver_id, payment_link_id, type, value_cents, percentage_bps, priority, status, created_at' : 'id, receiver_id, payment_link_id, type, value, priority, status, created_at')
      .eq('organization_id', ctx.organizationId)
      .eq('id', id)
      .maybeSingle()

    const { error } = await supabase.from('split_rules').delete().eq('organization_id', ctx.organizationId).eq('id', id)
    if (error) return json({ error: 'NÃ£o foi possÃ­vel remover a regra agora.' }, { status: 500 })

    if (before) {
      await insertAuditLog({
        organizationId: ctx.organizationId,
        actorProfileId: ctx.actorProfileId,
        actorUserId: ctx.actorProfileId,
        authType: 'session',
        origin: 'internal_api',
        action: 'DELETE',
        entity: 'split_rule',
        entityId: id,
        before,
        after: null,
      })
    }

    return json({ ok: true })
  } catch (e) {
    const err = classifyInternalApiError(e)
    return json({ error: err.message }, { status: err.status })
  }
}


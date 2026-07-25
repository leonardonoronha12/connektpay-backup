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

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) return json({ splitRules: [] })

  try {
    const ctx = await requireSessionOrgContext()
    assertRole(ctx.role, ['owner', 'admin', 'operacional', 'super_admin'])
    const supabase = isSupabaseServiceConfigured() ? getSupabaseAdminClient() : await getSupabaseServerClient()
    const paymentLinkId = new URL(request.url).searchParams.get('paymentLinkId')
    const expandedFields = await supportsExpandedSplitRuleFields(supabase)

    let query = supabase
      .from('split_rules')
      .select(expandedFields ? 'id, receiver_id, payment_link_id, type, value_cents, percentage_bps, priority, status, created_at' : 'id, receiver_id, payment_link_id, type, value, priority, status, created_at')
      .eq('organization_id', ctx.organizationId)
      .order('priority', { ascending: false })

    if (paymentLinkId) query = query.eq('payment_link_id', paymentLinkId)

    const { data, error } = await query
    if (error) return json({ error: 'NÃ£o foi possÃ­vel carregar as regras de split agora.' }, { status: 500 })
    return json({ splitRules: expandedFields ? data ?? [] : (data ?? []).map(mapLegacySplitRule) })
  } catch (e) {
    const err = classifyInternalApiError(e)
    return json({ error: err.message }, { status: err.status })
  }
}

export async function POST(request: Request) {
  if (!isSupabaseServiceConfigured()) return json({ error: 'Funcionalidade indisponÃ­vel no momento.' }, { status: 503 })

  try {
    const ctx = await requireSessionOrgContext()
    assertRole(ctx.role, ['owner', 'admin', 'operacional', 'super_admin'])

    const body = (await request.json().catch(() => null)) as
      | null
      | {
          receiverId?: string
          paymentLinkId?: string | null
          type?: 'percentage' | 'fixed'
          valueCents?: number
          percentageBps?: number
          priority?: number
          status?: 'active' | 'inactive'
        }

    if (!body?.receiverId) return json({ error: 'Missing receiverId' }, { status: 400 })
    if (body.type !== 'percentage' && body.type !== 'fixed') return json({ error: 'Invalid type' }, { status: 400 })

    const valueCents = typeof body.valueCents === 'number' && Number.isInteger(body.valueCents) && body.valueCents > 0 ? body.valueCents : null
    const percentageBps =
      typeof body.percentageBps === 'number' && Number.isInteger(body.percentageBps) && body.percentageBps > 0 && body.percentageBps <= 10000
        ? body.percentageBps
        : null

    if (body.type === 'fixed' && !valueCents) return json({ error: 'Missing valueCents' }, { status: 400 })
    if (body.type === 'percentage' && !percentageBps) return json({ error: 'Missing percentageBps' }, { status: 400 })

    const supabase = getSupabaseAdminClient()
    const expandedFields = await supportsExpandedSplitRuleFields(supabase)

    const { data: receiver } = await supabase
      .from('receivers')
      .select('id')
      .eq('organization_id', ctx.organizationId)
      .eq('id', body.receiverId)
      .maybeSingle()
    if (!receiver) return json({ error: 'Receiver not found' }, { status: 404 })

    if (body.paymentLinkId) {
      const { data: link } = await supabase
        .from('payment_links')
        .select('id')
        .eq('organization_id', ctx.organizationId)
        .eq('id', body.paymentLinkId)
        .maybeSingle()
      if (!link) return json({ error: 'Payment link not found' }, { status: 404 })
    }

    const { data, error } = await supabase
      .from('split_rules')
      .insert({
        organization_id: ctx.organizationId,
        receiver_id: body.receiverId,
        payment_link_id: body.paymentLinkId ?? null,
        type: body.type,
        value: body.type === 'fixed' ? valueCents : (percentageBps as number) / 100,
        ...(expandedFields
          ? {
              value_cents: body.type === 'fixed' ? valueCents : null,
              percentage_bps: body.type === 'percentage' ? percentageBps : null,
            }
          : {}),
        priority: typeof body.priority === 'number' && Number.isInteger(body.priority) ? body.priority : 0,
        status: body.status === 'inactive' ? 'inactive' : 'active',
      })
      .select(expandedFields ? 'id, receiver_id, payment_link_id, type, value_cents, percentage_bps, priority, status, created_at' : 'id, receiver_id, payment_link_id, type, value, priority, status, created_at')
      .single()

    if (error) return json({ error: 'NÃ£o foi possÃ­vel criar a regra de split agora.' }, { status: 500 })
    const createdRule = data as any

    await insertAuditLog({
      organizationId: ctx.organizationId,
      actorProfileId: ctx.actorProfileId,
      actorUserId: ctx.actorProfileId,
      authType: 'session',
      origin: 'internal_api',
      action: 'CREATE',
      entity: 'split_rule',
      entityId: createdRule.id as string,
      before: null,
      after: createdRule,
    })

    return json({ splitRule: expandedFields ? createdRule : mapLegacySplitRule(createdRule) }, { status: 201 })
  } catch (e) {
    const err = classifyInternalApiError(e)
    return json({ error: err.message }, { status: err.status })
  }
}


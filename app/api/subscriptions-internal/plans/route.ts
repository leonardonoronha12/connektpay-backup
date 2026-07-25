﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿import { classifyInternalApiError } from '@/lib/api-error'
import { buildCsvFilename, buildCsvString } from '@/lib/csv'
import { isSupabaseConfigured, isSupabaseServiceConfigured } from '@/lib/env'
import { SUBSCRIPTIONS_INTERNAL_MANAGE_ROLES, SUBSCRIPTIONS_INTERNAL_READ_ROLES } from '@/lib/subscriptions-internal-core'
import { createSubscriptionPlanInternal, listSubscriptionsInternal } from '@/lib/subscriptions-internal-service'
import { assertRole, requireSessionOrgContext } from '@/lib/session-org-context'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) return json({ plans: [] })

  try {
    const ctx = await requireSessionOrgContext()
    assertRole(ctx.role, [...SUBSCRIPTIONS_INTERNAL_READ_ROLES])
    const format = new URL(request.url).searchParams.get('format')
    const supabase = isSupabaseServiceConfigured() ? getSupabaseAdminClient() : await getSupabaseServerClient()
    const out = await listSubscriptionsInternal({ supabase, organizationId: ctx.organizationId })
    if (format === 'csv') {
      const csv = buildCsvString(
        [
          { key: 'id', header: 'id' },
          { key: 'name', header: 'name' },
          { key: 'receiver_name', header: 'receiver_name' },
          { key: 'receiver_document', header: 'receiver_document' },
          { key: 'amount_centavos', header: 'amount_centavos' },
          { key: 'currency', header: 'currency' },
          { key: 'cycle', header: 'cycle' },
          { key: 'trial_days', header: 'trial_days' },
          { key: 'billing_cycles_limit', header: 'billing_cycles_limit' },
          { key: 'is_infinite', header: 'is_infinite' },
          { key: 'status', header: 'status' },
          { key: 'starts_at', header: 'starts_at' },
          { key: 'ends_at', header: 'ends_at' },
          { key: 'created_at', header: 'created_at' },
          { key: 'updated_at', header: 'updated_at' },
        ],
        (out.plans ?? []).map((plan: any) => ({
          id: plan.id ?? '',
          name: plan.name ?? '',
          receiver_name: plan.receiver?.name ?? '',
          receiver_document: plan.receiver?.document ?? '',
          amount_centavos: Number(plan.amountCents ?? 0),
          currency: plan.currency ?? 'BRL',
          cycle: plan.cycle ?? '',
          trial_days: Number(plan.trialDays ?? 0),
          billing_cycles_limit: plan.billingCyclesLimit ?? '',
          is_infinite: Boolean(plan.isInfinite),
          status: plan.status ?? '',
          starts_at: plan.startsAt ?? '',
          ends_at: plan.endsAt ?? '',
          created_at: plan.createdAt ?? '',
          updated_at: plan.updatedAt ?? '',
        }))
      )
      return new NextResponse(csv, {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="${buildCsvFilename('subscriptions-plans-internal')}"`,
        },
      })
    }
    return json({ plans: out.plans })
  } catch (e) {
    const err = classifyInternalApiError(e)
    return json({ error: err.message }, { status: err.status })
  }
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return json({ error: 'Funcionalidade indisponivel no momento.' }, { status: 503 })

  try {
    const ctx = await requireSessionOrgContext()
    assertRole(ctx.role, [...SUBSCRIPTIONS_INTERNAL_MANAGE_ROLES])
    const body = await request.json().catch(() => null)
    if (!body) return json({ error: 'Dados invalidos.' }, { status: 400 })
    const supabase = isSupabaseServiceConfigured() ? getSupabaseAdminClient() : await getSupabaseServerClient()
    const plan = await createSubscriptionPlanInternal({
      supabase,
      organizationId: ctx.organizationId,
      actorProfileId: ctx.actorProfileId,
      rawDraft: body,
    })
    return json({ plan }, { status: 201 })
  } catch (e) {
    const err = classifyInternalApiError(e)
    const status = err.status === 500 && e instanceof Error ? 400 : err.status
    return json({ error: e instanceof Error ? e.message : err.message }, { status })
  }
}


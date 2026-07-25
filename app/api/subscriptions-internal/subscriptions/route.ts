﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿import { classifyInternalApiError } from '@/lib/api-error'
import { buildCsvFilename, buildCsvString } from '@/lib/csv'
import { isSubscriptionsProviderEnabled, isSupabaseConfigured, isSupabaseServiceConfigured } from '@/lib/env'
import { SUBSCRIPTIONS_INTERNAL_MANAGE_ROLES, SUBSCRIPTIONS_INTERNAL_READ_ROLES } from '@/lib/subscriptions-internal-core'
import { createSubscriptionInternal, listSubscriptionsInternal } from '@/lib/subscriptions-internal-service'
import { assertRole, requireSessionOrgContext } from '@/lib/session-org-context'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) return json({ subscriptions: [] })

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
          { key: 'status', header: 'status' },
          { key: 'plan_name', header: 'plan_name' },
          { key: 'receiver_name', header: 'receiver_name' },
          { key: 'customer_name', header: 'customer_name' },
          { key: 'customer_email', header: 'customer_email' },
          { key: 'customer_document', header: 'customer_document' },
          { key: 'joined_at', header: 'joined_at' },
          { key: 'next_charge_at', header: 'next_charge_at' },
          { key: 'last_charge_at', header: 'last_charge_at' },
          { key: 'billing_cycles_completed', header: 'billing_cycles_completed' },
          { key: 'created_at', header: 'created_at' },
          { key: 'updated_at', header: 'updated_at' },
        ],
        (out.subscriptions ?? []).map((subscription: any) => ({
          id: subscription.id ?? '',
          status: subscription.status ?? '',
          plan_name: subscription.plan?.name ?? '',
          receiver_name: subscription.receiver?.name ?? '',
          customer_name: subscription.customer?.name ?? '',
          customer_email: subscription.customer?.email ?? '',
          customer_document: subscription.customer?.document ?? '',
          joined_at: subscription.joinedAt ?? '',
          next_charge_at: subscription.nextChargeAt ?? '',
          last_charge_at: subscription.lastChargeAt ?? '',
          billing_cycles_completed: Number(subscription.billingCyclesCompleted ?? 0),
          created_at: subscription.createdAt ?? '',
          updated_at: subscription.updatedAt ?? '',
        }))
      )
      return new NextResponse(csv, {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="${buildCsvFilename('subscriptions-internal')}"`,
        },
      })
    }
    return json({ subscriptions: out.subscriptions })
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
    const subscription = await createSubscriptionInternal({
      supabase,
      organizationId: ctx.organizationId,
      actorProfileId: ctx.actorProfileId,
      rawDraft: body,
      providerEnabled: isSubscriptionsProviderEnabled(),
    })
    return json({ subscription }, { status: 201 })
  } catch (e) {
    const err = classifyInternalApiError(e)
    const status = err.status === 500 && e instanceof Error ? 400 : err.status
    return json({ error: e instanceof Error ? e.message : err.message }, { status })
  }
}


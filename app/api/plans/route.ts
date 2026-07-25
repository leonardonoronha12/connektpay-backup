﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿import { classifyInternalApiError } from '@/lib/api-error'
import { isSupabaseConfigured, isSupabaseServiceConfigured } from '@/lib/env'
import { assertRole, requireSessionOrgContext } from '@/lib/session-org-context'
import { buildCsvFilename, buildCsvString } from '@/lib/csv'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import { createPlan, isMissingSubscriptionDbObjectError, listPlans } from '@/lib/subscription-service'
import { NextResponse } from 'next/server'

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) return json({ plans: [] })
  try {
    const ctx = await requireSessionOrgContext()
    assertRole(ctx.role, ['owner', 'admin', 'super_admin'])
    const format = new URL(request.url).searchParams.get('format')
    const supabase = isSupabaseServiceConfigured() ? getSupabaseAdminClient() : await getSupabaseServerClient()
    let out
    try {
      out = await listPlans({ supabase, organizationId: ctx.organizationId })
    } catch (e) {
      if (isMissingSubscriptionDbObjectError(e)) return json({ plans: [] })
      throw e
    }
    if (format === 'csv') {
      const rows = (out?.plans ?? []).map((plan: any) => ({
        id: plan.id,
        receiver_id: plan.recebedor_id ?? '',
        payment_link_id: plan.payment_link_id ?? '',
        name: plan.name ?? '',
        description: plan.description ?? '',
        amount_centavos: Number(plan.amount_centavos ?? 0),
        cycle: plan.cycle ?? '',
        trial_days: Number(plan.trial_days ?? 0),
        payment_method: plan.payment_method ?? '',
        status: plan.status ?? '',
        created_at: plan.created_at ?? '',
        updated_at: plan.updated_at ?? '',
      }))
      const csv = buildCsvString(
        [
          { key: 'id', header: 'id' },
          { key: 'receiver_id', header: 'receiver_id' },
          { key: 'payment_link_id', header: 'payment_link_id' },
          { key: 'name', header: 'name' },
          { key: 'description', header: 'description' },
          { key: 'amount_centavos', header: 'amount_centavos' },
          { key: 'cycle', header: 'cycle' },
          { key: 'trial_days', header: 'trial_days' },
          { key: 'payment_method', header: 'payment_method' },
          { key: 'status', header: 'status' },
          { key: 'created_at', header: 'created_at' },
          { key: 'updated_at', header: 'updated_at' },
        ],
        rows
      )
      return new NextResponse(csv, {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="${buildCsvFilename('plans')}"`,
        },
      })
    }
    return json(out)
  } catch (e) {
    const err = classifyInternalApiError(e)
    return json({ error: err.message }, { status: err.status })
  }
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return json({ error: 'Funcionalidade indisponÃ­vel no momento.' }, { status: 503 })
  try {
    const ctx = await requireSessionOrgContext()
    assertRole(ctx.role, ['owner', 'admin', 'super_admin'])
    const supabase = isSupabaseServiceConfigured() ? getSupabaseAdminClient() : await getSupabaseServerClient()

    const body = (await request.json().catch(() => null)) as
      | null
      | { receiverId?: string; name?: string; description?: string | null; amountCents?: number; cycle?: 'monthly' | 'yearly' | 'weekly'; trialDays?: number }

    if (!body?.receiverId) return json({ error: 'Missing receiverId' }, { status: 400 })
    if (!body?.name) return json({ error: 'Missing name' }, { status: 400 })
    if (typeof body.amountCents !== 'number') return json({ error: 'Missing amountCents' }, { status: 400 })
    if (body.cycle !== 'monthly' && body.cycle !== 'yearly' && body.cycle !== 'weekly') return json({ error: 'Invalid cycle' }, { status: 400 })
    const paymentMethod = (body as any)?.paymentMethod
    if (paymentMethod != null && paymentMethod !== 'card' && paymentMethod !== 'pix_auto') return json({ error: 'Invalid paymentMethod' }, { status: 400 })

    let out
    try {
      out = await createPlan({
        supabase,
        organizationId: ctx.organizationId,
        actorProfileId: ctx.actorProfileId,
        receiverId: body.receiverId,
        name: body.name,
        description: body.description ?? null,
        amountCents: body.amountCents,
        cycle: body.cycle,
        trialDays: typeof body.trialDays === 'number' ? body.trialDays : 0,
        paymentMethod: paymentMethod === 'pix_auto' ? 'pix_auto' : 'card',
      })
    } catch (e) {
      if (isMissingSubscriptionDbObjectError(e)) {
        return json({ error: 'O mÃ³dulo de planos ainda nÃ£o estÃ¡ disponÃ­vel neste ambiente.' }, { status: 503 })
      }
      throw e
    }

    return json(out, { status: 201 })
  } catch (e) {
    const err = classifyInternalApiError(e)
    return json({ error: err.message }, { status: err.status })
  }
}


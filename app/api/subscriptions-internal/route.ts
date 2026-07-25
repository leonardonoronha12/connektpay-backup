import { classifyInternalApiError } from '@/lib/api-error'
import { isSubscriptionsProviderEnabled, isSupabaseConfigured, isSupabaseServiceConfigured } from '@/lib/env'
import { SUBSCRIPTIONS_INTERNAL_READ_ROLES } from '@/lib/subscriptions-internal-core'
import { getSubscriptionsInternalBootstrap } from '@/lib/subscriptions-internal-service'
import { assertRole, requireSessionOrgContext } from '@/lib/session-org-context'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

export async function GET() {
  if (!isSupabaseConfigured()) {
    return json({
      plans: [],
      customers: [],
      subscriptions: [],
      eligibleReceivers: [],
      providerEnabled: false,
    })
  }

  try {
    const ctx = await requireSessionOrgContext()
    assertRole(ctx.role, [...SUBSCRIPTIONS_INTERNAL_READ_ROLES])
    const supabase = isSupabaseServiceConfigured() ? getSupabaseAdminClient() : await getSupabaseServerClient()
    const out = await getSubscriptionsInternalBootstrap({
      supabase,
      organizationId: ctx.organizationId,
      providerEnabled: isSubscriptionsProviderEnabled(),
    })
    return json(out)
  } catch (e) {
    const err = classifyInternalApiError(e)
    return json({ error: err.message }, { status: err.status })
  }
}

﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿import { isPayoutProviderEnabled, isSupabaseConfigured } from '@/lib/env'
import { PAYOUTS_INTERNAL_ALLOWED_ROLES } from '@/lib/payouts-internal-core'
import { simulatePayoutInternalDraft } from '@/lib/payouts-internal-service'
import { assertRole, requireSessionOrgContext } from '@/lib/session-org-context'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { classifyInternalApiError } from '@/lib/api-error'
import { NextResponse } from 'next/server'

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return json({ error: 'Funcionalidade indisponivel no momento.' }, { status: 503 })
  }

  try {
    const ctx = await requireSessionOrgContext()
    assertRole(ctx.role, [...PAYOUTS_INTERNAL_ALLOWED_ROLES])
    const body = (await request.json().catch(() => null)) as unknown
    const out = await simulatePayoutInternalDraft({
      supabase: getSupabaseAdminClient(),
      organizationId: ctx.organizationId,
      rawDraft: body,
      providerEnabled: isPayoutProviderEnabled(),
    })
    return json(out, { status: out.ok ? 200 : 400 })
  } catch (e) {
    const err = classifyInternalApiError(e)
    return json({ error: err.message }, { status: err.status })
  }
}


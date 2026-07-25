﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿import { isSupabaseConfigured, isSupabaseServiceConfigured } from '@/lib/env'
import { classifyInternalApiError } from '@/lib/api-error'
import { assertRole, requireSessionOrgContext } from '@/lib/session-org-context'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import { validateSplitConfigDraft, toSplitValidationResponse } from '@/lib/split-internal-service'
import { SPLIT_INTERNAL_ALLOWED_ROLES } from '@/lib/split-internal-core'
import { NextResponse } from 'next/server'

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return json({ error: 'Funcionalidade indisponÃ­vel no momento.' }, { status: 503 })

  try {
    const ctx = await requireSessionOrgContext()
    assertRole(ctx.role, [...SPLIT_INTERNAL_ALLOWED_ROLES])
    const body = await request.json().catch(() => null)
    if (!body) return json({ error: 'Dados invÃ¡lidos.' }, { status: 400 })

    const supabase = isSupabaseServiceConfigured() ? getSupabaseAdminClient() : await getSupabaseServerClient()
    const out = await validateSplitConfigDraft({
      supabase,
      organizationId: ctx.organizationId,
      rawDraft: body,
      ignoreConfigId: typeof body.id === 'string' ? body.id : null,
    })

    return json({
      ...toSplitValidationResponse(out.issues),
      draft: out.draft,
      eligibleReceivers: out.eligibleReceivers,
    })
  } catch (e) {
    const err = classifyInternalApiError(e)
    return json({ error: err.message }, { status: err.status })
  }
}


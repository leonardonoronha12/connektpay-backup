﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿import { isSupabaseConfigured, isSupabaseServiceConfigured } from '@/lib/env'
import { classifyInternalApiError } from '@/lib/api-error'
import { assertRole, requireSessionOrgContext } from '@/lib/session-org-context'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import { simulateSplitConfigDraft } from '@/lib/split-internal-service'
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

    const saleAmountCents =
      typeof body.saleAmountCents === 'number' && Number.isInteger(body.saleAmountCents) ? body.saleAmountCents : Number(body.saleAmountCents ?? 0)
    if (!Number.isInteger(saleAmountCents) || saleAmountCents <= 0) {
      return json({ error: 'Informe um valor de venda vÃ¡lido para a simulaÃ§Ã£o.' }, { status: 400 })
    }

    const supabase = isSupabaseServiceConfigured() ? getSupabaseAdminClient() : await getSupabaseServerClient()
    const out = await simulateSplitConfigDraft({
      supabase,
      organizationId: ctx.organizationId,
      rawDraft: body,
      saleAmountCents,
    })

    return json(out)
  } catch (e) {
    const err = classifyInternalApiError(e)
    const status = err.status === 500 && e instanceof Error ? 400 : err.status
    return json({ error: e instanceof Error ? e.message : err.message }, { status })
  }
}


﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿import { isSplitProviderEnabled, isSupabaseConfigured, isSupabaseServiceConfigured } from '@/lib/env'
import { classifyInternalApiError } from '@/lib/api-error'
import { buildCsvFilename, buildCsvString } from '@/lib/csv'
import { assertRole, requireSessionOrgContext } from '@/lib/session-org-context'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import { listSplitConfigs, createSplitConfig } from '@/lib/split-internal-service'
import { SPLIT_INTERNAL_ALLOWED_ROLES } from '@/lib/split-internal-core'
import { NextResponse } from 'next/server'

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) return json({ splitConfigs: [], eligibleReceivers: [], providerEnabled: false })

  try {
    const ctx = await requireSessionOrgContext()
    assertRole(ctx.role, [...SPLIT_INTERNAL_ALLOWED_ROLES])
    const format = new URL(request.url).searchParams.get('format')
    const supabase = isSupabaseServiceConfigured() ? getSupabaseAdminClient() : await getSupabaseServerClient()
    const out = await listSplitConfigs({ supabase, organizationId: ctx.organizationId })
    if (format === 'csv') {
      const csv = buildCsvString(
        [
          { key: 'id', header: 'id' },
          { key: 'name', header: 'name' },
          { key: 'status', header: 'status' },
          { key: 'main_receiver_name', header: 'main_receiver_name' },
          { key: 'main_receiver_document', header: 'main_receiver_document' },
          { key: 'valid_from', header: 'valid_from' },
          { key: 'valid_until', header: 'valid_until' },
          { key: 'rule_count', header: 'rule_count' },
          { key: 'internal_notes', header: 'internal_notes' },
          { key: 'created_at', header: 'created_at' },
          { key: 'updated_at', header: 'updated_at' },
        ],
        (out.splitConfigs ?? []).map((config: any) => ({
          id: config.id ?? '',
          name: config.name ?? '',
          status: config.status ?? '',
          main_receiver_name: config.mainReceiver?.name ?? '',
          main_receiver_document: config.mainReceiver?.document ?? '',
          valid_from: config.validFrom ?? '',
          valid_until: config.validUntil ?? '',
          rule_count: Number(config.ruleCount ?? 0),
          internal_notes: config.internalNotes ?? '',
          created_at: config.createdAt ?? '',
          updated_at: config.updatedAt ?? '',
        }))
      )
      return new NextResponse(csv, {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="${buildCsvFilename('split-configs')}"`,
        },
      })
    }
    return json({ ...out, providerEnabled: isSplitProviderEnabled() })
  } catch (e) {
    const err = classifyInternalApiError(e)
    return json({ error: err.message }, { status: err.status })
  }
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return json({ error: 'Funcionalidade indisponÃ­vel no momento.' }, { status: 503 })

  try {
    const ctx = await requireSessionOrgContext()
    assertRole(ctx.role, [...SPLIT_INTERNAL_ALLOWED_ROLES])
    const body = await request.json().catch(() => null)
    if (!body) return json({ error: 'Dados invÃ¡lidos.' }, { status: 400 })

    const supabase = isSupabaseServiceConfigured() ? getSupabaseAdminClient() : await getSupabaseServerClient()
    const splitConfig = await createSplitConfig({
      supabase,
      organizationId: ctx.organizationId,
      actorProfileId: ctx.actorProfileId,
      rawDraft: body,
    })

    return json({ splitConfig }, { status: 201 })
  } catch (e) {
    const err = classifyInternalApiError(e)
    const status = err.status === 500 && e instanceof Error ? 400 : err.status
    return json({ error: e instanceof Error ? e.message : err.message }, { status })
  }
}


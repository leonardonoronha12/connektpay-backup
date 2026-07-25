﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿import { isSupabaseServiceConfigured } from '@/lib/env'
import { processWebhookEventRow } from '@/lib/webhook-processor'
import { claimRuntimeSingleFlight, isAuthorizedCronRequest, releaseRuntimeSingleFlight } from '@/lib/runtime-guards'
import { classifyInternalApiError } from '@/lib/api-error'
import { processDueRecurringSubscriptions } from '@/lib/subscription-service'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

function due(attempts: number, updatedAt: string) {
  const a = Math.max(0, Number(attempts ?? 0))
  const delaySeconds = Math.min(300, Math.pow(2, a) * 10)
  const cutoff = Date.now() - delaySeconds * 1000
  const updated = new Date(updatedAt).getTime()
  return Number.isFinite(updated) ? updated <= cutoff : true
}

async function runWorker(request: Request) {
  const startedAt = Date.now()
  try {
    if (!isSupabaseServiceConfigured()) return json({ ok: false, error: 'Funcionalidade indisponÃ­vel no momento.' }, { status: 503 })
    const secret = process.env.CRON_SECRET
    if (!secret) return json({ ok: false, error: 'Cron secret not configured' }, { status: 503 })
    if (!isAuthorizedCronRequest(request, secret)) return json({ ok: false, error: 'Unauthorized' }, { status: 401 })

    const singleFlight = claimRuntimeSingleFlight({ key: 'events:process-pending', ttlMs: 4 * 60_000 })
    if (!singleFlight.claimed) {
      return json(
        {
          ok: false,
          skipped: true,
          reason: 'already_running',
          retryAfterSeconds: Math.max(1, Math.ceil(singleFlight.retryAfterMs / 1000)),
        },
        { status: 409 },
      )
    }

    try {
      const supabase = getSupabaseAdminClient()
      const recurring = await processDueRecurringSubscriptions({
        supabase,
        nowIso: new Date().toISOString(),
        limit: 20,
      })

      const { data, error } = await supabase
        .from('webhook_events')
        .select('id, organization_id, type, status, attempts, payload, updated_at, next_retry_at')
        .in('status', ['pending', 'failed'])
        .order('updated_at', { ascending: true })
        .limit(50)

      if (error) return json({ ok: false, error: 'NÃ£o foi possÃ­vel consultar eventos pendentes agora.' }, { status: 500 })

      const candidates = (data ?? []).filter((e: any) => {
        if ((e.attempts ?? 0) >= 3) return false
        if (e.next_retry_at) {
          const t = new Date(e.next_retry_at as string).getTime()
          return Number.isFinite(t) ? t <= Date.now() : true
        }
        return due(e.attempts ?? 0, e.updated_at as string)
      })
      let processed = 0
      let failed = 0

      for (const ev of candidates) {
        try {
          await processWebhookEventRow(ev as any)
          processed += 1
        } catch {
          failed += 1
        }
      }

      return json({
        ok: true,
        recurring,
        scanned: (data ?? []).length,
        processed,
        failed,
        durationMs: Date.now() - startedAt,
      })
    } finally {
      releaseRuntimeSingleFlight('events:process-pending')
    }
  } catch (e) {
    const err = classifyInternalApiError(e)
    return json({ ok: false, error: err.message }, { status: err.status })
  }
}

export async function GET(request: Request) {
  return runWorker(request)
}

export async function POST(request: Request) {
  return runWorker(request)
}

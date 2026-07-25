﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿import { isSupabaseServiceConfigured } from '@/lib/env'
import { insertAuditLog } from '@/lib/audit-log'
import { checkPublicRateLimit } from '@/lib/public-rate-limit'
import { getOrgFromApiKey } from '@/lib/public-api-auth'
import { inferPersonTypeFromDocument, validateDocument } from '@/lib/kyc-core'
import { normalizeReceiverDocument, redactReceiverForAudit } from '@/lib/receiver-kyc'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

export async function GET(request: Request) {
  if (!isSupabaseServiceConfigured()) return json({ error: 'Funcionalidade indisponÃ­vel no momento.' }, { status: 503 })
  const ctx = await getOrgFromApiKey(request)
  if (!ctx?.apiKeyHash) return json({ error: 'Unauthorized' }, { status: 401 })
  const allowed = await checkPublicRateLimit({ organizationId: ctx.organizationId, apiKeyHash: ctx.apiKeyHash, limit: 120, windowSeconds: 60 })
  if (!allowed) return json({ error: 'Rate limit exceeded' }, { status: 429 })

  const supabase = getSupabaseAdminClient()
  const { data, error } = await supabase
    .from('receivers')
    .select('id, name, document, bank_account, kyc_status, status, provider_reference, created_at')
    .eq('organization_id', ctx.organizationId)
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) return json({ error: 'NÃ£o foi possÃ­vel carregar recebedores agora.' }, { status: 500 })
  return json({ receivers: data ?? [] })
}

export async function POST(request: Request) {
  if (!isSupabaseServiceConfigured()) return json({ error: 'Funcionalidade indisponÃ­vel no momento.' }, { status: 503 })
  const ctx = await getOrgFromApiKey(request)
  if (!ctx?.apiKeyHash) return json({ error: 'Unauthorized' }, { status: 401 })
  const allowed = await checkPublicRateLimit({ organizationId: ctx.organizationId, apiKeyHash: ctx.apiKeyHash, limit: 60, windowSeconds: 60 })
  if (!allowed) return json({ error: 'Rate limit exceeded' }, { status: 429 })

  const body = (await request.json().catch(() => null)) as
    | null
    | {
        name?: string
        document?: string
        bankAccount?: Record<string, unknown>
        providerReference?: string
      }

  if (!body?.name || !body?.document) return json({ error: 'Dados do recebedor ausentes.' }, { status: 400 })
  const normalizedDocument = normalizeReceiverDocument(body.document)
  if (!validateDocument(normalizedDocument)) return json({ error: 'CPF/CNPJ invalido.' }, { status: 400 })

  const supabase = getSupabaseAdminClient()
  const { data: duplicate } = await supabase
    .from('receivers')
    .select('id')
    .eq('organization_id', ctx.organizationId)
    .eq('document', normalizedDocument)
    .maybeSingle()
  if (duplicate?.id) return json({ error: 'Ja existe um recebedor com esse CPF/CNPJ.' }, { status: 409 })
  const { data, error } = await supabase
    .from('receivers')
    .insert({
      organization_id: ctx.organizationId,
      name: body.name,
      type: inferPersonTypeFromDocument(normalizedDocument),
      document: normalizedDocument,
      bank_account: body.bankAccount ?? {},
      provider_reference: body.providerReference ?? null,
      internal_status: 'draft',
      kyc_status: 'pending',
      status: 'active',
    })
    .select('id, name, document, bank_account, kyc_status, status, provider_reference, created_at')
    .single()

  if (error) return json({ error: 'NÃ£o foi possÃ­vel criar o recebedor agora.' }, { status: 500 })
  await supabase.from('kyc_requests').insert({
    organization_id: ctx.organizationId,
    receiver_id: data.id,
    status: 'pending',
    submitted_at: new Date().toISOString(),
    evidence: {},
  })
  await insertAuditLog({
    organizationId: ctx.organizationId,
    actorProfileId: ctx.actorProfileId,
    actorUserId: null,
    authType: 'api_key',
    origin: 'public_api',
    action: 'CREATE',
    entity: 'receiver',
    entityId: data.id as string,
    before: null,
    after: redactReceiverForAudit(data as Record<string, unknown>),
  })
  return json({ receiver: data }, { status: 201 })
}


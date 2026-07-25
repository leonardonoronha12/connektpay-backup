﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿import { classifyInternalApiError } from '@/lib/api-error'
import { insertAuditLog } from '@/lib/audit-log'
import { isInternalKycFlowEnabled, isSupabaseServiceConfigured } from '@/lib/env'
import { assertRole, requireSessionOrgContext } from '@/lib/session-org-context'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { RECEIVER_KYC_ALLOWED_ROLES, redactKycDocumentForAudit } from '@/lib/receiver-kyc'
import { NextResponse } from 'next/server'

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

export async function GET(_request: Request, ctxRoute: { params: Promise<{ id: string }> }) {
  if (!isInternalKycFlowEnabled()) return json({ error: 'Consulta interna de documentos indisponivel no momento.' }, { status: 503 })
  if (!isSupabaseServiceConfigured()) return json({ error: 'Funcionalidade indisponÃ­vel no momento.' }, { status: 503 })
  try {
    const ctx = await requireSessionOrgContext()
    assertRole(ctx.role, [...RECEIVER_KYC_ALLOWED_ROLES])
    const { id } = await ctxRoute.params
    const supabase = getSupabaseAdminClient()

    const { data: kyc, error: kycErr } = await supabase.from('kyc_requests').select('id, receiver_id').eq('organization_id', ctx.organizationId).eq('id', id).maybeSingle()
    if (kycErr) return json({ error: 'NÃ£o foi possÃ­vel carregar os documentos do KYC agora.' }, { status: 500 })
    if (!kyc) return json({ error: 'KYC nÃ£o encontrado.' }, { status: 404 })

    const { data: docs, error } = await supabase
      .from('kyc_documents')
      .select('id, receiver_id, kyc_request_id, doc_type, storage_bucket, storage_path, original_filename, mime_type, size_bytes, status, created_at')
      .eq('organization_id', ctx.organizationId)
      .eq('receiver_id', (kyc as any).receiver_id)
      .eq('kyc_request_id', id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) return json({ error: 'NÃ£o foi possÃ­vel carregar os documentos do KYC agora.' }, { status: 500 })

    const withUrls = await Promise.all(
      (docs ?? []).map(async (d: any) => {
        const signed = await supabase.storage.from(String(d.storage_bucket ?? 'kyc-documents')).createSignedUrl(String(d.storage_path), 60 * 10)
        return { ...d, signed_url: signed.data?.signedUrl ?? null }
      }),
    )

    await insertAuditLog({
      organizationId: ctx.organizationId,
      actorProfileId: ctx.actorProfileId,
      actorUserId: ctx.actorProfileId,
      authType: 'session',
      origin: 'internal_api',
      action: 'READ',
      entity: 'kyc_request_documents',
      entityId: id,
      before: null,
      after: { count: withUrls.length, documents: withUrls.map((item) => redactKycDocumentForAudit(item as Record<string, unknown>)) },
    })

    return json({ documents: withUrls })
  } catch (e) {
    const err = classifyInternalApiError(e)
    return json({ error: err.message }, { status: err.status })
  }
}


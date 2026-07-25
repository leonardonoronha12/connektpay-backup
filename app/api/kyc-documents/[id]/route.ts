﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿import { classifyInternalApiError } from '@/lib/api-error'
import { insertAuditLog } from '@/lib/audit-log'
import { isInternalKycFlowEnabled, isSupabaseServiceConfigured } from '@/lib/env'
import { RECEIVER_KYC_ALLOWED_ROLES, redactKycDocumentForAudit } from '@/lib/receiver-kyc'
import { assertRole, requireSessionOrgContext } from '@/lib/session-org-context'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

export async function DELETE(_request: Request, ctxRoute: { params: Promise<{ id: string }> }) {
  if (!isInternalKycFlowEnabled()) return json({ error: 'Remocao interna de documentos indisponivel no momento.' }, { status: 503 })
  if (!isSupabaseServiceConfigured()) return json({ error: 'Funcionalidade indisponÃ­vel no momento.' }, { status: 503 })

  try {
    const ctx = await requireSessionOrgContext()
    assertRole(ctx.role, [...RECEIVER_KYC_ALLOWED_ROLES])
    const { id } = await ctxRoute.params
    const supabase = getSupabaseAdminClient()
    const { data: before, error: loadError } = await supabase
      .from('kyc_documents')
      .select('id, receiver_id, kyc_request_id, doc_type, storage_bucket, storage_path, original_filename, mime_type, size_bytes, status, deleted_at')
      .eq('organization_id', ctx.organizationId)
      .eq('id', id)
      .maybeSingle()

    if (loadError) return json({ error: 'Nao foi possivel localizar o documento.' }, { status: 500 })
    if (!before) return json({ error: 'Documento nao encontrado.' }, { status: 404 })
    if ((before as any).deleted_at) return json({ ok: true })

    const bucket = String((before as any).storage_bucket ?? 'kyc-documents')
    const storagePath = String((before as any).storage_path ?? '')
    if (storagePath) await supabase.storage.from(bucket).remove([storagePath])

    const { data, error } = await supabase
      .from('kyc_documents')
      .update({
        status: 'deleted',
        deleted_at: new Date().toISOString(),
        deleted_by_profile_id: ctx.actorProfileId,
      })
      .eq('organization_id', ctx.organizationId)
      .eq('id', id)
      .select('id, receiver_id, kyc_request_id, doc_type, status, deleted_at')
      .single()

    if (error) return json({ error: 'Nao foi possivel remover o documento agora.' }, { status: 500 })

    await insertAuditLog({
      organizationId: ctx.organizationId,
      actorProfileId: ctx.actorProfileId,
      actorUserId: ctx.actorProfileId,
      authType: 'session',
      origin: 'internal_api',
      action: 'DELETE',
      entity: 'kyc_document',
      entityId: id,
      before: redactKycDocumentForAudit(before as Record<string, unknown>),
      after: redactKycDocumentForAudit(data as Record<string, unknown>),
    })

    return json({ ok: true, document: data })
  } catch (e) {
    const err = classifyInternalApiError(e)
    return json({ error: err.message }, { status: err.status })
  }
}


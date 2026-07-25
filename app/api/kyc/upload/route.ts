﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿import { classifyInternalApiError } from '@/lib/api-error'
import { insertAuditLog } from '@/lib/audit-log'
import { isInternalKycFlowEnabled, isSupabaseServiceConfigured } from '@/lib/env'
import { assertRole, requireSessionOrgContext } from '@/lib/session-org-context'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import {
  RECEIVER_KYC_ALLOWED_ROLES,
  getSafeFileExtension,
  hasAllRequiredDocuments,
  isReceiverProfileComplete,
  redactKycDocumentForAudit,
  resolveReceiverInternalStatus,
  sanitizeAddress,
  sanitizeBankAccount,
  validateKycFile,
} from '@/lib/receiver-kyc'
import { NextResponse } from 'next/server'
import crypto from 'crypto'

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

export async function POST(request: Request) {
  if (!isInternalKycFlowEnabled()) return json({ error: 'Upload interno de KYC indisponivel no momento.' }, { status: 503 })
  if (!isSupabaseServiceConfigured()) return json({ error: 'Funcionalidade indisponÃ­vel no momento.' }, { status: 503 })
  try {
    const ctx = await requireSessionOrgContext()
    assertRole(ctx.role, [...RECEIVER_KYC_ALLOWED_ROLES])

    const form = await request.formData()
    const receiverId = String(form.get('receiverId') ?? '').trim()
    const kycRequestId = form.get('kycRequestId') ? String(form.get('kycRequestId')).trim() : null
    const docType = String(form.get('docType') ?? '').trim()
    const file = form.get('file')

    if (!receiverId) return json({ error: 'Recebedor nao informado.' }, { status: 400 })
    if (!docType) return json({ error: 'Tipo de documento nao informado.' }, { status: 400 })
    if (!file || typeof file === 'string') return json({ error: 'Arquivo nao informado.' }, { status: 400 })

    const contentType = typeof (file as any).type === 'string' ? String((file as any).type) : 'application/octet-stream'
    const originalFilename = typeof (file as any).name === 'string' ? String((file as any).name) : null
    const fileValidation = validateKycFile({
      docType,
      mimeType: contentType,
      sizeBytes: typeof (file as any).size === 'number' ? Number((file as any).size) : 0,
      filename: originalFilename,
    })
    if (!fileValidation.ok) return json({ error: fileValidation.message }, { status: 400 })

    const bucket = 'kyc-documents'
    const ext = getSafeFileExtension(originalFilename)
    const name = `${docType}-${crypto.randomUUID()}${ext ? `.${ext}` : ''}`
    const path = `${ctx.organizationId}/${receiverId}/${name}`

    const arrayBuffer = await (file as File).arrayBuffer()
    const bytes = Buffer.from(arrayBuffer)
    const checksumSha256 = crypto.createHash('sha256').update(bytes).digest('hex')

    const supabase = getSupabaseAdminClient()
    const { data: receiver } = await supabase
      .from('receivers')
      .select(
        'id, type, name, legal_name, trade_name, birth_date, legal_responsible_name, legal_responsible_document, document, email, phone, address, bank_account, internal_status, kyc_status, status, provider_reference',
      )
      .eq('organization_id', ctx.organizationId)
      .eq('id', receiverId)
      .maybeSingle()
    if (!receiver) return json({ error: 'Recebedor nÃ£o encontrado.' }, { status: 404 })

    if (kycRequestId) {
      const { data: kycRequest } = await supabase
        .from('kyc_requests')
        .select('id, receiver_id')
        .eq('organization_id', ctx.organizationId)
        .eq('id', kycRequestId)
        .eq('receiver_id', receiverId)
        .maybeSingle()
      if (!kycRequest) return json({ error: 'Solicitacao de KYC nao encontrada para este recebedor.' }, { status: 404 })
    }

    const { data: duplicateDocument } = await supabase
      .from('kyc_documents')
      .select('id')
      .eq('organization_id', ctx.organizationId)
      .eq('receiver_id', receiverId)
      .eq('doc_type', docType)
      .eq('checksum_sha256', checksumSha256)
      .is('deleted_at', null)
      .maybeSingle()
    if (duplicateDocument?.id) return json({ error: 'Este documento ja foi enviado anteriormente.' }, { status: 409 })

    const up = await supabase.storage.from(bucket).upload(path, bytes, { contentType, upsert: true })
    if (up.error) return json({ error: 'Falha ao enviar documento.' }, { status: 500 })

    const { data, error } = await supabase
      .from('kyc_documents')
      .insert({
        organization_id: ctx.organizationId,
        receiver_id: receiverId,
        kyc_request_id: kycRequestId,
        doc_type: docType,
        storage_bucket: bucket,
        storage_path: path,
        original_filename: originalFilename,
        mime_type: contentType,
        size_bytes: bytes.length,
        checksum_sha256: checksumSha256,
        status: 'uploaded',
      })
      .select('id, receiver_id, kyc_request_id, doc_type, storage_bucket, storage_path, original_filename, mime_type, size_bytes, status, created_at')
      .single()
    if (error) return json({ error: 'Falha ao registrar documento.' }, { status: 500 })

    const { data: docs } = await supabase
      .from('kyc_documents')
      .select('doc_type')
      .eq('organization_id', ctx.organizationId)
      .eq('receiver_id', receiverId)
      .is('deleted_at', null)
    const personType = String((receiver as any).type ?? 'pf') === 'pj' ? 'pj' : 'pf'
    const hasProfileComplete = isReceiverProfileComplete({
      personType,
      name: (receiver as any).name,
      legalName: (receiver as any).legal_name,
      tradeName: (receiver as any).trade_name,
      document: (receiver as any).document,
      birthDate: (receiver as any).birth_date,
      legalResponsibleName: (receiver as any).legal_responsible_name,
      legalResponsibleDocument: (receiver as any).legal_responsible_document,
      email: (receiver as any).email,
      phone: (receiver as any).phone,
      address: sanitizeAddress((receiver as any).address),
      bankAccount: sanitizeBankAccount((receiver as any).bank_account),
    })
    const hasRequiredDocuments = hasAllRequiredDocuments(personType, (docs ?? []) as Array<{ doc_type?: unknown }>)
    await supabase
      .from('receivers')
      .update({
        internal_status: resolveReceiverInternalStatus({
          currentStatus: (receiver as any).internal_status,
          operationalStatus: (receiver as any).status,
          kycStatus: (receiver as any).kyc_status,
          providerReference: (receiver as any).provider_reference,
          hasProfileComplete,
          hasRequiredDocuments,
        }),
      })
      .eq('organization_id', ctx.organizationId)
      .eq('id', receiverId)

    await insertAuditLog({
      organizationId: ctx.organizationId,
      actorProfileId: ctx.actorProfileId,
      actorUserId: ctx.actorProfileId,
      authType: 'session',
      origin: 'internal_api',
      action: 'UPLOAD',
      entity: 'kyc_document',
      entityId: data.id as string,
      before: null,
      after: redactKycDocumentForAudit({ ...data, receiver_id: receiverId, kyc_request_id: kycRequestId, storage_path: path }),
    })

    return json({ document: data }, { status: 201 })
  } catch (e) {
    const err = classifyInternalApiError(e)
    return json({ error: err.message }, { status: err.status })
  }
}


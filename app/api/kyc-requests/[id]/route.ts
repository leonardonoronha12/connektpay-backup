﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿import { isInternalKycFlowEnabled, isSupabaseConfigured, isSupabaseServiceConfigured } from '@/lib/env'
import { insertAuditLog } from '@/lib/audit-log'
import { assertRole, requireSessionOrgContext } from '@/lib/session-org-context'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { classifyInternalApiError, logApiError } from '@/lib/api-error'
import { sendTransactionalEmail } from '@/lib/email-service'
import {
  canTransitionInternalKycStatus,
  RECEIVER_KYC_ALLOWED_ROLES,
  hasAllRequiredDocuments,
  isReceiverProfileComplete,
  redactKycRequestForAudit,
  resolveReceiverInternalStatus,
  sanitizeAddress,
  sanitizeBankAccount,
} from '@/lib/receiver-kyc'
import { NextResponse } from 'next/server'

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

export async function PATCH(request: Request, ctxRoute: { params: Promise<{ id: string }> }) {
  if (!isInternalKycFlowEnabled()) return json({ error: 'Analise interna de KYC indisponivel no momento.' }, { status: 503 })
  if (!isSupabaseConfigured()) return json({ error: 'Funcionalidade indisponÃ­vel no momento.' }, { status: 503 })
  if (!isSupabaseServiceConfigured()) return json({ error: 'Funcionalidade indisponÃ­vel no momento.' }, { status: 503 })

  try {
    const { id } = await ctxRoute.params
    const ctx = await requireSessionOrgContext()
    assertRole(ctx.role, [...RECEIVER_KYC_ALLOWED_ROLES])
    const body = (await request.json().catch(() => null)) as null | {
      status?: 'under_review' | 'approved' | 'rejected'
      risk?: string
      decisionReason?: string
      internalNotes?: string | null
    }
    if (!body?.status) return json({ error: 'Status da analise nao informado.' }, { status: 400 })

    const admin = getSupabaseAdminClient()
    const { data: before } = await admin
      .from('kyc_requests')
      .select('id, status, risk, decision_reason, internal_notes, reviewed_at, reviewed_by_profile_id, receiver_id, submitted_at, checklist, created_at')
      .eq('organization_id', ctx.organizationId)
      .eq('id', id)
      .maybeSingle()
    if (!before) return json({ error: 'Solicitacao de KYC nao encontrada.' }, { status: 404 })

    let receiver: any = null
    let hasProfileComplete = false
    let hasRequiredDocuments = true
    if (before.receiver_id) {
      const [{ data: receiverData }, { data: docs }] = await Promise.all([
        admin
          .from('receivers')
          .select(
            'id, type, name, legal_name, trade_name, birth_date, legal_responsible_name, legal_responsible_document, document, email, phone, address, bank_account, internal_status, kyc_status, status, provider_reference',
          )
          .eq('organization_id', ctx.organizationId)
          .eq('id', before.receiver_id as string)
          .maybeSingle(),
        admin
          .from('kyc_documents')
          .select('doc_type')
          .eq('organization_id', ctx.organizationId)
          .eq('receiver_id', before.receiver_id as string)
          .is('deleted_at', null),
      ])

      receiver = receiverData
      const personType = String((receiver as any)?.type ?? 'pf') === 'pj' ? 'pj' : 'pf'
      hasProfileComplete = receiver
        ? isReceiverProfileComplete({
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
        : false
      hasRequiredDocuments = hasAllRequiredDocuments(personType, (docs ?? []) as Array<{ doc_type?: unknown }>)
    }

    if (before.receiver_id && !canTransitionInternalKycStatus({ nextStatus: body.status, hasRequiredDocuments })) {
      return json({ error: 'Envie todos os documentos obrigatÃ³rios antes de analisar ou concluir este KYC.' }, { status: 400 })
    }

    const reviewedAt = body.status === 'approved' || body.status === 'rejected' ? new Date().toISOString() : null
    const { data, error } = await admin
      .from('kyc_requests')
      .update({
        status: body.status,
        risk: body.risk ?? null,
        decision_reason: body.decisionReason ?? null,
        internal_notes: body.internalNotes ?? null,
        reviewed_at: reviewedAt,
        reviewed_by_profile_id: body.status === 'approved' || body.status === 'rejected' ? ctx.actorProfileId : null,
      })
      .eq('organization_id', ctx.organizationId)
      .eq('id', id)
      .select('id, status, risk, reviewed_at, receiver_id, decision_reason, internal_notes, reviewed_by_profile_id')
      .single()

    if (error) return json({ error: 'NÃ£o foi possÃ­vel atualizar o status do KYC agora.' }, { status: 500 })
    if (data?.receiver_id) {
      const { error: receiverUpdateError } = await admin
        .from('receivers')
        .update({
          kyc_status: data.status,
          internal_status: resolveReceiverInternalStatus({
            currentStatus: (receiver as any)?.internal_status,
            operationalStatus: (receiver as any)?.status,
            kycStatus: data.status,
            providerReference: (receiver as any)?.provider_reference,
            hasProfileComplete,
            hasRequiredDocuments,
          }),
        })
        .eq('organization_id', ctx.organizationId)
        .eq('id', data.receiver_id as string)

      if (receiverUpdateError) {
        logApiError('PATCH /api/kyc-requests/[id] receiver sync failed', receiverUpdateError, { id: data.receiver_id as string })
        return json({ error: 'NÃ£o foi possÃ­vel sincronizar o recebedor com o status do KYC.' }, { status: 500 })
      }
    }

    if (data?.receiver_id && (body.status === 'approved' || body.status === 'rejected')) {
      try {
        const { data: r } = await admin
          .from('receivers')
          .select('email, name')
          .eq('organization_id', ctx.organizationId)
          .eq('id', data.receiver_id as string)
          .maybeSingle()
        const email = typeof (r as any)?.email === 'string' ? String((r as any).email) : null
        if (email) {
          await sendTransactionalEmail({
            organizationId: ctx.organizationId,
            to: email,
            template: body.status === 'approved' ? 'kyc.approved' : 'kyc.rejected',
            data: { receiver_id: data.receiver_id, decision_reason: body.decisionReason ?? null },
          })
        }
      } catch {
      }
    }
    await insertAuditLog({
      organizationId: ctx.organizationId,
      actorProfileId: ctx.actorProfileId,
      actorUserId: ctx.actorProfileId,
      authType: 'session',
      origin: 'internal_api',
      action: 'UPDATE',
      entity: 'kyc_request',
      entityId: id,
      before: redactKycRequestForAudit(before as Record<string, unknown>),
      after: redactKycRequestForAudit(data as Record<string, unknown>),
    })
    return json({ kycRequest: data })
  } catch (e) {
    const err = classifyInternalApiError(e)
    return json({ error: err.message }, { status: err.status })
  }
}

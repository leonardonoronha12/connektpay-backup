﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿import { isInternalKycFlowEnabled, isSupabaseConfigured, isSupabaseServiceConfigured } from '@/lib/env'
import { insertAuditLog } from '@/lib/audit-log'
import { assertRole, requireSessionOrgContext } from '@/lib/session-org-context'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import { classifyInternalApiError } from '@/lib/api-error'
import { buildCsvFilename, buildCsvString } from '@/lib/csv'
import {
  RECEIVER_INTERNAL_STATUS,
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

function isSafeEmptySupabaseError(err: any) {
  const code = err?.code ? String(err.code) : ''
  if (code === '54001') return true
  if (code === 'PGRST205') return true
  if (code === '42P01') return true
  if (code === '42703') return true
  return false
}

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) return json({ kycRequests: [] })

  try {
    const ctx = await requireSessionOrgContext()
    assertRole(ctx.role, [...RECEIVER_KYC_ALLOWED_ROLES])
    const format = new URL(request.url).searchParams.get('format')
    const supabase = isSupabaseServiceConfigured() ? getSupabaseAdminClient() : await getSupabaseServerClient()
    const { data, error } = await supabase
      .from('kyc_requests')
      .select(
        'id, status, risk, submitted_at, reviewed_at, decision_reason, internal_notes, checklist, reviewed_by_profile_id, provider_status, created_at, receiver:receivers(id, type, name, document, internal_status, kyc_status)',
      )
      .eq('organization_id', ctx.organizationId)
      .order('created_at', { ascending: false })
      .limit(200)

    if (error) {
      if (isSafeEmptySupabaseError(error)) return json({ kycRequests: [] })
      return json({ error: 'NÃ£o foi possÃ­vel carregar solicitaÃ§Ãµes de KYC agora.' }, { status: 500 })
    }
    const kycRequests = data ?? []
    const reviewerIds = Array.from(
      new Set(
        kycRequests
          .map((item: any) => (typeof item?.reviewed_by_profile_id === 'string' ? String(item.reviewed_by_profile_id) : null))
          .filter((value): value is string => !!value),
      ),
    )
    let reviewersById = new Map<string, { id: string; full_name: string | null; email: string | null }>()
    if (reviewerIds.length > 0) {
      const { data: reviewers } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('organization_id', ctx.organizationId)
        .in('id', reviewerIds)
      reviewersById = new Map(
        (reviewers ?? []).map((reviewer: any) => [
          String(reviewer.id),
          {
            id: String(reviewer.id),
            full_name: typeof reviewer.full_name === 'string' ? reviewer.full_name : null,
            email: typeof reviewer.email === 'string' ? reviewer.email : null,
          },
        ]),
      )
    }
    const payload = kycRequests.map((item: any) => ({
        ...item,
        reviewer:
          typeof item?.reviewed_by_profile_id === 'string' && reviewersById.has(String(item.reviewed_by_profile_id))
            ? reviewersById.get(String(item.reviewed_by_profile_id))
            : null,
      }))
    if (format === 'csv') {
      const csv = buildCsvString(
        [
          { key: 'id', header: 'id' },
          { key: 'receiver_name', header: 'receiver_name' },
          { key: 'receiver_document', header: 'receiver_document' },
          { key: 'status', header: 'status' },
          { key: 'risk', header: 'risk' },
          { key: 'submitted_at', header: 'submitted_at' },
          { key: 'reviewed_at', header: 'reviewed_at' },
          { key: 'decision_reason', header: 'decision_reason' },
          { key: 'reviewer_name', header: 'reviewer_name' },
          { key: 'created_at', header: 'created_at' },
        ],
        payload.map((item: any) => ({
          id: item.id ?? '',
          receiver_name: item.receiver?.name ?? '',
          receiver_document: item.receiver?.document ?? '',
          status: item.status ?? '',
          risk: item.risk ?? '',
          submitted_at: item.submitted_at ?? '',
          reviewed_at: item.reviewed_at ?? '',
          decision_reason: item.decision_reason ?? '',
          reviewer_name: item.reviewer?.full_name ?? item.reviewer?.email ?? '',
          created_at: item.created_at ?? '',
        }))
      )
      return new NextResponse(csv, {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="${buildCsvFilename('kyc-requests')}"`,
        },
      })
    }
    return json({ kycRequests: payload })
  } catch (e) {
    const err = classifyInternalApiError(e)
    return json({ error: err.message }, { status: err.status })
  }
}

export async function POST(request: Request) {
  if (!isInternalKycFlowEnabled()) return json({ error: 'Analise interna de KYC indisponivel no momento.' }, { status: 503 })
  if (!isSupabaseServiceConfigured()) return json({ error: 'Funcionalidade indisponÃ­vel no momento.' }, { status: 503 })

  try {
    const ctx = await requireSessionOrgContext()
    assertRole(ctx.role, [...RECEIVER_KYC_ALLOWED_ROLES])
    const body = (await request.json().catch(() => null)) as null | { receiverId?: string; evidence?: Record<string, unknown> }
    if (!body?.receiverId) return json({ error: 'Recebedor nao informado.' }, { status: 400 })

    const supabase = isSupabaseServiceConfigured() ? getSupabaseAdminClient() : await getSupabaseServerClient()
    const { data: receiver } = await supabase
      .from('receivers')
      .select(
        'id, type, name, legal_name, trade_name, birth_date, legal_responsible_name, legal_responsible_document, document, email, phone, address, bank_account, internal_status, kyc_status, status, provider_reference',
      )
      .eq('organization_id', ctx.organizationId)
      .eq('id', body.receiverId)
      .maybeSingle()

    if (!receiver) return json({ error: 'Recebedor nÃ£o encontrado.' }, { status: 404 })

    const { data: docs } = await supabase
      .from('kyc_documents')
      .select('doc_type')
      .eq('organization_id', ctx.organizationId)
      .eq('receiver_id', body.receiverId)
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

    if (!hasProfileComplete) {
      return json({ error: 'Complete os dados do recebedor antes de iniciar a analise interna.' }, { status: 400 })
    }
    if (!hasRequiredDocuments) {
      return json({ error: 'Envie todos os documentos obrigatorios antes de iniciar a analise interna.' }, { status: 400 })
    }

    const { data: existing } = await supabase
      .from('kyc_requests')
      .select('id, status, created_at')
      .eq('organization_id', ctx.organizationId)
      .eq('receiver_id', body.receiverId)
      .in('status', ['pending', 'under_review'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (existing?.id) {
      let current = existing
      if (existing.status === 'pending') {
        const { data: updatedExisting, error: updateExistingError } = await supabase
          .from('kyc_requests')
          .update({
            status: 'under_review',
            checklist: {
              profile_complete: hasProfileComplete,
              required_documents_sent: hasRequiredDocuments,
            },
          })
          .eq('organization_id', ctx.organizationId)
          .eq('id', existing.id)
          .select('id, status, created_at')
          .single()

        if (updateExistingError) return json({ error: 'NÃ£o foi possÃ­vel iniciar a solicitaÃ§Ã£o de KYC agora.' }, { status: 500 })
        current = updatedExisting
      }

      await supabase
        .from('kyc_documents')
        .update({ kyc_request_id: current.id })
        .eq('organization_id', ctx.organizationId)
        .eq('receiver_id', body.receiverId)
        .is('kyc_request_id', null)

      const { error: receiverSyncError } = await supabase
        .from('receivers')
        .update({
          kyc_status: current.status,
          internal_status: resolveReceiverInternalStatus({
            currentStatus: (receiver as any).internal_status,
            operationalStatus: (receiver as any).status,
            kycStatus: current.status,
            providerReference: (receiver as any).provider_reference,
            hasProfileComplete,
            hasRequiredDocuments,
          }),
        })
        .eq('organization_id', ctx.organizationId)
        .eq('id', body.receiverId)

      if (receiverSyncError) return json({ error: 'NÃ£o foi possÃ­vel sincronizar o recebedor com o status do KYC.' }, { status: 500 })
      return json({ kycRequest: current })
    }
    const { data, error } = await supabase
      .from('kyc_requests')
      .insert({
        organization_id: ctx.organizationId,
        receiver_id: body.receiverId,
        status: 'under_review',
        checklist: {
          profile_complete: hasProfileComplete,
          required_documents_sent: hasRequiredDocuments,
        },
        evidence: body.evidence ?? {},
        submitted_at: new Date().toISOString(),
      })
      .select('id, status, checklist, created_at')
      .single()

    if (error) return json({ error: 'NÃ£o foi possÃ­vel criar a solicitaÃ§Ã£o de KYC agora.' }, { status: 500 })

    await supabase
      .from('kyc_documents')
      .update({ kyc_request_id: data.id })
      .eq('organization_id', ctx.organizationId)
      .eq('receiver_id', body.receiverId)
      .is('kyc_request_id', null)

    const { error: receiverSyncError } = await supabase
      .from('receivers')
      .update({
        kyc_status: data.status,
        internal_status: resolveReceiverInternalStatus({
          currentStatus: (receiver as any).internal_status,
          operationalStatus: (receiver as any).status,
          kycStatus: data.status,
          providerReference: (receiver as any).provider_reference,
          hasProfileComplete,
          hasRequiredDocuments,
        }),
      })
      .eq('organization_id', ctx.organizationId)
      .eq('id', body.receiverId)

    if (receiverSyncError) return json({ error: 'NÃ£o foi possÃ­vel sincronizar o recebedor com o status do KYC.' }, { status: 500 })

    await insertAuditLog({
      organizationId: ctx.organizationId,
      actorProfileId: ctx.actorProfileId,
      actorUserId: ctx.actorProfileId,
      authType: 'session',
      origin: 'internal_api',
      action: 'CREATE',
      entity: 'kyc_request',
      entityId: data.id as string,
      before: null,
      after: redactKycRequestForAudit({ ...data, receiver_id: body.receiverId }),
    })
    return json({ kycRequest: data }, { status: 201 })
  } catch (e) {
    const err = classifyInternalApiError(e)
    return json({ error: err.message }, { status: err.status })
  }
}


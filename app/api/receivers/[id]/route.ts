﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿import { classifyInternalApiError } from '@/lib/api-error'
import { insertAuditLog } from '@/lib/audit-log'
import { getFinancialEnvironment, isInternalReceiversFlowEnabled, isSupabaseConfigured, isSupabaseServiceConfigured } from '@/lib/env'
import { assertRole, requireSessionOrgContext } from '@/lib/session-org-context'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import { inferPersonTypeFromDocument, validateDocument } from '@/lib/kyc-core'
import {
  RECEIVER_INTERNAL_STATUS,
  RECEIVER_KYC_ALLOWED_ROLES,
  hasAllRequiredDocuments,
  isReceiverProfileComplete,
  normalizeDateInput,
  normalizeEmail,
  normalizeOptionalText,
  normalizePhone,
  normalizeReceiverDocument,
  redactReceiverForAudit,
  resolveReceiverInternalStatus,
  sanitizeAddress,
  sanitizeBankAccount,
} from '@/lib/receiver-kyc'
import { NextResponse } from 'next/server'

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

export async function PATCH(request: Request, ctxRoute: { params: Promise<{ id: string }> }) {
  if (!isInternalReceiversFlowEnabled()) return json({ error: 'Cadastro interno de recebedores indisponivel no momento.' }, { status: 503 })
  if (!isSupabaseConfigured()) return json({ error: 'Funcionalidade indisponÃ­vel no momento.' }, { status: 503 })
  try {
    const ctx = await requireSessionOrgContext()
    assertRole(ctx.role, [...RECEIVER_KYC_ALLOWED_ROLES])
    const { id } = await ctxRoute.params
    const body = (await request.json().catch(() => null)) as
      | null
      | {
          type?: 'pf' | 'pj'
          name?: string
          legalName?: string | null
          tradeName?: string | null
          document?: string
          birthDate?: string | null
          legalResponsibleName?: string | null
          legalResponsibleDocument?: string | null
          email?: string | null
          phone?: string | null
          address?: Record<string, unknown> | null
          bankAccount?: Record<string, unknown> | null
        }
    if (!body) return json({ error: 'Corpo da solicitacao invalido.' }, { status: 400 })

    const supabase = isSupabaseServiceConfigured() ? getSupabaseAdminClient() : await getSupabaseServerClient()
    const runtime = getFinancialEnvironment()
    const { data: before } = await supabase
      .from('receivers')
      .select(
        'id, type, name, legal_name, trade_name, birth_date, legal_responsible_name, legal_responsible_document, document, email, phone, address, bank_account, internal_status, kyc_status, status, provider, provider_environment, provider_receiver_id, provider_reference, provider_status, created_at',
      )
      .eq('organization_id', ctx.organizationId)
      .eq('provider', runtime.providerId)
      .eq('provider_environment', runtime.environment)
      .eq('id', id)
      .maybeSingle()
    if (!before) return json({ error: 'Recebedor nÃ£o encontrado.' }, { status: 404 })

    const doc = typeof body.document === 'string' ? normalizeReceiverDocument(body.document) : null
    if (doc && !validateDocument(doc)) return json({ error: 'CPF/CNPJ invÃ¡lido.' }, { status: 400 })

    const inferred = doc ? inferPersonTypeFromDocument(doc) : null
    const nextType = body.type ?? inferred ?? String((before as any).type ?? inferPersonTypeFromDocument((before as any).document) ?? 'pf')
    const nextAddress = typeof body.address !== 'undefined' ? sanitizeAddress(body.address) : sanitizeAddress((before as any).address)
    const nextBankAccount = typeof body.bankAccount !== 'undefined' ? sanitizeBankAccount(body.bankAccount) : sanitizeBankAccount((before as any).bank_account)
    const nextName = typeof body.name === 'string' ? body.name.trim() : String((before as any).name ?? '')
    const nextLegalName = typeof body.legalName !== 'undefined' ? normalizeOptionalText(body.legalName) : normalizeOptionalText((before as any).legal_name)
    const nextTradeName = typeof body.tradeName !== 'undefined' ? normalizeOptionalText(body.tradeName) : normalizeOptionalText((before as any).trade_name)
    const nextBirthDate = typeof body.birthDate !== 'undefined' ? normalizeDateInput(body.birthDate) : normalizeDateInput((before as any).birth_date)
    const nextLegalResponsibleName =
      typeof body.legalResponsibleName !== 'undefined' ? normalizeOptionalText(body.legalResponsibleName) : normalizeOptionalText((before as any).legal_responsible_name)
    const nextLegalResponsibleDocument =
      typeof body.legalResponsibleDocument !== 'undefined'
        ? normalizeReceiverDocument(body.legalResponsibleDocument)
        : normalizeReceiverDocument((before as any).legal_responsible_document)
    const nextEmail = typeof body.email !== 'undefined' ? normalizeEmail(body.email) : normalizeEmail((before as any).email)
    const nextPhone = typeof body.phone !== 'undefined' ? normalizePhone(body.phone) : normalizePhone((before as any).phone)
    const nextDocument = doc ?? normalizeReceiverDocument((before as any).document)

    if (nextLegalResponsibleDocument && !validateDocument(nextLegalResponsibleDocument)) {
      return json({ error: 'CPF do responsÃ¡vel legal invÃ¡lido.' }, { status: 400 })
    }

    const { data: duplicate } = await supabase
      .from('receivers')
      .select('id')
      .eq('organization_id', ctx.organizationId)
      .eq('document', nextDocument)
      .eq('provider', runtime.providerId)
      .eq('provider_environment', runtime.environment)
      .neq('id', id)
      .maybeSingle()

    if (duplicate?.id) return json({ error: 'Ja existe um recebedor com esse CPF/CNPJ nesta organizacao.' }, { status: 409 })

    const { data: docRows } = await supabase
      .from('kyc_documents')
      .select('doc_type')
      .eq('organization_id', ctx.organizationId)
      .eq('receiver_id', id)
      .is('deleted_at', null)

    const hasProfileComplete = isReceiverProfileComplete({
      personType: nextType === 'pj' ? 'pj' : 'pf',
      name: nextName,
      legalName: nextLegalName,
      tradeName: nextTradeName,
      document: nextDocument,
      birthDate: nextBirthDate,
      legalResponsibleName: nextLegalResponsibleName,
      legalResponsibleDocument: nextLegalResponsibleDocument,
      email: nextEmail,
      phone: nextPhone,
      address: nextAddress,
      bankAccount: nextBankAccount,
    })
    const hasRequiredDocuments = hasAllRequiredDocuments(nextType === 'pj' ? 'pj' : 'pf', (docRows ?? []) as Array<{ doc_type?: unknown }>)
    const internalStatus =
      String((before as any).status ?? 'active') === RECEIVER_INTERNAL_STATUS.blocked
        ? RECEIVER_INTERNAL_STATUS.blocked
        : resolveReceiverInternalStatus({
            currentStatus: (before as any).internal_status,
            operationalStatus: (before as any).status,
            kycStatus: (before as any).kyc_status,
            providerReference: (before as any).provider_reference,
            hasProfileComplete,
            hasRequiredDocuments,
          })

    const { data, error } = await supabase
      .from('receivers')
      .update({
        type: nextType,
        name: nextName,
        legal_name: nextLegalName,
        trade_name: nextTradeName,
        document: nextDocument,
        birth_date: nextBirthDate,
        legal_responsible_name: nextLegalResponsibleName,
        legal_responsible_document: nextLegalResponsibleDocument || null,
        email: nextEmail,
        phone: nextPhone,
        address: nextAddress,
        bank_account: nextBankAccount,
        internal_status: internalStatus,
      })
      .eq('organization_id', ctx.organizationId)
      .eq('provider', runtime.providerId)
      .eq('provider_environment', runtime.environment)
      .eq('id', id)
      .select(
        'id, type, name, legal_name, trade_name, birth_date, legal_responsible_name, legal_responsible_document, document, email, phone, address, bank_account, internal_status, kyc_status, status, provider, provider_environment, provider_receiver_id, provider_reference, provider_status, created_at',
      )
      .single()
    if (error) return json({ error: 'NÃ£o foi possÃ­vel atualizar o recebedor agora.' }, { status: 500 })

    await insertAuditLog({
      organizationId: ctx.organizationId,
      actorProfileId: ctx.actorProfileId,
      actorUserId: ctx.actorProfileId,
      authType: 'session',
      origin: 'internal_api',
      action: 'UPDATE',
      entity: 'receiver',
      entityId: id,
      before: redactReceiverForAudit(before as Record<string, unknown>),
      after: redactReceiverForAudit(data as Record<string, unknown>),
    })

    return json({ receiver: data })
  } catch (e) {
    const err = classifyInternalApiError(e)
    return json({ error: err.message }, { status: err.status })
  }
}

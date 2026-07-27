﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿import { getFinancialEnvironment, isInternalReceiversFlowEnabled, isSupabaseConfigured, isSupabaseServiceConfigured } from '@/lib/env'
import { insertAuditLog } from '@/lib/audit-log'
import { assertRole, requireSessionOrgContext } from '@/lib/session-org-context'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import { classifyInternalApiError, logApiError } from '@/lib/api-error'
import { buildCsvFilename, buildCsvString } from '@/lib/csv'
import { inferPersonTypeFromDocument, validateDocument } from '@/lib/kyc-core'
import { createReceiverSyncService } from '@/lib/receiver-provider-sync'
import {
  RECEIVER_INTERNAL_STATUS,
  RECEIVER_KYC_ALLOWED_ROLES,
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

const RECEIVER_SELECT =
  'id, type, name, legal_name, trade_name, birth_date, legal_responsible_name, legal_responsible_document, document, email, phone, address, bank_account, internal_status, kyc_status, status, provider, provider_environment, provider_receiver_id, provider_reference, provider_status, external_status, provider_request_id, created_at'

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) return json({ receivers: [] })

  try {
    const ctx = await requireSessionOrgContext()
    assertRole(ctx.role, [...RECEIVER_KYC_ALLOWED_ROLES])
    const format = new URL(request.url).searchParams.get('format')
    const supabase = isSupabaseServiceConfigured() ? getSupabaseAdminClient() : await getSupabaseServerClient()
    const runtime = getFinancialEnvironment()

    const { data, error } = await supabase
      .from('receivers')
      .select(RECEIVER_SELECT)
      .eq('organization_id', ctx.organizationId)
      .eq('provider', runtime.providerId)
      .eq('provider_environment', runtime.environment)
      .order('created_at', { ascending: false })

    if (error) {
      logApiError('GET /api/receivers failed', error)
      return json({ error: 'Ocorreu um erro ao carregar recebedores. Tente novamente.' }, { status: 500 })
    }

    const receivers = data ?? []
    const receiverIds = receivers.map((receiver: any) => receiver.id).filter((value): value is string => typeof value === 'string' && value.length > 0)
    const activeKycByReceiver = new Map<string, { id: string; status: string | null }>()

    if (receiverIds.length > 0) {
      const { data: activeKycRequests, error: activeKycError } = await supabase
        .from('kyc_requests')
        .select('id, receiver_id, status, created_at')
        .eq('organization_id', ctx.organizationId)
        .in('receiver_id', receiverIds)
        .in('status', ['pending', 'under_review'])
        .order('created_at', { ascending: false })

      if (activeKycError) {
        logApiError('GET /api/receivers active KYC lookup failed', activeKycError)
      } else {
        for (const request of activeKycRequests ?? []) {
          const receiverId = typeof (request as any).receiver_id === 'string' ? String((request as any).receiver_id) : null
          if (!receiverId || activeKycByReceiver.has(receiverId)) continue
          activeKycByReceiver.set(receiverId, {
            id: String((request as any).id),
            status: typeof (request as any).status === 'string' ? String((request as any).status) : null,
          })
        }
      }
    }

    const payload = receivers.map((receiver: any) => {
        const activeKyc = activeKycByReceiver.get(String(receiver.id))
        return {
          ...receiver,
          current_kyc_request_id: activeKyc?.id ?? null,
          current_kyc_request_status: activeKyc?.status ?? null,
        }
      })
    if (format === 'csv') {
      const csv = buildCsvString(
        [
          { key: 'id', header: 'id' },
          { key: 'type', header: 'type' },
          { key: 'name', header: 'name' },
          { key: 'document', header: 'document' },
          { key: 'email', header: 'email' },
          { key: 'phone', header: 'phone' },
          { key: 'internal_status', header: 'internal_status' },
          { key: 'kyc_status', header: 'kyc_status' },
          { key: 'status', header: 'status' },
          { key: 'provider_status', header: 'provider_status' },
          { key: 'current_kyc_request_status', header: 'current_kyc_request_status' },
          { key: 'created_at', header: 'created_at' },
        ],
        payload.map((receiver: any) => ({
          id: receiver.id ?? '',
          type: receiver.type ?? '',
          name: receiver.name ?? '',
          document: receiver.document ?? '',
          email: receiver.email ?? '',
          phone: receiver.phone ?? '',
          internal_status: receiver.internal_status ?? '',
          kyc_status: receiver.kyc_status ?? '',
          status: receiver.status ?? '',
          provider_status: receiver.provider_status ?? '',
          current_kyc_request_status: receiver.current_kyc_request_status ?? '',
          created_at: receiver.created_at ?? '',
        }))
      )
      return new NextResponse(csv, {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="${buildCsvFilename('receivers')}"`,
        },
      })
    }
    return json({ receivers: payload })
  } catch (e) {
    const err = classifyInternalApiError(e)
    return json({ error: err.message }, { status: err.status })
  }
}

export async function POST(request: Request) {
  if (!isInternalReceiversFlowEnabled()) return json({ error: 'Cadastro interno de recebedores indisponivel no momento.' }, { status: 503 })
  if (!isSupabaseServiceConfigured()) return json({ error: 'Funcionalidade indisponÃ­vel no momento.' }, { status: 503 })

  try {
    const ctx = await requireSessionOrgContext()
    assertRole(ctx.role, [...RECEIVER_KYC_ALLOWED_ROLES])
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
          bankAccount?: Record<string, unknown>
        }

    if (!body?.name) return json({ error: 'Nome do recebedor Ã© obrigatÃ³rio.' }, { status: 400 })
    if (!body?.document) return json({ error: 'CPF/CNPJ do recebedor Ã© obrigatÃ³rio.' }, { status: 400 })
    const normalizedDocument = normalizeReceiverDocument(body.document)
    if (!validateDocument(normalizedDocument)) return json({ error: 'CPF/CNPJ invÃ¡lido. Verifique o nÃºmero informado.' }, { status: 400 })

    const type = body.type ?? inferPersonTypeFromDocument(normalizedDocument)
    const address = sanitizeAddress(body.address)
    const bankAccount = sanitizeBankAccount(body.bankAccount)
    const legalResponsibleDocument = normalizeReceiverDocument(body.legalResponsibleDocument)
    const hasProfileComplete = false
    const internalStatus = resolveReceiverInternalStatus({
      operationalStatus: 'active',
      kycStatus: 'pending',
      providerReference: null,
      hasProfileComplete,
      hasRequiredDocuments: false,
    })

    const supabase = getSupabaseAdminClient()
    const runtime = getFinancialEnvironment()
    const { data: duplicateReceiver } = await supabase
      .from('receivers')
      .select('id')
      .eq('organization_id', ctx.organizationId)
      .eq('document', normalizedDocument)
      .eq('provider', runtime.providerId)
      .eq('provider_environment', runtime.environment)
      .maybeSingle()

    if (duplicateReceiver?.id) {
      return json({ error: 'Ja existe um recebedor com esse CPF/CNPJ nesta organizacao.' }, { status: 409 })
    }

    const { data, error } = await supabase
      .from('receivers')
      .insert({
        organization_id: ctx.organizationId,
        provider: runtime.providerId,
        provider_environment: runtime.environment,
        provider_receiver_id: null,
        type,
        name: body.name.trim(),
        legal_name: normalizeOptionalText(body.legalName),
        trade_name: normalizeOptionalText(body.tradeName),
        document: normalizedDocument,
        birth_date: normalizeDateInput(body.birthDate),
        legal_responsible_name: normalizeOptionalText(body.legalResponsibleName),
        legal_responsible_document: legalResponsibleDocument || null,
        email: normalizeEmail(body.email),
        phone: normalizePhone(body.phone),
        address,
        bank_account: bankAccount,
        provider_reference: null,
        internal_status: internalStatus ?? RECEIVER_INTERNAL_STATUS.draft,
        kyc_status: 'pending',
        status: 'active',
      })
      .select(
        RECEIVER_SELECT,
      )
      .single()

    if (error) return json({ error: 'Falha ao criar recebedor. Verifique os dados e tente novamente.' }, { status: 400 })

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
      actorUserId: ctx.actorProfileId,
      authType: 'session',
      origin: 'internal_api',
      action: 'CREATE',
      entity: 'receiver',
      entityId: data.id as string,
      before: null,
      after: redactReceiverForAudit(data as Record<string, unknown>),
    })

    let receiver = data
    let syncWarning: string | null = null
    try {
      const syncService = createReceiverSyncService()
      const syncResult = await syncService.synchronizeReceiver({
        supabase,
        organizationId: ctx.organizationId,
        receiverId: String(data.id),
        provider: runtime.providerId,
        providerEnvironment: runtime.environment,
      })
      if (syncResult.receiver) receiver = syncResult.receiver as any
      syncWarning = syncResult.warning?.message ?? null
    } catch (syncError) {
      logApiError('POST /api/receivers provider sync failed', syncError, { receiverId: String(data.id) })
      syncWarning = 'Recebedor criado localmente, mas a sincronização automática com o provedor ficou pendente.'
    }

    return json({ receiver, syncWarning }, { status: 201 })
  } catch (e) {
    const err = classifyInternalApiError(e)
    return json({ error: err.message }, { status: err.status })
  }
}

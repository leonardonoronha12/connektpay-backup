import type { AcquirerProvider } from '@/lib/acquirer/provider'
import { isProviderError, mapProviderErrorToUserMessage, sanitizeProviderErrorDetails } from '@/lib/acquirer/provider-error'
import { isReceiverProfileComplete, normalizeEmail, normalizePhone, normalizeReceiverDocument, sanitizeAddress, sanitizeBankAccount } from '@/lib/receiver-kyc'

export type ProviderKycStatus = 'pending' | 'under_review' | 'approved' | 'rejected' | 'blocked'

export type ReceiverProviderState = {
  providerReceiverId: string | null
  providerReference: string | null
  externalStatus: string | null
  providerStatus: string | null
  kycStatus: ProviderKycStatus
  operationalStatus: 'active' | 'blocked'
  requestId: string | null
  raw?: unknown
}

export type ReceiverSyncWarningCode =
  | 'receiver_profile_incomplete'
  | 'receiver_not_found'
  | 'receiver_provider_pending'
  | 'receiver_creation_failed'

export type ReceiverSyncWarning = {
  code: ReceiverSyncWarningCode
  message: string
}

type ProviderFactory = () => AcquirerProvider

type ReceiverRow = {
  id: string
  organization_id: string
  type: 'pf' | 'pj'
  name: string
  legal_name: string | null
  trade_name: string | null
  birth_date: string | null
  legal_responsible_name: string | null
  legal_responsible_document: string | null
  document: string | null
  email: string | null
  phone: string | null
  address: Record<string, unknown> | null
  bank_account: Record<string, unknown> | null
  status: string | null
  kyc_status: string | null
  provider: string | null
  provider_environment: string | null
  provider_receiver_id: string | null
  provider_reference: string | null
  provider_status: string | null
  external_status?: string | null
  provider_request_id?: string | null
}

export function safeTrim(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function onlyDigits(value: unknown) {
  return safeTrim(value)?.replace(/\D+/g, '') ?? null
}

function ensureRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function pickFirstString(...values: unknown[]) {
  for (const value of values) {
    const trimmed = safeTrim(value)
    if (trimmed) return trimmed
  }
  return null
}

function normalizePagarMeKycStatus(rawStatus: unknown, rawReason?: unknown): ProviderKycStatus {
  const status = safeTrim(rawStatus)?.toLowerCase()
  const reason = safeTrim(rawReason)?.toLowerCase()
  if (status === 'approved') return 'approved'
  if (status === 'denied' || status === 'rejected') return 'rejected'
  if (status === 'partially_denied') return 'blocked'
  if (status === 'under_review') return 'under_review'
  if (status === 'pending') {
    if (reason === 'additional_documents_required' || reason === 'fully_denied') return 'blocked'
    if (reason === 'in_analysis' || reason === 'answered_waiting_analysis' || reason === 'waiting_manual_risk_analysis') return 'under_review'
    return 'pending'
  }
  if (reason === 'additional_documents_required') return 'blocked'
  return 'pending'
}

function normalizeOperationalStatus(rawStatus: unknown) {
  const status = safeTrim(rawStatus)?.toLowerCase()
  if (status === 'refused' || status === 'blocked' || status === 'inactive' || status === 'disabled') return 'blocked'
  return 'active' as const
}

export function normalizeReceiverProviderState(rawInput: unknown): ReceiverProviderState {
  const raw = ensureRecord(rawInput)
  const kycDetails = ensureRecord(raw.kyc_details)
  const kycStatus = normalizePagarMeKycStatus(kycDetails.status, kycDetails.status_reason)
  const externalStatus = pickFirstString(raw.status)
  const providerReceiverId = pickFirstString(raw.id, raw.recipient_id, raw.recipientId)
  const requestId = pickFirstString(raw.request_id, raw.requestId, ensureRecord(raw.meta).request_id)
  const operationalStatus = externalStatus === 'active' && kycStatus === 'approved' ? 'active' : normalizeOperationalStatus(externalStatus)
  const providerStatus = [safeTrim(raw.status), safeTrim(kycDetails.status)].filter(Boolean).join(':') || externalStatus

  return {
    providerReceiverId,
    providerReference: providerReceiverId,
    externalStatus,
    providerStatus,
    kycStatus: externalStatus === 'active' && kycStatus === 'pending' ? 'approved' : kycStatus,
    operationalStatus,
    requestId,
    raw,
  }
}

export function buildReceiverProviderIdempotencyKey(input: {
  provider: string
  providerEnvironment: string
  organizationId: string
  receiverId: string
}) {
  return `receiver:${input.provider}:${input.providerEnvironment}:${input.organizationId}:${input.receiverId}`
}

export function isReceiverReadyForProviderCreation(input: {
  type?: unknown
  name?: unknown
  legal_name?: unknown
  trade_name?: unknown
  document?: unknown
  birth_date?: unknown
  legal_responsible_name?: unknown
  legal_responsible_document?: unknown
  email?: unknown
  phone?: unknown
  address?: unknown
  bank_account?: unknown
}) {
  const personType = safeTrim(input.type) === 'pj' ? 'pj' : 'pf'
  return isReceiverProfileComplete({
    personType,
    name: input.name,
    legalName: input.legal_name,
    tradeName: input.trade_name,
    document: input.document,
    birthDate: input.birth_date,
    legalResponsibleName: input.legal_responsible_name,
    legalResponsibleDocument: input.legal_responsible_document,
    email: input.email,
    phone: input.phone,
    address: sanitizeAddress(input.address),
    bankAccount: sanitizeBankAccount(input.bank_account),
  })
}

export function buildProviderRecipientPayload(
  input: ReceiverRow,
  opts?: { webhookUrl?: string | null; idempotencyKey?: string | null },
): Parameters<NonNullable<AcquirerProvider['createRecipient']>>[0] {
  const document = normalizeReceiverDocument(input.document)
  const address = sanitizeAddress(input.address)
  const bankAccount = sanitizeBankAccount(input.bank_account)
  const personType: 'pf' | 'pj' = input.type === 'pj' ? 'pj' : 'pf'
  const metadata = Object.fromEntries(
    Object.entries({
      internal_receiver_id: input.id,
      organization_id: input.organization_id,
      provider_environment: input.provider_environment,
      provider_receiver_id: input.provider_receiver_id,
    }).filter(([, value]) => Boolean(safeTrim(value))),
  ) as Record<string, string>

  return {
    receiverId: input.id,
    personType,
    document,
    name: safeTrim(input.name) ?? document ?? input.id,
    legalName: safeTrim(input.legal_name),
    tradeName: safeTrim(input.trade_name),
    birthDate: safeTrim(input.birth_date),
    legalResponsibleName: safeTrim(input.legal_responsible_name),
    legalResponsibleDocument: normalizeReceiverDocument(input.legal_responsible_document),
    email: normalizeEmail(input.email),
    phone: normalizePhone(input.phone),
    address,
    bankAccount,
    metadata: {
      ...metadata,
      ...(safeTrim(opts?.webhookUrl) ? { webhook_url: safeTrim(opts?.webhookUrl) as string } : null),
    },
    idempotencyKey: safeTrim(opts?.idempotencyKey),
  }
}

function sanitizeFailureMessage(error: unknown) {
  if (isProviderError(error)) return mapProviderErrorToUserMessage(error, 'Falha ao criar recebedor no provedor financeiro.')
  return mapProviderErrorToUserMessage(error, 'Falha ao criar recebedor no provedor financeiro.')
}

function extractRequestIdFromError(error: unknown) {
  if (!isProviderError(error)) return null
  const details = ensureRecord(sanitizeProviderErrorDetails(error.details))
  return pickFirstString(details.request_id, ensureRecord(details.response).request_id, ensureRecord(details.headers).request_id)
}

export class ReceiverSyncService {
  constructor(
    private readonly deps: {
      providerFactory: ProviderFactory
      webhookUrl?: string | null
      now?: () => string
    },
  ) {}

  private now() {
    return this.deps.now ? this.deps.now() : new Date().toISOString()
  }

  private getProvider() {
    return this.deps.providerFactory()
  }

  private async loadReceiver(supabase: any, input: {
    organizationId: string
    receiverId: string
    provider: string
    providerEnvironment: string
  }) {
    const { data, error } = await supabase
      .from('receivers')
      .select(
        'id, organization_id, type, name, legal_name, trade_name, birth_date, legal_responsible_name, legal_responsible_document, document, email, phone, address, bank_account, status, kyc_status, provider, provider_environment, provider_receiver_id, provider_reference, provider_status, external_status, provider_request_id',
      )
      .eq('organization_id', input.organizationId)
      .eq('provider', input.provider)
      .eq('provider_environment', input.providerEnvironment)
      .eq('id', input.receiverId)
      .maybeSingle()
    if (error) throw error
    return (data ?? null) as ReceiverRow | null
  }

  private async persistReceiverState(supabase: any, input: {
    organizationId: string
    receiverId: string
    provider: string
    providerEnvironment: string
    state: ReceiverProviderState
  }) {
    const patch = {
      provider: input.provider,
      provider_environment: input.providerEnvironment,
      provider_receiver_id: input.state.providerReceiverId,
      provider_reference: input.state.providerReference,
      provider_status: input.state.providerStatus,
      external_status: input.state.externalStatus,
      provider_request_id: input.state.requestId,
      provider_synced_at: this.now(),
      kyc_status: input.state.kycStatus,
      status: input.state.operationalStatus,
      provider_last_error: null,
      provider_last_error_at: null,
    }
    const { data, error } = await supabase
      .from('receivers')
      .update(patch)
      .eq('organization_id', input.organizationId)
      .eq('provider', input.provider)
      .eq('provider_environment', input.providerEnvironment)
      .eq('id', input.receiverId)
      .select(
        'id, organization_id, type, name, legal_name, trade_name, birth_date, legal_responsible_name, legal_responsible_document, document, email, phone, address, bank_account, status, kyc_status, provider, provider_environment, provider_receiver_id, provider_reference, provider_status, external_status, provider_request_id',
      )
      .maybeSingle()
    if (error) throw error
    return (data ?? null) as ReceiverRow | null
  }

  private async markProviderFailure(supabase: any, input: {
    organizationId: string
    receiverId: string
    provider: string
    providerEnvironment: string
    error: unknown
  }) {
    const errorMessage = sanitizeFailureMessage(input.error)
    const requestId = extractRequestIdFromError(input.error)
    const diagnostic = {
      code: 'receiver_creation_failed',
      request_id: requestId,
      retryable: isProviderError(input.error) ? input.error.retryable : true,
      details: isProviderError(input.error) ? sanitizeProviderErrorDetails(input.error.details) : null,
    }
    await supabase
      .from('receivers')
      .update({
        provider_status: 'receiver_creation_failed',
        provider_request_id: requestId,
        provider_last_error: JSON.stringify(diagnostic),
        provider_last_error_at: this.now(),
      })
      .eq('organization_id', input.organizationId)
      .eq('provider', input.provider)
      .eq('provider_environment', input.providerEnvironment)
      .eq('id', input.receiverId)
    return {
      code: 'receiver_creation_failed' as const,
      message: errorMessage,
    }
  }

  async synchronizeReceiver(input: {
    supabase: any
    organizationId: string
    receiverId: string
    provider: string
    providerEnvironment: string
    forceRefresh?: boolean
  }): Promise<{ receiver: ReceiverRow | null; warning: ReceiverSyncWarning | null; created: boolean }> {
    const receiver = await this.loadReceiver(input.supabase, input)
    if (!receiver) {
      return {
        receiver: null,
        warning: {
          code: 'receiver_not_found',
          message: 'Recebedor não encontrado para sincronização.',
        },
        created: false,
      }
    }

    const provider = this.getProvider()
    if (!receiver.provider_receiver_id) {
      if (!isReceiverReadyForProviderCreation(receiver)) {
        return {
          receiver,
          warning: {
            code: 'receiver_profile_incomplete',
            message: 'Recebedor ainda não possui dados suficientes para criação automática no provedor.',
          },
          created: false,
        }
      }

      try {
        const created = await provider.createRecipient?.(
          buildProviderRecipientPayload(receiver, {
            webhookUrl: this.deps.webhookUrl,
            idempotencyKey: buildReceiverProviderIdempotencyKey(input),
          }),
        )
        if (!created) {
          return {
            receiver,
            warning: {
              code: 'receiver_provider_pending',
              message: 'O provedor atual não suporta criação automática de recebedor.',
            },
            created: false,
          }
        }

        const createdState = normalizeReceiverProviderState(created.raw ?? created)
        const persisted = await this.persistReceiverState(input.supabase, {
          ...input,
          state: {
            ...createdState,
            providerReceiverId: createdState.providerReceiverId ?? safeTrim(created.id),
            providerReference: createdState.providerReference ?? safeTrim(created.id),
            providerStatus: createdState.providerStatus ?? safeTrim(created.status),
            externalStatus: createdState.externalStatus ?? safeTrim(created.status),
            requestId: createdState.requestId ?? safeTrim(created.requestId),
          },
        })
        return { receiver: persisted, warning: null, created: true }
      } catch (error) {
        const warning = await this.markProviderFailure(input.supabase, { ...input, error })
        const refreshed = await this.loadReceiver(input.supabase, input)
        return { receiver: refreshed, warning, created: false }
      }
    }

    if (input.forceRefresh !== true) {
      return { receiver, warning: null, created: false }
    }

    if (typeof provider.getRecipient !== 'function') {
      return { receiver, warning: null, created: false }
    }

    try {
      const remote = await provider.getRecipient({
        providerReference: receiver.provider_receiver_id ?? receiver.provider_reference ?? receiver.id,
      })
      const state = normalizeReceiverProviderState(remote.raw ?? remote)
      const persisted = await this.persistReceiverState(input.supabase, { ...input, state })
      return { receiver: persisted, warning: null, created: false }
    } catch (error) {
      const warning = await this.markProviderFailure(input.supabase, { ...input, error })
      const refreshed = await this.loadReceiver(input.supabase, input)
      return { receiver: refreshed, warning, created: false }
    }
  }

  async synchronizeReceivers(input: {
    supabase: any
    organizationId: string
    receiverIds: string[]
    provider: string
    providerEnvironment: string
  }) {
    const results = []
    for (const receiverId of input.receiverIds) {
      results.push(
        await this.synchronizeReceiver({
          supabase: input.supabase,
          organizationId: input.organizationId,
          receiverId,
          provider: input.provider,
          providerEnvironment: input.providerEnvironment,
        }),
      )
    }
    return results
  }

  async submitKyc(input: {
    supabase: any
    organizationId: string
    receiverId: string
    provider: string
    providerEnvironment: string
  }) {
    const syncResult = await this.synchronizeReceiver(input)
    const receiver = syncResult.receiver
    if (!receiver?.provider_receiver_id) return syncResult
    const provider = this.getProvider()
    if (typeof provider.submitKyc !== 'function') return syncResult

    try {
      const submitted = await provider.submitKyc(
        buildProviderRecipientPayload(receiver, {
          webhookUrl: this.deps.webhookUrl,
          idempotencyKey: buildReceiverProviderIdempotencyKey(input),
        }),
      )
      const state = normalizeReceiverProviderState(submitted.raw ?? submitted)
      const persisted = await this.persistReceiverState(input.supabase, { ...input, state })
      return { receiver: persisted, warning: null, created: syncResult.created }
    } catch (error) {
      const warning = await this.markProviderFailure(input.supabase, { ...input, error })
      const refreshed = await this.loadReceiver(input.supabase, input)
      return { receiver: refreshed, warning, created: syncResult.created }
    }
  }
}

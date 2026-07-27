import 'server-only'

import type { AcquirerProvider } from '@/lib/acquirer/provider'
import { getAcquirerProvider } from '@/lib/acquirer'
import { getFinancialEnvironment, isReceiverProviderSyncEnabled } from '@/lib/env'
import {
  ReceiverSyncService,
  buildProviderRecipientPayload,
  buildReceiverProviderIdempotencyKey,
} from '@/lib/receiver-sync-core'

export type ReceiverProviderIntegrationState = 'awaiting_integration' | 'active'

export type ReceiverProviderIntegrationResult = {
  ok: boolean
  state: ReceiverProviderIntegrationState
  message: string
  id?: string | null
  status?: string | null
  requestId?: string | null
  raw?: unknown
}

type ProviderFactory = () => AcquirerProvider

function awaitingIntegration(message: string): ReceiverProviderIntegrationResult {
  return {
    ok: false,
    state: 'awaiting_integration',
    message,
  }
}

function activeResult(input: { id: string; status: string; requestId?: string | null; raw?: unknown; message: string }): ReceiverProviderIntegrationResult {
  return {
    ok: true,
    state: 'active',
    id: input.id,
    status: input.status,
    requestId: input.requestId ?? null,
    raw: input.raw,
    message: input.message,
  }
}

function createReceiverSyncService(deps: { providerFactory?: ProviderFactory } = {}) {
  const runtime = getFinancialEnvironment()
  return new ReceiverSyncService({
    providerFactory: deps.providerFactory ?? getAcquirerProvider,
    webhookUrl: runtime.webhookUrl,
  })
}

export async function createRecipientContract(
  input: {
    organizationId?: string
    receiverId: string
    personType: 'pf' | 'pj'
    document: string
    name: string
    legalName?: string | null
    tradeName?: string | null
    birthDate?: string | null
    legalResponsibleName?: string | null
    legalResponsibleDocument?: string | null
    email?: string | null
    phone?: string | null
    address?: Record<string, unknown> | null
    bankAccount?: Record<string, unknown> | null
    metadata?: Record<string, string>
    idempotencyKey?: string | null
  },
  deps: { providerFactory?: ProviderFactory } = {},
) {
  if (!isReceiverProviderSyncEnabled()) return awaitingIntegration('Sincronizacao com o provedor aguardando habilitacao.')
  const provider = (deps.providerFactory ?? getAcquirerProvider)()
  if (typeof provider.createRecipient !== 'function') return awaitingIntegration('Contrato de recebedor do provedor ainda nao foi homologado.')
  const runtime = getFinancialEnvironment()
  const response = await provider.createRecipient({
    ...input,
    metadata: {
      ...(input.metadata ?? {}),
      provider_environment: runtime.environment,
    },
    idempotencyKey:
      input.idempotencyKey ??
      (input.organizationId
        ? buildReceiverProviderIdempotencyKey({
            provider: runtime.providerId,
            providerEnvironment: runtime.environment,
            organizationId: input.organizationId,
            receiverId: input.receiverId,
          })
        : null),
  })
  return activeResult({
    id: response.id,
    status: response.status,
    requestId: response.requestId,
    raw: response.raw,
    message: 'Recebedor sincronizado com o provedor financeiro.',
  })
}

export async function getRecipientContract(input: { providerReference: string }, deps: { providerFactory?: ProviderFactory } = {}) {
  if (!isReceiverProviderSyncEnabled()) return awaitingIntegration('Consulta de recebedor externo aguardando habilitacao.')
  const provider = (deps.providerFactory ?? getAcquirerProvider)()
  if (typeof provider.getRecipient !== 'function') return awaitingIntegration('Contrato de consulta de recebedor ainda nao foi homologado.')
  const response = await provider.getRecipient(input)
  return activeResult({
    id: response.id,
    status: response.status,
    requestId: response.requestId,
    raw: response.raw,
    message: 'Recebedor consultado com sucesso no provedor financeiro.',
  })
}

export async function submitKycContract(
  input: {
    organizationId?: string
    receiverId: string
    personType: 'pf' | 'pj'
    document: string
    name: string
    legalName?: string | null
    email?: string | null
    phone?: string | null
    address?: Record<string, unknown> | null
    bankAccount?: Record<string, unknown> | null
    documents?: Array<{ docType: string; bucket: string; path: string; mimeType?: string | null; sizeBytes?: number | null }>
    metadata?: Record<string, string>
    idempotencyKey?: string | null
  },
  deps: { providerFactory?: ProviderFactory } = {},
) {
  if (!isReceiverProviderSyncEnabled()) return awaitingIntegration('Envio de KYC para o provedor aguardando habilitacao.')
  const provider = (deps.providerFactory ?? getAcquirerProvider)()
  if (typeof provider.submitKyc !== 'function') return awaitingIntegration('Contrato de envio de KYC ainda nao foi homologado.')
  const runtime = getFinancialEnvironment()
  const response = await provider.submitKyc({
    ...input,
    metadata: {
      ...(input.metadata ?? {}),
      provider_environment: runtime.environment,
    },
    idempotencyKey:
      input.idempotencyKey ??
      (input.organizationId
        ? buildReceiverProviderIdempotencyKey({
            provider: runtime.providerId,
            providerEnvironment: runtime.environment,
            organizationId: input.organizationId,
            receiverId: input.receiverId,
          })
        : null),
  })
  return activeResult({
    id: response.id,
    status: response.status,
    requestId: response.requestId,
    raw: response.raw,
    message: 'KYC externo submetido com sucesso.',
  })
}

export async function getKycStatusContract(input: { providerReference: string; receiverId?: string }, deps: { providerFactory?: ProviderFactory } = {}) {
  if (!isReceiverProviderSyncEnabled()) return awaitingIntegration('Consulta de KYC externo aguardando habilitacao.')
  const provider = (deps.providerFactory ?? getAcquirerProvider)()
  if (typeof provider.getKycStatus !== 'function') return awaitingIntegration('Contrato de status de KYC ainda nao foi homologado.')
  const response = await provider.getKycStatus(input)
  return activeResult({
    id: response.id,
    status: response.status,
    requestId: response.requestId,
    raw: response.raw,
    message: 'Status de KYC consultado com sucesso.',
  })
}

export { ReceiverSyncService, buildProviderRecipientPayload, createReceiverSyncService }

import 'server-only'

import type { AcquirerProvider } from '@/lib/acquirer/provider'
import { getAcquirerProvider } from '@/lib/acquirer'
import { isMyGatewayKycEnabled, isReceiverProviderSyncEnabled } from '@/lib/env'

export type ReceiverProviderIntegrationState = 'awaiting_integration'

export type ReceiverProviderIntegrationResult = {
  ok: false
  state: ReceiverProviderIntegrationState
  message: string
}

type ProviderFactory = () => AcquirerProvider

function awaitingIntegration(message: string): ReceiverProviderIntegrationResult {
  return {
    ok: false,
    state: 'awaiting_integration',
    message,
  }
}

export async function createRecipientContract(
  _input: {
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
  },
  deps: { providerFactory?: ProviderFactory } = {},
) {
  if (!isReceiverProviderSyncEnabled()) return awaitingIntegration('Sincronizacao com o provedor aguardando habilitacao.')
  const provider = (deps.providerFactory ?? getAcquirerProvider)()
  if (typeof provider.createRecipient !== 'function') return awaitingIntegration('Contrato de recebedor do provedor ainda nao foi homologado.')
  return awaitingIntegration('Integracao de recebedor ainda depende do contrato oficial da MyGateway.')
}

export async function getRecipientContract(_input: { providerReference: string }, deps: { providerFactory?: ProviderFactory } = {}) {
  if (!isReceiverProviderSyncEnabled()) return awaitingIntegration('Consulta de recebedor externo aguardando habilitacao.')
  const provider = (deps.providerFactory ?? getAcquirerProvider)()
  if (typeof provider.getRecipient !== 'function') return awaitingIntegration('Contrato de consulta de recebedor ainda nao foi homologado.')
  return awaitingIntegration('Consulta de recebedor ainda depende do contrato oficial da MyGateway.')
}

export async function submitKycContract(
  _input: {
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
  },
  deps: { providerFactory?: ProviderFactory } = {},
) {
  if (!isMyGatewayKycEnabled()) return awaitingIntegration('Envio de KYC para o provedor aguardando habilitacao.')
  const provider = (deps.providerFactory ?? getAcquirerProvider)()
  if (typeof provider.submitKyc !== 'function') return awaitingIntegration('Contrato de envio de KYC ainda nao foi homologado.')
  return awaitingIntegration('Envio de KYC ainda depende do contrato oficial da MyGateway.')
}

export async function getKycStatusContract(_input: { providerReference: string; receiverId?: string }, deps: { providerFactory?: ProviderFactory } = {}) {
  if (!isMyGatewayKycEnabled()) return awaitingIntegration('Consulta de KYC externo aguardando habilitacao.')
  const provider = (deps.providerFactory ?? getAcquirerProvider)()
  if (typeof provider.getKycStatus !== 'function') return awaitingIntegration('Contrato de status de KYC ainda nao foi homologado.')
  return awaitingIntegration('Consulta de KYC ainda depende do contrato oficial da MyGateway.')
}

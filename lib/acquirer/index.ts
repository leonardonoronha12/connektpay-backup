import { MygProvider } from '@/lib/acquirer/myg-provider'
import { PagarMeProvider } from '@/lib/acquirer/pagarme-provider'
import type { AcquirerProvider } from '@/lib/acquirer/provider'
import { getFinancialProvider } from '@/lib/env'
import { getProviderLabel, normalizeProviderId, type ProviderId } from '@/lib/acquirer/provider-id'
import { ProviderError } from '@/lib/acquirer/provider-error'

function invalidConfig(provider: ProviderId, message: string): never {
  throw new ProviderError({
    provider,
    code: 'invalid_config',
    status: 500,
    retryable: false,
    message,
  })
}

function createMyGatewayProvider() {
  const baseUrl = process.env.MYGATEWAY_BASE_URL
  const xApiKey = process.env.MYGATEWAY_X_API_KEY
  const authData = process.env.MYGATEWAY_AUTH_DATA

  if (!baseUrl) invalidConfig('mygateway', 'MYGATEWAY_BASE_URL is not set')
  if (!xApiKey) invalidConfig('mygateway', 'MYGATEWAY_X_API_KEY is not set')
  if (!authData) invalidConfig('mygateway', 'MYGATEWAY_AUTH_DATA is not set')

  return new MygProvider({ baseUrl, xApiKey, authData })
}

function createPagarMeProvider() {
  const baseUrl = process.env.PAGARME_BASE_URL
  const secretKey = process.env.PAGARME_SECRET_KEY

  if (!baseUrl) invalidConfig('pagarme', 'PAGARME_BASE_URL is not set')
  if (!secretKey) invalidConfig('pagarme', 'PAGARME_SECRET_KEY is not set')

  return new PagarMeProvider({ baseUrl, secretKey })
}

export function getAcquirerProvider(providerId?: string | null): AcquirerProvider {
  const resolvedProvider = providerId ? normalizeProviderId(providerId) : getFinancialProvider()
  if (!resolvedProvider) {
    const label = typeof providerId === 'string' && providerId.trim() ? providerId.trim() : String(providerId)
    throw new ProviderError({
      provider: label || 'unknown',
      code: 'invalid_config',
      status: 500,
      retryable: false,
      message: `Unknown financial provider: ${label}`,
    })
  }

  if (resolvedProvider === 'pagarme') return createPagarMeProvider()
  if (resolvedProvider === 'mygateway') return createMyGatewayProvider()

  return invalidConfig(resolvedProvider, `Unsupported provider: ${getProviderLabel(resolvedProvider)}`)
}

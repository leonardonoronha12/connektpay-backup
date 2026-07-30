import { getProviderLabel, isProviderId, normalizeProviderId, type ProviderId } from '@/lib/acquirer/provider-id'

export function isSupabaseConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
}

export function isSupabaseServiceConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
}

function isExplicitlyEnabled(value: string | undefined, defaultValue = false) {
  if (value == null) return defaultValue
  return value.trim().toLowerCase() === 'true'
}

function hasNonBlankValue(value: string | null | undefined) {
  return Boolean(value && value.trim())
}

export type ProviderCapabilities = {
  providerId: ProviderId
  providerName: string
  credentialsConfigured: boolean
  paymentLinks: boolean
  payments: boolean
  customers: boolean
  recipients: boolean
  kyc: boolean
  subscriptions: boolean
  split: boolean
  payouts: boolean
  anticipation: boolean
  webhooks: boolean
  refunds: boolean
  reconciliation: boolean
}

export type FinancialProviderEnvironment = 'sandbox' | 'production'

export type FinancialRuntimeConfig = {
  providerId: ProviderId
  providerLabel: string
  environment: FinancialProviderEnvironment
  baseUrl: string | null
  publicBaseUrl: string | null
  publicAppId: string | null
  webhookUrl: string | null
  cardTokenizationConfigured: boolean
  credentialsConfigured: boolean
  capabilities: ProviderCapabilities
  runtimeSource: 'deployment_env'
  warnings: string[]
}

const SUPPORTED_FINANCIAL_PROVIDERS = ['mygateway', 'pagarme'] as const
const SUPPORTED_PAGARME_ENVIRONMENTS = ['sandbox', 'production'] as const

export function getFinancialProvider(): ProviderId {
  const raw = process.env.FINANCIAL_PROVIDER
  if (!raw || !raw.trim()) {
    throw new Error(
      `FINANCIAL_PROVIDER must be explicitly set to one of: ${SUPPORTED_FINANCIAL_PROVIDERS.join(', ')}`,
    )
  }
  const normalized = normalizeProviderId(raw)
  if (!normalized || !isProviderId(normalized)) {
    throw new Error(
      `Unsupported FINANCIAL_PROVIDER: ${raw.trim()}. Supported values: ${SUPPORTED_FINANCIAL_PROVIDERS.join(', ')}`,
    )
  }
  return normalized
}

function normalizeFinancialEnvironment(value: unknown): FinancialProviderEnvironment | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  return normalized === 'sandbox' || normalized === 'production' ? normalized : null
}

function safeTrim(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export function isMyGatewayConfigured() {
  const baseUrl = process.env.MYGATEWAY_BASE_URL
  const xApiKey = process.env.MYGATEWAY_X_API_KEY
  const authData = process.env.MYGATEWAY_AUTH_DATA
  return Boolean(baseUrl && xApiKey && authData)
}

export function isPagarMeConfigured() {
  const baseUrl = process.env.PAGARME_BASE_URL
  const secretKey = process.env.PAGARME_SECRET_KEY
  return Boolean(baseUrl && secretKey)
}

export function getPagarMePublicAppId() {
  const value = process.env.NEXT_PUBLIC_PAGARME_APP_ID
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function getPagarMeBaseUrl() {
  const value = process.env.PAGARME_BASE_URL
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function getPagarMePublicBaseUrl() {
  const value = process.env.NEXT_PUBLIC_PAGARME_BASE_URL
  if (typeof value === 'string' && value.trim()) return value.trim()
  return getPagarMeBaseUrl()
}

function isSandboxLikeUrl(value: string | null | undefined) {
  if (typeof value !== 'string') return false
  const normalized = value.trim().toLowerCase()
  if (!normalized) return false
  return normalized.includes('sandbox') || normalized.includes('sdx') || normalized.includes('staging') || normalized.includes('homolog')
}

function getPagarMeConfiguredEnvironment(): FinancialProviderEnvironment {
  const raw = process.env.PAGARME_ENVIRONMENT
  if (!raw || !raw.trim()) {
    throw new Error(
      `PAGARME_ENVIRONMENT must be explicitly set to one of: ${SUPPORTED_PAGARME_ENVIRONMENTS.join(', ')}`,
    )
  }

  const explicit = normalizeFinancialEnvironment(raw)
  if (!explicit) {
    throw new Error(
      `Unsupported PAGARME_ENVIRONMENT: ${raw.trim()}. Supported values: ${SUPPORTED_PAGARME_ENVIRONMENTS.join(', ')}`,
    )
  }

  return explicit
}

function getDeploymentOrigin(environment: FinancialProviderEnvironment) {
  const directUrl = safeTrim(process.env.NEXT_PUBLIC_SITE_URL || process.env.APP_URL || process.env.PUBLIC_SITE_URL)
  if (directUrl) return directUrl.replace(/\/+$/, '')

  if (environment === 'production') {
    const productionUrl = safeTrim(process.env.VERCEL_PROJECT_PRODUCTION_URL)
    if (productionUrl) return `https://${productionUrl.replace(/^https?:\/\//i, '').replace(/\/+$/, '')}`
  }

  const runtimeUrl = safeTrim(process.env.VERCEL_URL)
  if (runtimeUrl) return `https://${runtimeUrl.replace(/^https?:\/\//i, '').replace(/\/+$/, '')}`
  return null
}

function getFinancialWebhookUrl(providerId: ProviderId, environment: FinancialProviderEnvironment) {
  const providerSpecific = providerId === 'pagarme' ? process.env.PAGARME_WEBHOOK_URL : process.env.MYGATEWAY_WEBHOOK_URL
  const generic = process.env.FINANCIAL_WEBHOOK_URL
  const configured = safeTrim(providerSpecific || generic)
  if (configured) return configured.replace(/\/+$/, '')

  const origin = getDeploymentOrigin(environment)
  return origin ? `${origin}/api/webhooks` : null
}

export function getFinancialProviderEnvironment(providerId = getFinancialProvider()): 'sandbox' | 'production' {
  return getFinancialEnvironment(providerId).environment
}

export function isPagarMeCardTokenizationConfigured() {
  return Boolean(getPagarMePublicAppId() && getPagarMePublicBaseUrl())
}

export function isProviderConfigured(providerId = getFinancialProvider()) {
  return providerId === 'pagarme' ? isPagarMeConfigured() : isMyGatewayConfigured()
}

export function isInternalReceiversFlowEnabled() {
  return isExplicitlyEnabled(process.env.INTERNAL_RECEIVERS_FLOW_ENABLED, true)
}

export function isInternalKycFlowEnabled() {
  return isExplicitlyEnabled(process.env.INTERNAL_KYC_FLOW_ENABLED, true)
}

export function isReceiverProviderSyncEnabled() {
  return isExplicitlyEnabled(process.env.RECEIVER_PROVIDER_SYNC_ENABLED, false)
}

export function isMyGatewayKycEnabled() {
  return isExplicitlyEnabled(process.env.MYGATEWAY_KYC_ENABLED, false)
}

export function isMyGatewayPaymentLinksEnabled() {
  return isExplicitlyEnabled(process.env.MYGATEWAY_PAYMENT_LINKS_ENABLED, false)
}

export function isPagarMePaymentLinksEnabled() {
  return isExplicitlyEnabled(process.env.PAGARME_PAYMENT_LINKS_ENABLED, false)
}

export function isPagarMeWebhookConfigured() {
  return hasNonBlankValue(process.env.PAGARME_WEBHOOK_USERNAME) && hasNonBlankValue(process.env.PAGARME_WEBHOOK_PASSWORD)
}

export function isStandalonePaymentsEnabled() {
  return isExplicitlyEnabled(process.env.STANDALONE_PAYMENTS_ENABLED, false)
}

export function isSplitProviderEnabled() {
  return isExplicitlyEnabled(process.env.SPLIT_PROVIDER_ENABLED, false)
}

export function isSubscriptionsProviderEnabled() {
  return isExplicitlyEnabled(process.env.SUBSCRIPTIONS_PROVIDER_ENABLED, false)
}

export function isPayoutProviderEnabled() {
  return isExplicitlyEnabled(process.env.PAYOUT_PROVIDER_ENABLED, false)
}

export function isAnticipationProviderEnabled() {
  return isExplicitlyEnabled(process.env.ANTICIPATION_PROVIDER_ENABLED, false)
}

export function getProviderCapabilities(providerId = getFinancialProvider()): ProviderCapabilities {
  if (providerId === 'pagarme') {
    const receiverSyncEnabled = isReceiverProviderSyncEnabled() && isPagarMeConfigured()
    return {
      providerId,
      providerName: getProviderLabel(providerId),
      credentialsConfigured: isPagarMeConfigured(),
      paymentLinks: isPagarMePaymentLinksEnabled(),
      payments: isPagarMeConfigured(),
      customers: false,
      recipients: receiverSyncEnabled,
      kyc: receiverSyncEnabled,
      subscriptions: isPagarMeConfigured(),
      split: isPagarMeConfigured(),
      payouts: false,
      anticipation: false,
      webhooks: isPagarMeWebhookConfigured(),
      refunds: false,
      reconciliation: false,
    }
  }

  return {
    providerId,
    providerName: getProviderLabel(providerId),
    credentialsConfigured: isMyGatewayConfigured(),
    paymentLinks: isMyGatewayPaymentLinksEnabled(),
    payments: isStandalonePaymentsEnabled(),
    customers: false,
    recipients: isReceiverProviderSyncEnabled(),
    kyc: isMyGatewayKycEnabled(),
    subscriptions: isSubscriptionsProviderEnabled(),
    split: isSplitProviderEnabled(),
    payouts: isPayoutProviderEnabled(),
    anticipation: isAnticipationProviderEnabled(),
    webhooks: Boolean(process.env.MYGATEWAY_WEBHOOK_SECRET),
    refunds: false,
    reconciliation: isAnticipationProviderEnabled() || isPayoutProviderEnabled(),
  }
}

export function getFinancialEnvironment(providerId = getFinancialProvider()): FinancialRuntimeConfig {
  const providerLabel = getProviderLabel(providerId)
  const capabilities = getProviderCapabilities(providerId)
  const warnings: string[] = []

  if (providerId === 'pagarme') {
    const environment = getPagarMeConfiguredEnvironment()
    const baseUrl = getPagarMeBaseUrl()
    const publicBaseUrl = getPagarMePublicBaseUrl()
    const publicAppId = getPagarMePublicAppId()
    const secretKey = safeTrim(process.env.PAGARME_SECRET_KEY)

    if (environment === 'sandbox' && secretKey.startsWith('sk_live_')) {
      warnings.push('Ambiente marcado como sandbox, mas a secret parece ser live.')
    }
    if (environment === 'production' && secretKey.startsWith('sk_test_')) {
      warnings.push('Ambiente marcado como produção, mas a secret parece ser de teste.')
    }
    if (baseUrl && publicBaseUrl && isSandboxLikeUrl(baseUrl) !== isSandboxLikeUrl(publicBaseUrl)) {
      warnings.push('Base URL pública e server-side apontam para ambientes diferentes.')
    }

    return {
      providerId,
      providerLabel,
      environment,
      baseUrl,
      publicBaseUrl,
      publicAppId,
      webhookUrl: getFinancialWebhookUrl(providerId, environment),
      cardTokenizationConfigured: isPagarMeCardTokenizationConfigured(),
      credentialsConfigured: isPagarMeConfigured(),
      capabilities,
      runtimeSource: 'deployment_env',
      warnings,
    }
  }

  const baseUrl = safeTrim(process.env.MYGATEWAY_BASE_URL) || null
  const environment: FinancialProviderEnvironment = isSandboxLikeUrl(baseUrl) ? 'sandbox' : 'production'
  return {
    providerId,
    providerLabel,
    environment,
    baseUrl,
    publicBaseUrl: null,
    publicAppId: null,
    webhookUrl: getFinancialWebhookUrl(providerId, environment),
    cardTokenizationConfigured: false,
    credentialsConfigured: isMyGatewayConfigured(),
    capabilities,
    runtimeSource: 'deployment_env',
    warnings,
  }
}

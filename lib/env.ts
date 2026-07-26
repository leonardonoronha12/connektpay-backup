import { getProviderLabel, isProviderId, type ProviderId } from '@/lib/acquirer/provider-id'

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

export function getFinancialProvider(): ProviderId {
  const raw = process.env.FINANCIAL_PROVIDER
  if (!raw || !raw.trim()) return 'mygateway'
  const normalized = raw.trim().toLowerCase()
  if (!isProviderId(normalized)) {
    throw new Error(`Unsupported FINANCIAL_PROVIDER: ${raw}`)
  }
  return normalized
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

export function getPagarMePublicBaseUrl() {
  const value = process.env.NEXT_PUBLIC_PAGARME_BASE_URL
  if (typeof value === 'string' && value.trim()) return value.trim()
  const serverValue = process.env.PAGARME_BASE_URL
  return typeof serverValue === 'string' && serverValue.trim() ? serverValue.trim() : null
}

function isSandboxLikeUrl(value: string | null | undefined) {
  if (typeof value !== 'string') return false
  const normalized = value.trim().toLowerCase()
  if (!normalized) return false
  return normalized.includes('sandbox') || normalized.includes('sdx') || normalized.includes('staging') || normalized.includes('homolog')
}

export function getFinancialProviderEnvironment(providerId = getFinancialProvider()): 'sandbox' | 'production' {
  if (providerId === 'pagarme') {
    const secretKey = typeof process.env.PAGARME_SECRET_KEY === 'string' ? process.env.PAGARME_SECRET_KEY.trim() : ''
    if (secretKey.startsWith('sk_test_')) return 'sandbox'
    if (isSandboxLikeUrl(getPagarMePublicBaseUrl())) return 'sandbox'
    return 'production'
  }

  const myGatewayBaseUrl = typeof process.env.MYGATEWAY_BASE_URL === 'string' ? process.env.MYGATEWAY_BASE_URL.trim() : ''
  return isSandboxLikeUrl(myGatewayBaseUrl) ? 'sandbox' : 'production'
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
    return {
      providerId,
      providerName: getProviderLabel(providerId),
      credentialsConfigured: isPagarMeConfigured(),
      paymentLinks: isPagarMePaymentLinksEnabled(),
      payments: isPagarMeConfigured(),
      customers: false,
      recipients: false,
      kyc: false,
      subscriptions: isPagarMeConfigured(),
      split: false,
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

import { normalizeProviderId, type ProviderId } from '@/lib/acquirer/provider-id'

function normalizeHostPattern(value: string) {
  return value.trim().toLowerCase()
}

function readHostsEnv(key: string, fallback: string[]) {
  const raw = process.env[key]
  if (!raw) return fallback
  const hosts = raw
    .split(',')
    .map(normalizeHostPattern)
    .filter(Boolean)
  return hosts.length ? hosts : fallback
}

export function getHostedCheckoutAllowedHosts(providerId: ProviderId) {
  if (providerId === 'pagarme') {
    return readHostsEnv('PAGARME_HOSTED_CHECKOUT_HOSTS', ['checkout.pagar.me', 'payment-link.pagar.me', '*.pagar.me'])
  }

  return readHostsEnv('MYGATEWAY_HOSTED_CHECKOUT_HOSTS', ['pay.link', '*.mygateway.com.br', '*.whitelabel.mygateway.com.br'])
}

function hostMatchesPattern(host: string, pattern: string) {
  if (!pattern) return false
  if (pattern.startsWith('*.')) return host === pattern.slice(2) || host.endsWith(pattern.slice(1))
  return host === pattern
}

export function isHostedCheckoutUrlAllowed(providerId: ProviderId, url: string) {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') return false
    const host = parsed.hostname.trim().toLowerCase()
    return getHostedCheckoutAllowedHosts(providerId).some((pattern) => hostMatchesPattern(host, pattern))
  } catch {
    return false
  }
}

export function inferProviderIdFromHostedCheckoutUrl(url: string): ProviderId | null {
  for (const providerId of ['pagarme', 'mygateway'] as const) {
    if (isHostedCheckoutUrlAllowed(providerId, url)) return providerId
  }
  return null
}

export function sanitizeHostedCheckoutUrl(input: { providerId?: string | null; url?: string | null }) {
  const rawUrl = typeof input.url === 'string' ? input.url.trim() : ''
  if (!rawUrl) return null
  const explicitProvider = normalizeProviderId(input.providerId)
  const resolvedProvider = explicitProvider ?? inferProviderIdFromHostedCheckoutUrl(rawUrl)
  if (!resolvedProvider) return null
  return isHostedCheckoutUrlAllowed(resolvedProvider, rawUrl) ? rawUrl : null
}

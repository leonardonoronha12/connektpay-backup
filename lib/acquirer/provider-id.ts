export const KNOWN_PROVIDER_IDS = ['mygateway', 'pagarme'] as const

export type ProviderId = (typeof KNOWN_PROVIDER_IDS)[number]

export function isProviderId(value: string): value is ProviderId {
  return (KNOWN_PROVIDER_IDS as readonly string[]).includes(value)
}

export function normalizeProviderId(value: string | null | undefined): ProviderId | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  return isProviderId(normalized) ? normalized : null
}

export function getProviderLabel(providerId: ProviderId) {
  return providerId === 'pagarme' ? 'Pagar.me' : 'MyGateway'
}

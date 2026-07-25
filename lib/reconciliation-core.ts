export function normalizeInternalStatus(input: { entityType: string; status: unknown }) {
  const entityType = String(input.entityType ?? '').toLowerCase()
  const raw = typeof input.status === 'string' ? input.status.trim().toLowerCase() : ''

  if (entityType === 'transaction') {
    if (raw === 'paid') return 'paid'
    if (raw === 'created') return 'created'
    if (raw === 'failed') return 'failed'
    if (raw === 'refunded') return 'refunded'
    return raw || 'unknown'
  }

  if (entityType === 'payout') {
    if (raw === 'paid') return 'paid'
    if (raw === 'scheduled') return 'scheduled'
    if (raw === 'failed') return 'failed'
    return raw || 'unknown'
  }

  if (entityType === 'anticipation') {
    if (raw === 'executed') return 'executed'
    if (raw === 'approved') return 'approved'
    if (raw === 'pending') return 'pending'
    if (raw === 'failed') return 'failed'
    if (raw === 'canceled') return 'canceled'
    return raw || 'unknown'
  }

  return raw || 'unknown'
}

export function normalizeProviderStatus(input: { entityType: string; status: unknown }) {
  const entityType = String(input.entityType ?? '').toLowerCase()
  const raw = typeof input.status === 'string' ? input.status.trim().toLowerCase() : ''

  const common = raw
    .replace(/\s+/g, '_')
    .replace(/-/g, '_')
    .replace(/^payment_/, '')
    .replace(/^payout_/, '')
    .replace(/^anticipation_/, '')

  if (entityType === 'transaction') {
    if (common === 'paid' || common === 'approved' || common === 'completed') return 'paid'
    if (common === 'created' || common === 'pending') return 'created'
    if (common === 'failed' || common === 'declined') return 'failed'
    if (common === 'refunded') return 'refunded'
    return common || 'unknown'
  }

  if (entityType === 'payout') {
    if (common === 'paid' || common === 'completed') return 'paid'
    if (common === 'scheduled' || common === 'pending') return 'scheduled'
    if (common === 'failed') return 'failed'
    return common || 'unknown'
  }

  if (entityType === 'anticipation') {
    if (common === 'executed' || common === 'completed' || common === 'paid') return 'executed'
    if (common === 'approved') return 'approved'
    if (common === 'requested' || common === 'pending') return 'pending'
    if (common === 'failed') return 'failed'
    if (common === 'canceled' || common === 'cancelled') return 'canceled'
    return common || 'unknown'
  }

  return common || 'unknown'
}

export function calculateDifference(input: { internalAmountCents: number | null; providerAmountCents: number | null }) {
  const internal = typeof input.internalAmountCents === 'number' && Number.isFinite(input.internalAmountCents) ? Math.round(input.internalAmountCents) : null
  const provider = typeof input.providerAmountCents === 'number' && Number.isFinite(input.providerAmountCents) ? Math.round(input.providerAmountCents) : null
  if (internal == null || provider == null) return null
  return internal - provider
}

export function compareAmounts(input: { internalAmountCents: number | null; providerAmountCents: number | null }) {
  const diff = calculateDifference(input)
  if (diff == null) return { ok: false as const, reason: 'missing_amount' as const, diff: null }
  return { ok: diff === 0, reason: diff === 0 ? ('match' as const) : ('divergent' as const), diff }
}

export function compareStatuses(input: { entityType: string; internalStatus: unknown; providerStatus: unknown }) {
  const internal = normalizeInternalStatus({ entityType: input.entityType, status: input.internalStatus })
  const provider = normalizeProviderStatus({ entityType: input.entityType, status: input.providerStatus })
  const ok = internal === provider
  return { ok, internal, provider }
}

export function classifyDivergence(input: {
  entityType: string
  internalStatus: unknown
  providerStatus: unknown
  internalAmountCents: number | null
  providerAmountCents: number | null
}) {
  const statusCmp = compareStatuses({ entityType: input.entityType, internalStatus: input.internalStatus, providerStatus: input.providerStatus })
  const amountCmp = compareAmounts({ internalAmountCents: input.internalAmountCents, providerAmountCents: input.providerAmountCents })

  if (!amountCmp.ok && amountCmp.reason === 'missing_amount') return { status: 'pending' as const, reason: 'missing_provider_amount' as const, diff: null, statusCmp }
  if (!statusCmp.ok) return { status: 'divergent' as const, reason: 'status_mismatch' as const, diff: amountCmp.diff, statusCmp }
  if (!amountCmp.ok) return { status: 'divergent' as const, reason: 'amount_mismatch' as const, diff: amountCmp.diff, statusCmp }
  return { status: 'matched' as const, reason: 'match' as const, diff: amountCmp.diff, statusCmp }
}

export function sanitizeProviderPayload(input: unknown) {
  const seen = new WeakSet<object>()
  const redactKey = (k: string) => {
    const key = k.toLowerCase()
    return (
      key.includes('cvv') ||
      key.includes('cvc') ||
      key.includes('card') ||
      key.includes('number') ||
      key.includes('pan') ||
      key.includes('token') ||
      key.includes('auth') ||
      key.includes('secret') ||
      key.includes('x-api-key') ||
      key.includes('authorization')
    )
  }

  const walk = (v: any): any => {
    if (v == null) return v
    if (typeof v === 'string') return v.length > 500 ? `${v.slice(0, 500)}…` : v
    if (typeof v === 'number' || typeof v === 'boolean') return v
    if (Array.isArray(v)) return v.slice(0, 50).map(walk)
    if (typeof v === 'object') {
      if (seen.has(v)) return '[circular]'
      seen.add(v)
      const out: Record<string, any> = {}
      for (const [k, val] of Object.entries(v)) {
        out[k] = redactKey(k) ? '[redacted]' : walk(val)
      }
      return out
    }
    return String(v)
  }

  return walk(input)
}

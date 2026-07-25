import crypto from 'crypto'

type WindowEntry = {
  count: number
  resetAt: number
}

type ReplayEntry = {
  expiresAt: number
}

type GuardState = {
  rateWindows: Map<string, WindowEntry>
  replayWindows: Map<string, ReplayEntry>
  singleFlight: Map<string, ReplayEntry>
}

declare global {
  // eslint-disable-next-line no-var
  var __connektRuntimeGuards: GuardState | undefined
}

function getState(): GuardState {
  if (!globalThis.__connektRuntimeGuards) {
    globalThis.__connektRuntimeGuards = {
      rateWindows: new Map(),
      replayWindows: new Map(),
      singleFlight: new Map(),
    }
  }
  return globalThis.__connektRuntimeGuards
}

function cleanupExpired(map: Map<string, ReplayEntry | WindowEntry>, now: number) {
  for (const [key, value] of map.entries()) {
    if ('resetAt' in value) {
      if (value.resetAt <= now) map.delete(key)
      continue
    }
    if (value.expiresAt <= now) map.delete(key)
  }
}

export function getRequestClientIp(request: Request) {
  const headersToCheck = ['x-forwarded-for', 'cf-connecting-ip', 'x-real-ip']
  for (const header of headersToCheck) {
    const raw = request.headers.get(header)
    if (!raw) continue
    const value = raw.split(',')[0]?.trim()
    if (value) return value
  }
  return 'unknown'
}

export function buildStableRequestKey(parts: Array<string | number | boolean | null | undefined>) {
  const raw = parts.map((part) => String(part ?? '')).join('|')
  return crypto.createHash('sha256').update(raw).digest('hex')
}

export function checkRuntimeRateLimit(input: { key: string; limit: number; windowMs: number; now?: number }) {
  const now = input.now ?? Date.now()
  const state = getState()
  cleanupExpired(state.rateWindows, now)

  const existing = state.rateWindows.get(input.key)
  if (!existing || existing.resetAt <= now) {
    state.rateWindows.set(input.key, { count: 1, resetAt: now + input.windowMs })
    return { allowed: true, remaining: Math.max(0, input.limit - 1), retryAfterMs: 0 }
  }

  if (existing.count >= input.limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(0, existing.resetAt - now),
    }
  }

  existing.count += 1
  state.rateWindows.set(input.key, existing)
  return {
    allowed: true,
    remaining: Math.max(0, input.limit - existing.count),
    retryAfterMs: 0,
  }
}

export function claimRuntimeReplayWindow(input: { key: string; ttlMs: number; now?: number }) {
  const now = input.now ?? Date.now()
  const state = getState()
  cleanupExpired(state.replayWindows, now)

  const existing = state.replayWindows.get(input.key)
  if (existing && existing.expiresAt > now) {
    return { claimed: false, retryAfterMs: existing.expiresAt - now }
  }

  state.replayWindows.set(input.key, { expiresAt: now + input.ttlMs })
  return { claimed: true, retryAfterMs: 0 }
}

export function claimRuntimeSingleFlight(input: { key: string; ttlMs: number; now?: number }) {
  const now = input.now ?? Date.now()
  const state = getState()
  cleanupExpired(state.singleFlight, now)

  const existing = state.singleFlight.get(input.key)
  if (existing && existing.expiresAt > now) {
    return { claimed: false, retryAfterMs: existing.expiresAt - now }
  }

  state.singleFlight.set(input.key, { expiresAt: now + input.ttlMs })
  return { claimed: true, retryAfterMs: 0 }
}

export function releaseRuntimeSingleFlight(key: string) {
  const state = getState()
  state.singleFlight.delete(key)
}

export function isAuthorizedCronRequest(request: Request, secret: string | undefined) {
  if (!secret) return false
  const authorization = request.headers.get('authorization') ?? ''
  return authorization === `Bearer ${secret}`
}

export function resetRuntimeGuardsForTest() {
  globalThis.__connektRuntimeGuards = {
    rateWindows: new Map(),
    replayWindows: new Map(),
    singleFlight: new Map(),
  }
}

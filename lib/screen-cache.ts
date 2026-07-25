'use client'

export const SCREEN_CACHE_TTL_MS = 45_000

const screenDataCache = new Map<string, { value: unknown; expiresAt: number }>()

export function readScreenCacheSnapshot<T>(key: string): { value: T; expiresAt: number } | null {
  const hit = screenDataCache.get(key)
  if (!hit) return null
  if (hit.expiresAt <= Date.now()) {
    screenDataCache.delete(key)
    return null
  }
  return { value: hit.value as T, expiresAt: hit.expiresAt }
}

export function readScreenCache<T>(key: string): T | null {
  return readScreenCacheSnapshot<T>(key)?.value ?? null
}

export function writeScreenCache<T>(key: string, value: T, ttlMs = SCREEN_CACHE_TTL_MS) {
  screenDataCache.set(key, { value, expiresAt: Date.now() + ttlMs })
}

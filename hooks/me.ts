'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

export type Me = {
  userId: string
  email: string
  fullName: string | null
  role: string | null
  phone?: string | null
  title?: string | null
  organizationId?: string | null
}

let cachedPromise: Promise<Me | null> | null = null
let cachedValue: Me | null | undefined = undefined

function shouldRetryProtectedProfileLoad() {
  if (typeof window === 'undefined') return false
  const path = window.location.pathname
  return !(path === '/login' || path.startsWith('/checkout') || path.startsWith('/auth/'))
}

export async function getMeCached(options?: { force?: boolean }): Promise<Me | null> {
  const force = options?.force === true
  if (!force && cachedValue !== undefined) return cachedValue
  if (!force && cachedPromise) return cachedPromise

  cachedPromise = (async () => {
    let res: Response
    try {
      res = await fetch('/api/me', { method: 'GET', keepalive: true })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const lower = msg.toLowerCase()
      const abortLike = lower.includes('load request cancelled') || lower.includes('access control checks') || lower.includes('abort')
      if (abortLike) {
        return null
      }
      throw e
    }
    if (res.status === 401) {
      return null
    }
    const json = await res.json().catch(() => null)
    if (!res.ok) throw new Error(String(json?.error ?? 'Failed to load profile'))
    const me = (json?.me ?? null) as Me | null
    cachedValue = me
    return me
  })().finally(() => {
    cachedPromise = null
  })

  return cachedPromise
}

export function useMe() {
  const [me, setMe] = useState<Me | null | undefined>(cachedValue)
  const [loading, setLoading] = useState(me === undefined)
  const [error, setError] = useState<string | null>(null)
  const shouldRetry = useMemo(() => shouldRetryProtectedProfileLoad(), [])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const next = await getMeCached({ force: true })
      setMe(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (me !== undefined && !(me === null && cachedValue === undefined && shouldRetry)) return
    let mounted = true
    let retryTimer: number | null = null

    const load = async (force = false) => {
      setLoading(true)
      setError(null)
      try {
        const next = await getMeCached(force ? { force: true } : undefined)
        if (!mounted) return
        setMe(next)
        if (next == null && cachedValue === undefined && shouldRetry && !force) {
          retryTimer = window.setTimeout(() => {
            void load(true)
          }, 400)
        }
      } catch (e) {
        if (!mounted) return
        setError(e instanceof Error ? e.message : String(e))
        setMe(null)
      } finally {
        if (!mounted) return
        setLoading(false)
      }
    }

    setLoading(true)
    setError(null)
    void load()
    return () => {
      mounted = false
      if (retryTimer) window.clearTimeout(retryTimer)
    }
  }, [me, shouldRetry])

  return { me: me ?? null, loading, error, refresh }
}

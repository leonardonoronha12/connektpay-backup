'use client'

import { getSupabaseClient } from '@/lib/supabase'
import type { Session } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'

export function useSession() {
  const [session, setSession] = useState<Session | null>(null)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let mounted = true
    let unsubscribe: (() => void) | null = null

    const run = async () => {
      try {
        const supabase = getSupabaseClient()
        const { data } = await supabase.auth.getSession()
        if (!mounted) return
        setSession(data.session ?? null)
        const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
          if (!mounted) return
          setSession(next)
        })
        unsubscribe = () => sub.subscription.unsubscribe()
      } catch (e) {
        if (!mounted) return
        setError(e instanceof Error ? e : new Error('Unknown error'))
      }
    }

    void run()

    return () => {
      mounted = false
      unsubscribe?.()
    }
  }, [])

  return { session, error }
}


import { createServerClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cookies, headers } from 'next/headers'

function parseCookieHeader(header: string) {
  const raw = String(header || '')
  if (!raw) return [] as Array<{ name: string; value: string }>
  return raw
    .split(';')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const i = p.indexOf('=')
      const name = i >= 0 ? p.slice(0, i).trim() : p.trim()
      const value = i >= 0 ? p.slice(i + 1).trim() : ''
      return { name, value }
    })
}

export async function getSupabaseServerClient(): Promise<SupabaseClient> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set')
  if (!supabaseAnonKey) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is not set')

  const hdrs = await headers()
  const cookieHeader = hdrs.get('cookie') ?? ''
  const pairs = parseCookieHeader(cookieHeader)
  const cookieStore = await cookies()

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return pairs
      },
      setAll(toSet) {
        for (const { name, value, options } of toSet) {
          try {
            cookieStore.set(name, value, options)
          } catch {
          }
        }
      },
    },
  })
}

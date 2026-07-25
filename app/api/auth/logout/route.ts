import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) return json({ ok: true })

  const toSet: Array<{ name: string; value: string; options: any }> = []
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        const header = request.headers.get('cookie') ?? ''
        if (!header) return []
        return header
          .split(';')
          .map((p) => p.trim())
          .filter(Boolean)
          .map((p) => {
            const i = p.indexOf('=')
            const name = i >= 0 ? p.slice(0, i).trim() : p.trim()
            const value = i >= 0 ? p.slice(i + 1).trim() : ''
            return { name, value }
          })
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) toSet.push({ name, value, options })
      },
    },
  })

  await supabase.auth.signOut()
  const response = NextResponse.json({ ok: true })
  for (const c of toSet) response.cookies.set(c.name, c.value, c.options)
  response.cookies.set('cp_role', '', { path: '/', sameSite: 'lax', httpOnly: true, secure: true, maxAge: 0 })
  response.cookies.set('cp_dev_role', '', { path: '/', sameSite: 'lax', maxAge: 0 })
  return response
}

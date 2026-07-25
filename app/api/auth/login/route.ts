import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import { normalizeRole } from '@/lib/rbac'
import { checkRuntimeRateLimit, getRequestClientIp } from '@/lib/runtime-guards'

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) return json({ error: 'Configuração inválida.' }, { status: 500 })

  const body = (await request.json().catch(() => null)) as null | { email?: string; password?: string }
  const email = typeof body?.email === 'string' ? body.email.trim() : ''
  const password = typeof body?.password === 'string' ? body.password : ''
  if (!email || !password) return json({ error: 'Informe e-mail e senha.' }, { status: 400 })

  const clientIp = getRequestClientIp(request)
  const loginRate = checkRuntimeRateLimit({ key: `login:${clientIp}`, limit: 10, windowMs: 60_000 })
  if (!loginRate.allowed) {
    return json(
      {
        error: 'Muitas tentativas de login em sequência. Aguarde alguns instantes antes de tentar novamente.',
      },
      { status: 429, headers: { 'retry-after': String(Math.max(1, Math.ceil(loginRate.retryAfterMs / 1000))) } },
    )
  }

  const toSet: Array<{ name: string; value: string; options: any }> = []
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        // Login starts a fresh server-side auth flow; reading stale/malformed
        // auth cookies here can break sign-in before new cookies are issued.
        return []
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) toSet.push({ name, value, options })
      },
    },
  })

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return json({ error: error.message }, { status: 400 })
  const userId = data.user?.id ?? null
  let role =
    normalizeRole((data.user?.user_metadata as any)?.role ?? null) ??
    normalizeRole((data.user?.app_metadata as any)?.role ?? null)
  if (!role && userId) {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle()
    role = normalizeRole((profile as any)?.role ?? null)
  }

  const response = NextResponse.json({ ok: true, userId })
  for (const c of toSet) response.cookies.set(c.name, c.value, c.options)
  if (role) {
    response.cookies.set('cp_role', role, { path: '/', sameSite: 'lax', httpOnly: true, secure: true, maxAge: 60 * 60 * 24 * 30 })
  } else {
    response.cookies.set('cp_role', '', { path: '/', sameSite: 'lax', httpOnly: true, secure: true, maxAge: 0 })
  }
  return response
}

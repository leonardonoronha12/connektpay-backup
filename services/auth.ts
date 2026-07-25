import { getSupabaseClient } from '@/lib/supabase'

async function waitForServerSession(timeoutMs = 5_000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const res = await fetch('/api/me', { method: 'GET', cache: 'no-store' }).catch(() => null)
    if (res?.ok) {
      const json = await res.json().catch(() => null)
      return json?.me ?? true
    }
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  return null
}

function setRoleCookie(role: string | null) {
  if (typeof document === 'undefined') return
  if (role) {
    document.cookie = `cp_role=${role}; Path=/; SameSite=Lax`
    return
  }
  document.cookie = 'cp_role=; Path=/; SameSite=Lax; Max-Age=0'
  document.cookie = 'cp_dev_role=; Path=/; SameSite=Lax; Max-Age=0'
}

export async function signInWithPassword(email: string, password: string) {
  if (typeof window !== 'undefined') {
    const supabase = getSupabaseClient()
    const result = await supabase.auth.signInWithPassword({ email, password })
    if (result.error) {
      return { data: { user: null, session: null }, error: { message: String(result.error.message ?? 'Não foi possível entrar.') } } as any
    }
    const sessionReady = await waitForServerSession()
    if (!sessionReady) {
      await supabase.auth.signOut().catch(() => null)
      setRoleCookie(null)
      return {
        data: { user: null, session: null },
        error: { message: 'Sua sessão demorou mais do que o esperado para ficar disponível. Tente novamente.' },
      } as any
    }
    setRoleCookie(typeof sessionReady.role === 'string' ? sessionReady.role : null)
    return {
      data: {
        user: { id: sessionReady.userId ?? result.data.user?.id ?? null },
        session: result.data.session ?? null,
      },
      error: null,
    } as any
  }
  const supabase = getSupabaseClient()
  return supabase.auth.signInWithPassword({ email, password })
}

export async function signUp(email: string, password: string, options?: { fullName?: string; role?: string }) {
  const supabase = getSupabaseClient()
  const emailRedirectTo = typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : undefined
  return supabase.auth.signUp({
    email,
    password,
    options: {
      ...(emailRedirectTo ? { emailRedirectTo } : null),
      data: {
        ...(options?.fullName ? { full_name: options.fullName } : null),
        ...(options?.role ? { role: options.role } : null),
      },
    },
  })
}

export async function signOut() {
  let serverSessionCleared = false
  if (typeof window !== 'undefined') {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => null)
    setRoleCookie(null)
    serverSessionCleared = true
  }
  const supabase = getSupabaseClient()
  const { error } = await supabase.auth.signOut({ scope: 'local' }).catch((err) => ({ error: err }))
  if (error) {
    const message = String((error as any)?.message ?? error ?? '')
    // Hybrid flows can clear the server session before a browser-side Supabase session exists.
    if (serverSessionCleared && message.toLowerCase().includes('auth session missing')) return { error: null }
    throw error
  }
  return { error: null }
}

export async function getSession() {
  const supabase = getSupabaseClient()
  return supabase.auth.getSession()
}

export async function resetPassword(email: string, redirectTo: string) {
  const supabase = getSupabaseClient()
  return supabase.auth.resetPasswordForEmail(email, { redirectTo })
}

export async function updatePassword(newPassword: string) {
  const supabase = getSupabaseClient()
  return supabase.auth.updateUser({ password: newPassword })
}

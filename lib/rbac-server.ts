import 'server-only'

import { getAuthedProfile } from '@/lib/auth-context'
import { isAllowed, normalizeRole, type AppRole } from '@/lib/rbac'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export async function requirePageAccess(allowed: readonly AppRole[]) {
  const cookieStore = await cookies()
  const devRole = process.env.NODE_ENV === 'development' ? normalizeRole(cookieStore.get('cp_dev_role')?.value) : null
  const cookieRole = normalizeRole(cookieStore.get('cp_role')?.value)
  let role = devRole ?? cookieRole

  // Some authenticated sessions may not carry cp_role on the initial RSC request.
  // Fall back to the server-side profile lookup so route protection still redirects.
  if (!role) {
    const sessionCtx = await getAuthedProfile().catch(() => null)
    role =
      normalizeRole((sessionCtx?.profile as any)?.role ?? null) ??
      normalizeRole((sessionCtx?.user?.user_metadata as any)?.role ?? (sessionCtx?.user?.app_metadata as any)?.role ?? null)
  }

  if (role && !isAllowed(role, allowed)) redirect('/dashboard')

  return { role }
}

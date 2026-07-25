import 'server-only'

import { getAuthedProfile } from '@/lib/auth-context'
import { normalizeRole } from '@/lib/rbac'

export type SessionOrgContext = {
  organizationId: string
  actorProfileId: string
  role: string
}

export async function requireSessionOrgContext(): Promise<SessionOrgContext> {
  const ctx = await getAuthedProfile()
  if (!ctx) throw new Error('Unauthorized')
  const role = normalizeRole((ctx.profile as any).role ?? null) ?? normalizeRole((ctx.user.user_metadata as any)?.role ?? (ctx.user.app_metadata as any)?.role ?? null)
  if (!role) throw new Error('Forbidden')
  return {
    organizationId: ctx.profile.organization_id as string,
    actorProfileId: ctx.profile.id as string,
    role,
  }
}

export function assertRole(role: string, allowed: string[]) {
  const normalized = normalizeRole(role) ?? ''
  if (!allowed.includes(normalized)) throw new Error('Forbidden')
}

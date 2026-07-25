import 'server-only'

import { getAuthedProfile } from '@/lib/auth-context'
import { getOrgFromApiKey, type OrgAuthContext } from '@/lib/public-api-auth'

export async function requireOrgContext(request: Request): Promise<OrgAuthContext> {
  const apiKeyCtx = await getOrgFromApiKey(request)
  if (apiKeyCtx) return apiKeyCtx

  const sessionCtx = await getAuthedProfile()
  if (!sessionCtx) throw new Error('Unauthorized')

  return { organizationId: sessionCtx.profile.organization_id as string, authType: 'session', actorProfileId: sessionCtx.profile.id as string }
}

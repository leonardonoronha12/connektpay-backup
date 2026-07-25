import 'server-only'

import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { getSupabaseServerClient } from '@/lib/supabase-server'

export async function insertAuditLog(input: {
  organizationId: string
  actorProfileId: string
  actorUserId?: string | null
  action: string
  entity: string
  entityId?: string | null
  before?: unknown
  after?: unknown
  authType: 'session' | 'api_key'
  origin: 'internal_api' | 'public_api'
}) {
  const supabase = input.authType === 'api_key' ? getSupabaseAdminClient() : await getSupabaseServerClient()
  await supabase.from('audit_logs').insert({
    organization_id: input.organizationId,
    actor_profile_id: input.actorProfileId,
    actor_user_id: input.actorUserId ?? null,
    origin: input.origin,
    action: input.action,
    entity: input.entity,
    entity_id: input.entityId ?? null,
    before: (input.before ?? null) as any,
    after: (input.after ?? null) as any,
  })
}

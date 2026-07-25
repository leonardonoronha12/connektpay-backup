import 'server-only'

import { isSupabaseServiceConfigured } from '@/lib/env'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import crypto from 'crypto'

function sha256(input: string) {
  return crypto.createHash('sha256').update(input).digest('hex')
}

function safeEqual(a: string, b: string) {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return crypto.timingSafeEqual(ba, bb)
}

type ApiKeyEntry = {
  name?: string
  prefix?: string
  hash?: string
  revoked_at?: string | null
}

export type OrgAuthContext = { organizationId: string; authType: 'session' | 'api_key'; actorProfileId: string; apiKeyHash?: string }

export async function getOrgFromApiKey(request: Request): Promise<OrgAuthContext | null> {
  const organizationId = request.headers.get('x-organization-id')
  const apiKey = request.headers.get('x-api-key') ?? request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')

  if (!organizationId || !apiKey) return null
  if (!isSupabaseServiceConfigured()) return null

  const supabase = getSupabaseAdminClient()
  const { data, error } = await supabase.from('provider_settings').select('api_keys').eq('organization_id', organizationId).maybeSingle()
  if (error) return null

  const list = Array.isArray((data as any)?.api_keys) ? ((data as any).api_keys as ApiKeyEntry[]) : []
  const incomingHash = sha256(apiKey)

  for (const entry of list) {
    if (entry?.revoked_at) continue
    if (!entry?.hash) continue
    if (safeEqual(entry.hash, incomingHash)) {
      const { data: owner } = await supabase
        .from('profiles')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('role', 'owner')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()

      const actorProfileId = owner?.id as string | null
      if (!actorProfileId) return null
      return { organizationId, authType: 'api_key', actorProfileId, apiKeyHash: incomingHash }
    }
  }

  return null
}

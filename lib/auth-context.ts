import 'server-only'

import { isSupabaseServiceConfigured } from '@/lib/env'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { getSupabaseServerClient } from '@/lib/supabase-server'

export async function getAuthedProfile() {
  const supabase = await getSupabaseServerClient()
  let userData: Awaited<ReturnType<typeof supabase.auth.getUser>>['data']
  let userError: Awaited<ReturnType<typeof supabase.auth.getUser>>['error']
  try {
    const result = await supabase.auth.getUser()
    userData = result.data
    userError = result.error
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const lower = msg.toLowerCase()
    if (lower.includes('auth session missing') || lower.includes('unexpected end of json input')) return null
    throw e
  }
  if (userError) {
    const msg = String(userError.message ?? '')
    const lower = msg.toLowerCase()
    if (lower.includes('auth session missing') || lower.includes('unexpected end of json input')) return null
    throw new Error(msg || 'Unauthorized')
  }
  const user = userData.user
  if (!user) return null

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, organization_id, role, email, full_name, phone, title')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) {
    if (isSupabaseServiceConfigured()) {
      const admin = getSupabaseAdminClient()
      const { data: adminProfile, error: adminError } = await admin
        .from('profiles')
        .select('id, organization_id, role, email, full_name, phone, title')
        .eq('id', user.id)
        .maybeSingle()
      if (adminError) throw new Error(adminError.message)
      if (!adminProfile) return null
      return { user, profile: adminProfile }
    }
    throw new Error(profileError.message)
  }
  if (!profile) return null

  return { user, profile }
}

import 'server-only'

import { getSupabaseAdminClient } from '@/lib/supabase-admin'

export async function getOrganizationOwnerProfileId(organizationId: string) {
  const supabase = getSupabaseAdminClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('role', 'owner')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error('Internal Server Error')
  const id = (data as any)?.id as string | null
  if (!id) throw new Error('Internal Server Error')
  return id
}

export async function getOrganizationOwnerEmail(organizationId: string) {
  const supabase = getSupabaseAdminClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('email')
    .eq('organization_id', organizationId)
    .eq('role', 'owner')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error('Internal Server Error')
  const email = (data as any)?.email as string | null
  if (!email) throw new Error('Internal Server Error')
  return email
}

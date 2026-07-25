import 'server-only'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

export function getSupabaseAdminClient() {
  if (client) return client

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set')
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')

  client = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return client
}


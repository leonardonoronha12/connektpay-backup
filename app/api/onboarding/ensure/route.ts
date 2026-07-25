import { isSupabaseConfigured } from '@/lib/env'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import { classifyInternalApiError, logApiError } from '@/lib/api-error'
import { NextResponse } from 'next/server'

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

export async function POST() {
  if (!isSupabaseConfigured()) return json({ ok: true, skipped: true })
  try {
    const supabase = await getSupabaseServerClient()
    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError) {
      const err = classifyInternalApiError(userError)
      return json({ error: err.message }, { status: err.status })
    }
    if (!userData.user) return json({ error: 'Unauthorized' }, { status: 401 })

    const { data: organizationId, error } = await supabase.rpc('ensure_profile_and_org')
    if (error) {
      logApiError('POST /api/onboarding/ensure: ensure_profile_and_org failed', error)
      return json({ error: 'Ocorreu um erro ao finalizar o cadastro. Tente novamente.' }, { status: 500 })
    }
    return json({ ok: true, organizationId })
  } catch (e) {
    const err = classifyInternalApiError(e)
    return json({ error: err.message }, { status: err.status })
  }
}

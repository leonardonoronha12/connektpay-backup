import { isSupabaseConfigured } from '@/lib/env'
import { getAuthedProfile } from '@/lib/auth-context'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import { classifyInternalApiError } from '@/lib/api-error'
import { normalizeRole } from '@/lib/rbac'
import { NextResponse } from 'next/server'

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

export async function GET() {
  if (!isSupabaseConfigured()) return json({ me: null })
  try {
    const ctx = await getAuthedProfile()
    if (!ctx) return json({ me: null }, { status: 401 })
    const role =
      normalizeRole((ctx.profile as any).role ?? null) ??
      normalizeRole((ctx.user.user_metadata as any)?.role ?? (ctx.user.app_metadata as any)?.role ?? null)
    return json({
      me: {
        userId: ctx.user.id,
        email: ctx.profile.email,
        fullName: ctx.profile.full_name,
        role,
        phone: (ctx.profile as any).phone ?? null,
        title: (ctx.profile as any).title ?? null,
        organizationId: ctx.profile.organization_id,
      },
    })
  } catch (e) {
    const err = classifyInternalApiError(e)
    return json({ error: err.message }, { status: err.status })
  }
}

export async function PUT(request: Request) {
  if (!isSupabaseConfigured()) return json({ error: 'Funcionalidade indisponÃ­vel no momento.' }, { status: 503 })
  try {
    const ctx = await getAuthedProfile()
    if (!ctx) return json({ error: 'Unauthorized' }, { status: 401 })
    const body = (await request.json().catch(() => null)) as
      | null
      | {
          fullName?: string
          phone?: string
          title?: string
          email?: string
        }

    const supabase = await getSupabaseServerClient()

    if (typeof body?.email === 'string' && body.email.trim() && body.email.trim() !== ctx.user.email) {
      const { error: uerr } = await supabase.auth.updateUser({ email: body.email.trim() })
      if (uerr) return json({ error: 'Invalid email' }, { status: 400 })
    }

    const patch: any = {}
    if (typeof body?.fullName === 'string') patch.full_name = body.fullName
    if (typeof body?.phone === 'string') patch.phone = body.phone
    if (typeof body?.title === 'string') patch.title = body.title
    if (typeof body?.email === 'string') patch.email = body.email.trim()

    const { data, error } = await supabase
      .from('profiles')
      .update(patch)
      .eq('id', ctx.user.id)
      .select('id, organization_id, role, email, full_name, phone, title')
      .single()
    if (error) return json({ error: 'NÃ£o foi possÃ­vel salvar seus dados agora.' }, { status: 500 })

    return json({
      me: {
        userId: ctx.user.id,
        email: data.email,
        fullName: data.full_name,
        role: data.role,
        phone: (data as any).phone ?? null,
        title: (data as any).title ?? null,
        organizationId: data.organization_id,
      },
    })
  } catch (e) {
    const err = classifyInternalApiError(e)
    return json({ error: err.message }, { status: err.status })
  }
}


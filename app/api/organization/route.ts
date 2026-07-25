import { isSupabaseConfigured, isSupabaseServiceConfigured } from '@/lib/env'
import { insertAuditLog } from '@/lib/audit-log'
import { assertRole, requireSessionOrgContext } from '@/lib/session-org-context'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import { classifyInternalApiError } from '@/lib/api-error'
import { NextResponse } from 'next/server'

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

function isSafeEmptySupabaseError(err: any) {
  const code = err?.code ? String(err.code) : ''
  if (code === '54001') return true
  if (code === 'PGRST205') return true
  if (code === '42P01') return true
  if (code === '42703') return true
  return false
}

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) return json({ organization: null })
  try {
    const ctx = await requireSessionOrgContext()
    assertRole(ctx.role, ['owner', 'super_admin'])
    const supabase = isSupabaseServiceConfigured() ? getSupabaseAdminClient() : await getSupabaseServerClient()
    const { data, error } = await supabase
      .from('organizations')
      .select('id, name, document, legal_name, segment, website, status')
      .eq('id', ctx.organizationId)
      .maybeSingle()
    if (error) {
      if (isSafeEmptySupabaseError(error)) {
        return json({
          organization: { id: ctx.organizationId, name: null, document: null, legal_name: null, segment: null, website: null, status: 'active' },
        })
      }
      return json({ error: 'Não foi possível carregar os dados da organização agora.' }, { status: 500 })
    }
    if (!data) {
      return json({
        organization: { id: ctx.organizationId, name: null, document: null, legal_name: null, segment: null, website: null, status: 'active' },
      })
    }
    return json({ organization: data })
  } catch (e) {
    const err = classifyInternalApiError(e)
    return json({ error: err.message }, { status: err.status })
  }
}

export async function PUT(request: Request) {
  if (!isSupabaseConfigured()) return json({ error: 'Funcionalidade indisponível no momento.' }, { status: 503 })
  try {
    const ctx = await requireSessionOrgContext()
    assertRole(ctx.role, ['owner', 'super_admin'])
    const body = (await request.json().catch(() => null)) as
      | null
      | {
          name?: string
          document?: string
          legalName?: string
          segment?: string
          website?: string
        }

    const supabase = isSupabaseServiceConfigured() ? getSupabaseAdminClient() : await getSupabaseServerClient()
    const { data: before } = await supabase
      .from('organizations')
      .select('id, name, document, legal_name, segment, website, status')
      .eq('id', ctx.organizationId)
      .maybeSingle()

    const patch: any = {}
    if (typeof body?.name === 'string') patch.name = body.name
    if (typeof body?.document === 'string') patch.document = body.document
    if (typeof body?.legalName === 'string') patch.legal_name = body.legalName
    if (typeof body?.segment === 'string') patch.segment = body.segment
    if (typeof body?.website === 'string') patch.website = body.website

    const { data, error } = await supabase
      .from('organizations')
      .update(patch)
      .eq('id', ctx.organizationId)
      .select('id, name, document, legal_name, segment, website, status')
      .maybeSingle()

    if (error) return json({ error: 'Não foi possível salvar os dados da organização agora.' }, { status: 500 })

    const next = data
      ? data
      : await (async () => {
          const admin = isSupabaseServiceConfigured() ? getSupabaseAdminClient() : await getSupabaseServerClient()
          const { data: created, error: createError } = await admin
            .from('organizations')
            .upsert({ id: ctx.organizationId, status: before?.status ?? 'active', ...patch }, { onConflict: 'id' })
            .select('id, name, document, legal_name, segment, website, status')
            .single()
          if (createError) return null
          return created
        })()

    if (!next) return json({ error: 'Não foi possível salvar os dados da organização agora.' }, { status: 500 })
    await insertAuditLog({
      organizationId: ctx.organizationId,
      actorProfileId: ctx.actorProfileId,
      authType: 'session',
      origin: 'internal_api',
      action: 'UPDATE',
      entity: 'organization',
      entityId: next.id as string,
      before,
      after: next,
    })
    return json({ organization: next })
  } catch (e) {
    const err = classifyInternalApiError(e)
    return json({ error: err.message }, { status: err.status })
  }
}

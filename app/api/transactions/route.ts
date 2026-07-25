import { isSupabaseConfigured, isSupabaseServiceConfigured } from '@/lib/env'
import { assertRole, requireSessionOrgContext } from '@/lib/session-org-context'
import { getOrgFromApiKey } from '@/lib/public-api-auth'
import { checkPublicRateLimit } from '@/lib/public-rate-limit'
import { checkRuntimeRateLimit, getRequestClientIp } from '@/lib/runtime-guards'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import { classifyInternalApiError } from '@/lib/api-error'
import { buildCsvFilename, buildCsvString } from '@/lib/csv'
import { NextResponse } from 'next/server'

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

function buildTransactionDetail(data: any) {
  const pix = data?.provider_payload?.pix && typeof data.provider_payload.pix === 'object' ? data.provider_payload.pix : {}
  return {
    id: data.id,
    status: data.status,
    provider_reference: data?.provider_reference ?? null,
    provider_order_id: data?.provider_order_id ?? null,
    provider_charge_id: data?.provider_charge_id ?? null,
    amount: data.amount,
    currency: data.currency,
    created_at: data?.created_at ?? null,
    pixCopyPaste: typeof pix.copyPaste === 'string' ? pix.copyPaste : null,
    pixQrCode: typeof pix.qrCode === 'string' ? pix.qrCode : null,
    pixQrCodeUrl: typeof pix.qrCodeUrl === 'string' ? pix.qrCodeUrl : null,
    pixQrCodeBase64: typeof pix.qrCodeBase64 === 'string' ? pix.qrCodeBase64 : null,
    pixExpiresAt: typeof pix.expiresAt === 'string' ? pix.expiresAt : null,
  }
}

function isUuidLike(input: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input)
}

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) return json({ transactions: [] })
  const url = new URL(request.url)
  const transactionId = url.searchParams.get('transactionId')

  if (transactionId) {
    if (!isSupabaseServiceConfigured()) return json({ error: 'Funcionalidade indisponível no momento.' }, { status: 503 })
    const apiKeyCtx = await getOrgFromApiKey(request)
    const token = url.searchParams.get('token')
    if (apiKeyCtx?.apiKeyHash) {
      const allowed = await checkPublicRateLimit({ organizationId: apiKeyCtx.organizationId, apiKeyHash: apiKeyCtx.apiKeyHash, limit: 120, windowSeconds: 60 })
      if (!allowed) return json({ error: 'Rate limit exceeded' }, { status: 429 })
    }
    if (!apiKeyCtx && token) {
      const detailRate = checkRuntimeRateLimit({
        key: `tx-detail:${getRequestClientIp(request)}:${transactionId}`,
        limit: 30,
        windowMs: 60_000,
      })
      if (!detailRate.allowed) return json({ error: 'Rate limit exceeded' }, { status: 429 })
    }

    if (!apiKeyCtx && !token) {
      try {
        const ctx = await requireSessionOrgContext()
        assertRole(ctx.role, ['owner', 'admin', 'operacional', 'financeiro', 'super_admin'])
        const supabase = isSupabaseServiceConfigured() ? getSupabaseAdminClient() : await getSupabaseServerClient()
        const { data, error } = await supabase
          .from('transactions')
          .select('id, status, provider_reference, provider_order_id, provider_charge_id, amount, currency, created_at, provider_payload')
          .eq('organization_id', ctx.organizationId)
          .eq('id', transactionId)
          .maybeSingle()
        if (error) return json({ error: 'Não foi possível carregar a transação agora.' }, { status: 500 })
        if (!data) return json({ error: 'Transação não encontrada.' }, { status: 404 })
        return json({ transaction: buildTransactionDetail(data) })
      } catch {
        return json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    const supabase = getSupabaseAdminClient()
    let query = supabase
      .from('transactions')
      .select('id, status, provider_reference, provider_order_id, provider_charge_id, amount, currency, created_at, provider_payload')
      .eq('id', transactionId)

    if (apiKeyCtx) query = query.eq('organization_id', apiKeyCtx.organizationId)
    if (!apiKeyCtx && token) query = query.eq('public_token', token)

    const { data, error } = await query.maybeSingle()
    if (error) return json({ error: 'Não foi possível carregar a transação agora.' }, { status: 500 })
    if (!data) return json({ error: 'Transação não encontrada.' }, { status: 404 })
    return json({ transaction: buildTransactionDetail(data) })
  }

  try {
    const apiKeyCtx = await getOrgFromApiKey(request)
    if (apiKeyCtx?.apiKeyHash) {
      const allowed = await checkPublicRateLimit({ organizationId: apiKeyCtx.organizationId, apiKeyHash: apiKeyCtx.apiKeyHash, limit: 120, windowSeconds: 60 })
      if (!allowed) return json({ error: 'Rate limit exceeded' }, { status: 429 })
    }
    const ctx = apiKeyCtx ? null : await requireSessionOrgContext()
    if (!apiKeyCtx) assertRole(ctx!.role, ['owner', 'admin', 'operacional', 'financeiro', 'super_admin'])
    const supabase = apiKeyCtx || isSupabaseServiceConfigured() ? getSupabaseAdminClient() : await getSupabaseServerClient()
    const organizationId = apiKeyCtx ? apiKeyCtx.organizationId : (ctx!.organizationId as string)

    const status = url.searchParams.get('status')
    const q = url.searchParams.get('q')
    const format = url.searchParams.get('format')

    let query = supabase
      .from('transactions')
      .select('id, amount, currency, method, status, provider_reference, created_at, customer:customers(name, email)')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })

    if (status) query = query.eq('status', status)
    if (q) {
      const qt = q.trim()
      if (isUuidLike(qt)) query = query.or(`id.eq.${qt},provider_reference.ilike.%${qt}%`)
      else query = query.or(`provider_reference.ilike.%${qt}%`)
    }

    let { data, error } = await query
    if (error) {
      let fallback = supabase
        .from('transactions')
        .select('id, amount, currency, method, status, provider_reference, created_at, customer_id')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })

      if (status) fallback = fallback.eq('status', status)
      if (q) {
        const qt = q.trim()
        if (isUuidLike(qt)) fallback = fallback.or(`id.eq.${qt},provider_reference.ilike.%${qt}%`)
        else fallback = fallback.or(`provider_reference.ilike.%${qt}%`)
      }

      const r = await fallback
      data = r.data as any
      error = r.error
    }
    if (error) return json({ transactions: [] })

    if (format === 'csv') {
      const rows = (data ?? []).map((t: any) => ({
        id: t.id,
        amount: t.amount,
        currency: t.currency,
        method: t.method,
        status: t.status,
        provider_reference: t.provider_reference ?? '',
        created_at: t.created_at,
      }))
      const csv = buildCsvString(
        [
          { key: 'id', header: 'id' },
          { key: 'amount', header: 'amount' },
          { key: 'currency', header: 'currency' },
          { key: 'method', header: 'method' },
          { key: 'status', header: 'status' },
          { key: 'provider_reference', header: 'provider_reference' },
          { key: 'created_at', header: 'created_at' },
        ],
        rows
      )
      return new NextResponse(csv, {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="${buildCsvFilename('transactions')}"`,
        },
      })
    }

    return json({ transactions: data ?? [] })
  } catch (e) {
    const err = classifyInternalApiError(e)
    return json({ error: err.message }, { status: err.status })
  }
}

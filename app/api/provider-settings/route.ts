import {
  getFinancialProvider,
  getProviderCapabilities,
  isSupabaseConfigured,
  isSupabaseServiceConfigured,
} from '@/lib/env'
import { getProviderLabel } from '@/lib/acquirer/provider-id'
import { insertAuditLog } from '@/lib/audit-log'
import { assertRole, requireSessionOrgContext } from '@/lib/session-org-context'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import { classifyInternalApiError } from '@/lib/api-error'
import { buildCsvFilename, buildCsvString } from '@/lib/csv'
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
  const msg = err?.message ? String(err.message) : ''
  if (msg.toLowerCase().includes('stack depth')) return true
  if (msg.toLowerCase().includes('schema cache')) return true
  return false
}

const SAFE_SELECT =
  'organization_id, environment, base_url, webhook_url, timeout_seconds, retry_policy, status, last_sync_at, created_at, updated_at'

type ProviderSettingsRuntimeFields = {
  environment: string | null
  base_url: string | null
  webhook_url: string | null
  timeout_seconds: number | null
  retry_policy: Record<string, unknown> | null
  status: string | null
  last_sync_at: string | null
  created_at: string | null
  updated_at: string | null
}

function buildProviderCapabilities() {
  const providerId = getFinancialProvider()
  const capabilities = getProviderCapabilities(providerId)
  return {
    provider_id: providerId,
    provider_name: capabilities.providerName,
    credentials_configured: capabilities.credentialsConfigured,
    payment_links_enabled: capabilities.paymentLinks,
    standalone_payments_enabled: capabilities.payments,
    receiver_provider_sync_enabled: capabilities.recipients,
    kyc_enabled: capabilities.kyc,
    split_enabled: capabilities.split,
    subscriptions_enabled: capabilities.subscriptions,
    payouts_enabled: capabilities.payouts,
    anticipation_enabled: capabilities.anticipation,
    webhook_secret_configured: capabilities.webhooks,
  }
}

function withRuntimeMeta(settings: ProviderSettingsRuntimeFields) {
  return {
    ...settings,
    provider_id: getFinancialProvider(),
    provider_label: getProviderLabel(getFinancialProvider()),
    capabilities: buildProviderCapabilities(),
  }
}

async function getOrCreateProviderSettings(supabase: any, organizationId: string) {
  const { data: existing, error } = await supabase.from('provider_settings').select(SAFE_SELECT).eq('organization_id', organizationId).maybeSingle()
  if (error) {
    if (isSafeEmptySupabaseError(error)) return null
    throw new Error(error.message)
  }
  if (existing) return existing
  const { data: created, error: insErr } = await supabase.from('provider_settings').insert({ organization_id: organizationId }).select(SAFE_SELECT).single()
  if (insErr) {
    if (isSafeEmptySupabaseError(insErr)) return null
    throw new Error(insErr.message)
  }
  return created
}

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) return json({ providerSettings: null })

  try {
    const ctx = await requireSessionOrgContext()
    assertRole(ctx.role, ['owner', 'super_admin'])
    const format = new URL(request.url).searchParams.get('format')
    const supabase = isSupabaseServiceConfigured() ? getSupabaseAdminClient() : await getSupabaseServerClient()
    const settings = await getOrCreateProviderSettings(supabase, ctx.organizationId)
    const payload = !settings
      ? withRuntimeMeta({
          environment: 'production',
          base_url: null,
          webhook_url: null,
          timeout_seconds: 30,
          retry_policy: { max_attempts: 3 },
          status: 'not_configured',
          last_sync_at: null,
          created_at: null,
          updated_at: null,
        })
      : withRuntimeMeta({
          environment: settings.environment,
          base_url: settings.base_url,
          webhook_url: settings.webhook_url,
          timeout_seconds: settings.timeout_seconds,
          retry_policy: settings.retry_policy,
          status: settings.status,
          last_sync_at: settings.last_sync_at,
          created_at: settings.created_at,
          updated_at: settings.updated_at,
        })
    if (format === 'csv') {
      const capabilities = (payload.capabilities ?? {}) as Record<string, unknown>
      const csv = buildCsvString(
        [
          { key: 'provider_id', header: 'provider_id' },
          { key: 'provider_label', header: 'provider_label' },
          { key: 'environment', header: 'environment' },
          { key: 'base_url', header: 'base_url' },
          { key: 'webhook_url', header: 'webhook_url' },
          { key: 'timeout_seconds', header: 'timeout_seconds' },
          { key: 'status', header: 'status' },
          { key: 'last_sync_at', header: 'last_sync_at' },
          { key: 'credentials_configured', header: 'credentials_configured' },
          { key: 'payment_links_enabled', header: 'payment_links_enabled' },
          { key: 'standalone_payments_enabled', header: 'standalone_payments_enabled' },
          { key: 'receiver_provider_sync_enabled', header: 'receiver_provider_sync_enabled' },
          { key: 'kyc_enabled', header: 'kyc_enabled' },
          { key: 'split_enabled', header: 'split_enabled' },
          { key: 'subscriptions_enabled', header: 'subscriptions_enabled' },
          { key: 'payouts_enabled', header: 'payouts_enabled' },
          { key: 'anticipation_enabled', header: 'anticipation_enabled' },
          { key: 'webhook_secret_configured', header: 'webhook_secret_configured' },
          { key: 'retry_policy', header: 'retry_policy' },
          { key: 'created_at', header: 'created_at' },
          { key: 'updated_at', header: 'updated_at' },
        ],
        [
          {
            provider_id: payload.provider_id ?? '',
            provider_label: payload.provider_label ?? '',
            environment: payload.environment ?? '',
            base_url: payload.base_url ?? '',
            webhook_url: payload.webhook_url ?? '',
            timeout_seconds: payload.timeout_seconds ?? '',
            status: payload.status ?? '',
            last_sync_at: payload.last_sync_at ?? '',
            credentials_configured: Boolean(capabilities.credentials_configured),
            payment_links_enabled: Boolean(capabilities.payment_links_enabled),
            standalone_payments_enabled: Boolean(capabilities.standalone_payments_enabled),
            receiver_provider_sync_enabled: Boolean(capabilities.receiver_provider_sync_enabled),
            kyc_enabled: Boolean(capabilities.kyc_enabled),
            split_enabled: Boolean(capabilities.split_enabled),
            subscriptions_enabled: Boolean(capabilities.subscriptions_enabled),
            payouts_enabled: Boolean(capabilities.payouts_enabled),
            anticipation_enabled: Boolean(capabilities.anticipation_enabled),
            webhook_secret_configured: Boolean(capabilities.webhook_secret_configured),
            retry_policy: JSON.stringify(payload.retry_policy ?? {}),
            created_at: payload.created_at ?? '',
            updated_at: payload.updated_at ?? '',
          },
        ]
      )
      return new NextResponse(csv, {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="${buildCsvFilename('provider-settings')}"`,
        },
      })
    }
    if (!settings) {
      return json({ providerSettings: payload })
    }
    return json({ providerSettings: payload })
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
    const body = (await request.json().catch(() => null)) as null | {
      environment?: 'sandbox' | 'production'
      base_url?: string | null
      webhook_url?: string | null
      timeout_seconds?: number
    }
    if (!body) return json({ error: 'Invalid body' }, { status: 400 })

    const supabase = isSupabaseServiceConfigured() ? getSupabaseAdminClient() : await getSupabaseServerClient()
    const before = await getOrCreateProviderSettings(supabase, ctx.organizationId)

    const { data, error } = await supabase
      .from('provider_settings')
      .update({
        ...(body.environment ? { environment: body.environment } : null),
        ...(typeof body.base_url !== 'undefined' ? { base_url: body.base_url } : null),
        ...(typeof body.webhook_url !== 'undefined' ? { webhook_url: body.webhook_url } : null),
        ...(typeof body.timeout_seconds === 'number' ? { timeout_seconds: body.timeout_seconds } : null),
      })
      .eq('organization_id', ctx.organizationId)
      .select('environment, base_url, webhook_url, timeout_seconds, retry_policy, status, last_sync_at, created_at, updated_at')
      .single()

    if (error) return json({ error: 'Não foi possível salvar as configurações agora.' }, { status: 500 })
    await insertAuditLog({
      organizationId: ctx.organizationId,
      actorProfileId: ctx.actorProfileId,
      authType: 'session',
      origin: 'internal_api',
      action: 'UPDATE',
      entity: 'provider_settings',
      entityId: null,
      before,
      after: data,
    })
    return json({ providerSettings: withRuntimeMeta(data) })
  } catch (e) {
    const err = classifyInternalApiError(e)
    return json({ error: err.message }, { status: err.status })
  }
}

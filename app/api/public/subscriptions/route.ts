import { ProviderError, mapProviderErrorToUserMessage } from '@/lib/acquirer/provider-error'
import { classifyInternalApiError } from '@/lib/api-error'
import { getFinancialProvider, getProviderCapabilities, isProviderConfigured, isSupabaseServiceConfigured } from '@/lib/env'
import { checkPublicRateLimit } from '@/lib/public-rate-limit'
import { getOrgFromApiKey } from '@/lib/public-api-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { createSubscription, listSubscriptions } from '@/lib/subscription-service'
import { NextResponse } from 'next/server'

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

function buildSubscriptionsProviderState() {
  const providerId = getFinancialProvider()
  const capabilities = getProviderCapabilities(providerId)
  if (!capabilities.credentialsConfigured || !isProviderConfigured(providerId)) return null
  if (!capabilities.subscriptions) {
    return {
      providerId,
      enabled: false,
      message: 'Assinaturas ainda nÃ£o estÃ£o disponÃ­veis para o provedor financeiro ativo.',
    }
  }
  return { providerId, enabled: true as const }
}

function normalizeSubscriptionCardInput(
  providerId: string,
  card:
    | {
        holderName?: string
        number?: string
        expMonth?: string
        expYear?: string
        cvv?: string
        token?: string
        brand?: string
        last4?: string
      }
    | null
    | undefined,
) {
  const holderName = typeof card?.holderName === 'string' ? card.holderName.trim() : ''
  const expMonth = typeof card?.expMonth === 'string' ? card.expMonth.trim() : ''
  const expYear = typeof card?.expYear === 'string' ? card.expYear.trim() : ''
  if (!holderName || !expMonth || !expYear) {
    return { ok: false as const, message: 'Missing card' }
  }

  if (providerId === 'pagarme') {
    const token = typeof card?.token === 'string' ? card.token.trim() : ''
    const hasRawPan = typeof card?.number === 'string' && card.number.trim().length > 0
    const hasRawCvv = typeof card?.cvv === 'string' && card.cvv.trim().length > 0
    if (!token || hasRawPan || hasRawCvv) {
      return {
        ok: false as const,
        message: 'Envie apenas card.token para assinaturas em cartão da Pagar.me.',
      }
    }

    return {
      ok: true as const,
      card: {
        holderName,
        token,
        expMonth,
        expYear,
        brand: typeof card?.brand === 'string' ? card.brand.trim() || undefined : undefined,
        last4: typeof card?.last4 === 'string' ? card.last4.trim() || undefined : undefined,
      },
    }
  }

  const number = typeof card?.number === 'string' ? card.number.trim() : ''
  const cvv = typeof card?.cvv === 'string' ? card.cvv.trim() : ''
  if (!number || !cvv) {
    return { ok: false as const, message: 'Missing card' }
  }

  return {
    ok: true as const,
    card: {
      holderName,
      number,
      expMonth,
      expYear,
      cvv,
      brand: typeof card?.brand === 'string' ? card.brand.trim() || undefined : undefined,
      last4: typeof card?.last4 === 'string' ? card.last4.trim() || undefined : undefined,
    },
  }
}

export async function GET(request: Request) {
  if (!isSupabaseServiceConfigured()) return json({ error: 'Funcionalidade indisponÃ­vel no momento.' }, { status: 503 })
  const ctx = await getOrgFromApiKey(request)
  if (!ctx?.apiKeyHash) return json({ error: 'Unauthorized' }, { status: 401 })
  const allowed = await checkPublicRateLimit({ organizationId: ctx.organizationId, apiKeyHash: ctx.apiKeyHash, limit: 120, windowSeconds: 60 })
  if (!allowed) return json({ error: 'Rate limit exceeded' }, { status: 429 })

  const supabase = getSupabaseAdminClient()
  const out = await listSubscriptions({ supabase, organizationId: ctx.organizationId })
  return json(out)
}

export async function POST(request: Request) {
  if (!isSupabaseServiceConfigured()) return json({ error: 'Funcionalidade indisponÃ­vel no momento.' }, { status: 503 })
  const providerState = buildSubscriptionsProviderState()
  if (!providerState) return json({ error: 'O provedor financeiro ainda nÃ£o estÃ¡ configurado.' }, { status: 503 })
  if (!providerState.enabled) return json({ error: providerState.message }, { status: 503 })
  try {
    const ctx = await getOrgFromApiKey(request)
    if (!ctx?.apiKeyHash) return json({ error: 'Unauthorized' }, { status: 401 })
    const allowed = await checkPublicRateLimit({ organizationId: ctx.organizationId, apiKeyHash: ctx.apiKeyHash, limit: 60, windowSeconds: 60 })
    if (!allowed) return json({ error: 'Rate limit exceeded' }, { status: 429 })

    const body = (await request.json().catch(() => null)) as
      | null
      | {
          planId?: string
          customer?: { name?: string; email?: string; document?: string; phone?: string }
          card?: {
            holderName?: string
            number?: string
            expMonth?: string
            expYear?: string
            cvv?: string
            token?: string
            brand?: string
            last4?: string
          }
        }
    if (!body?.planId) return json({ error: 'Missing planId' }, { status: 400 })
    const normalizedCard = normalizeSubscriptionCardInput(providerState.providerId, body.card)
    if (!normalizedCard.ok) return json({ error: normalizedCard.message }, { status: 400 })

    const supabase = getSupabaseAdminClient()
    const out = await createSubscription({
      supabase,
      organizationId: ctx.organizationId,
      actorProfileId: ctx.actorProfileId,
      origin: 'public_api',
      authType: 'api_key',
      planId: body.planId,
      payer: { name: body.customer?.name ?? body.customer?.email ?? 'Pagador', email: body.customer?.email ?? null, document: body.customer?.document ?? null, phone: body.customer?.phone ?? null },
      card: normalizedCard.card,
    })

    return json(out, { status: 201 })
  } catch (e) {
    if (e instanceof ProviderError) return json({ error: mapProviderErrorToUserMessage(e) }, { status: e.status })
    const err = classifyInternalApiError(e)
    return json({ error: err.message }, { status: err.status })
  }
}


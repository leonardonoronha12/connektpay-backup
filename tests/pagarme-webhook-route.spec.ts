import crypto from 'crypto'
import { expect, test } from '@playwright/test'

import { createBasicAuthorizationHeader } from '@/lib/webhook-basic-auth'
import { getAdminClient, loadEnvLocalIfNeeded } from '@/tests/helpers/e2e-auth'

async function getAnyOrganizationId() {
  loadEnvLocalIfNeeded()
  const admin = getAdminClient()
  if (!admin) return null
  const { data, error } = await admin.from('organizations').select('id').limit(1).maybeSingle()
  if (error) return null
  return typeof data?.id === 'string' ? data.id : null
}

test.describe('Pagar.me webhook route', () => {
  test('aceita Basic Auth valido, rejeita credenciais invalidas, atualiza banco e preserva idempotencia', async ({ request, baseURL }) => {
    test.skip(!baseURL, 'BASE_URL não configurado para o teste do endpoint.')
    test.skip(/^https:\/\/.+\.vercel\.app$/i.test(String(baseURL)), 'Este teste depende de process.env mutável no mesmo processo do servidor e roda apenas localmente.')

    const organizationId = await getAnyOrganizationId()
    test.skip(!organizationId, 'Sem organization_id disponível no Supabase local para validar idempotência do webhook.')

    const admin = getAdminClient()
    if (!admin) return
    const webhookId = `hook_test_${Date.now()}`
    const unknownWebhookId = `${webhookId}_unknown`
    const authorization = createBasicAuthorizationHeader({
      username: 'webhook-user',
      password: 'sup3r:s3cret!',
    })
    const payload = {
      id: webhookId,
      type: 'order.paid',
      data: {
        id: `or_test_${Date.now()}`,
        metadata: {
          organization_id: organizationId,
        },
      },
    }
    const unknownPayload = {
      id: unknownWebhookId,
      type: 'provider.unknown',
      data: {
        id: `unknown_${Date.now()}`,
        metadata: {
          organization_id: organizationId,
        },
      },
    }
    const uncorrelatedPayload = {
      id: `${webhookId}_uncorrelated`,
      type: 'charge.paid',
      data: {
        id: `ch_uncorrelated_${Date.now()}`,
      },
    }

    const originalProvider = process.env.FINANCIAL_PROVIDER
    const originalUsername = process.env.PAGARME_WEBHOOK_USERNAME
    const originalPassword = process.env.PAGARME_WEBHOOK_PASSWORD
    process.env.FINANCIAL_PROVIDER = 'pagarme'
    process.env.PAGARME_WEBHOOK_USERNAME = 'webhook-user'
    process.env.PAGARME_WEBHOOK_PASSWORD = 'sup3r:s3cret!'

    try {
      const accepted = await request.post(`${baseURL}/api/webhooks`, {
        data: payload,
        headers: {
          'content-type': 'application/json',
          authorization,
        },
      })

      expect(accepted.status()).toBe(200)
      const acceptedJson = (await accepted.json()) as { ok?: boolean; eventId?: string }
      expect(acceptedJson.ok).toBeTruthy()
      expect(typeof acceptedJson.eventId).toBe('string')

      if (admin) {
        const { data: persisted } = await admin
          .from('webhook_events')
          .select('id, provider_event_id, type')
          .eq('id', acceptedJson.eventId as string)
          .maybeSingle()

        expect(persisted?.provider_event_id).toBe(webhookId)
        expect(persisted?.type).toBe('order.paid')
      }

      const duplicate = await request.post(`${baseURL}/api/webhooks`, {
        data: payload,
        headers: {
          'content-type': 'application/json',
          authorization,
        },
      })

      expect(duplicate.status()).toBe(200)
      const duplicateJson = (await duplicate.json()) as { ok?: boolean; eventId?: string }
      expect(duplicateJson.ok).toBeTruthy()
      expect(duplicateJson.eventId).toBe(acceptedJson.eventId)

      const missingAuth = await request.post(`${baseURL}/api/webhooks`, {
        data: payload,
        headers: {
          'content-type': 'application/json',
        },
      })
      expect(missingAuth.status()).toBe(401)
      expect(missingAuth.headers()['www-authenticate']).toContain('Basic')

      const bearer = await request.post(`${baseURL}/api/webhooks`, {
        data: payload,
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer token',
        },
      })
      expect(bearer.status()).toBe(401)

      const invalidBase64 = await request.post(`${baseURL}/api/webhooks`, {
        data: payload,
        headers: {
          'content-type': 'application/json',
          authorization: 'Basic ###',
        },
      })
      expect(invalidBase64.status()).toBe(401)

      const wrongUser = await request.post(`${baseURL}/api/webhooks`, {
        data: payload,
        headers: {
          'content-type': 'application/json',
          authorization: createBasicAuthorizationHeader({
            username: 'wrong-user',
            password: 'sup3r:s3cret!',
          }),
        },
      })
      expect(wrongUser.status()).toBe(401)

      const wrongPassword = await request.post(`${baseURL}/api/webhooks`, {
        data: payload,
        headers: {
          'content-type': 'application/json',
          authorization: createBasicAuthorizationHeader({
            username: 'webhook-user',
            password: 'wrong-password',
          }),
        },
      })
      expect(wrongPassword.status()).toBe(401)

      const unknownEvent = await request.post(`${baseURL}/api/webhooks`, {
        data: unknownPayload,
        headers: {
          'content-type': 'application/json',
          authorization,
        },
      })
      expect(unknownEvent.status()).toBe(200)
      const unknownJson = (await unknownEvent.json()) as { ok?: boolean; eventId?: string }
      expect(unknownJson.ok).toBeTruthy()
      expect(typeof unknownJson.eventId).toBe('string')

      const uncorrelated = await request.post(`${baseURL}/api/webhooks`, {
        data: uncorrelatedPayload,
        headers: {
          'content-type': 'application/json',
          authorization,
        },
      })
      expect(uncorrelated.status()).toBe(409)
      const uncorrelatedJson = (await uncorrelated.json()) as { code?: string; unresolvedEventId?: string }
      expect(uncorrelatedJson.code).toBe('organization_id_unresolved')
      expect(typeof uncorrelatedJson.unresolvedEventId).toBe('string')
      if (admin) {
        const { data: unresolvedRow } = await admin
          .from('webhook_events_unresolved')
          .select('id, provider, provider_event_id, status, resolution_error')
          .eq('id', uncorrelatedJson.unresolvedEventId as string)
          .maybeSingle()
        expect(unresolvedRow?.provider).toBe('pagarme')
        expect(unresolvedRow?.provider_event_id).toBe(`${webhookId}_uncorrelated`)
        expect(unresolvedRow?.status).toBe('pending')
        expect(unresolvedRow?.resolution_error).toBe('organization_id_unresolved')
      }
    } finally {
      process.env.FINANCIAL_PROVIDER = originalProvider
      process.env.PAGARME_WEBHOOK_USERNAME = originalUsername
      process.env.PAGARME_WEBHOOK_PASSWORD = originalPassword

      if (admin) {
        const { data } = await admin.from('webhook_events').select('id').eq('provider_event_id', webhookId).eq('organization_id', organizationId)
        const ids = Array.isArray(data) ? data.map((row) => row.id).filter((value): value is string => typeof value === 'string') : []
        if (ids.length > 0) {
          await admin.from('webhook_attempts').delete().in('webhook_event_id', ids)
        }
        await admin.from('webhook_events').delete().eq('provider_event_id', webhookId).eq('organization_id', organizationId)

        const { data: unknownData } = await admin.from('webhook_events').select('id').eq('provider_event_id', unknownWebhookId).eq('organization_id', organizationId)
        const unknownIds = Array.isArray(unknownData)
          ? unknownData.map((row) => row.id).filter((value): value is string => typeof value === 'string')
          : []
        if (unknownIds.length > 0) {
          await admin.from('webhook_attempts').delete().in('webhook_event_id', unknownIds)
        }
        await admin.from('webhook_events').delete().eq('provider_event_id', unknownWebhookId).eq('organization_id', organizationId)
        await admin.from('webhook_events_unresolved').delete().eq('provider', 'pagarme').eq('provider_event_id', `${webhookId}_uncorrelated`)
      }
    }
  })

  test('cria transação interna para order.paid correlacionado por order_code do payment link', async ({ request, baseURL }) => {
    test.skip(!baseURL, 'BASE_URL não configurado para o teste do endpoint.')
    test.skip(/^https:\/\/.+\.vercel\.app$/i.test(String(baseURL)), 'Este teste depende de process.env mutável no mesmo processo do servidor e roda apenas localmente.')

    const organizationId = await getAnyOrganizationId()
    test.skip(!organizationId, 'Sem organization_id disponível no Supabase local para validar correlação por payment link.')

    const admin = getAdminClient()
    test.skip(!admin, 'Sem Supabase admin disponível para preparar o payment link.')
    if (!admin) return

    const paymentLinkId = crypto.randomUUID()
    const slug = `hook-order-${Date.now()}`
    const webhookId = `hook_order_${Date.now()}`
    const orderId = `or_test_${Date.now()}`
    const authorization = createBasicAuthorizationHeader({
      username: 'webhook-user',
      password: 'sup3r:s3cret!',
    })

    const originalProvider = process.env.FINANCIAL_PROVIDER
    const originalUsername = process.env.PAGARME_WEBHOOK_USERNAME
    const originalPassword = process.env.PAGARME_WEBHOOK_PASSWORD
    process.env.FINANCIAL_PROVIDER = 'pagarme'
    process.env.PAGARME_WEBHOOK_USERNAME = 'webhook-user'
    process.env.PAGARME_WEBHOOK_PASSWORD = 'sup3r:s3cret!'

    try {
      const insertedLink = await admin
        .from('payment_links')
        .insert({
          id: paymentLinkId,
          organization_id: organizationId,
          name: 'Webhook Hosted Checkout',
          description: 'Link temporário para teste de correlação via order_code.',
          amount: 12000,
          currency: 'BRL',
          type: 'one_time',
          methods: { pix: false, card: true },
          status: 'active',
          slug,
          metadata: { provider_id: 'pagarme' },
        })
        .select('id')
        .single()

      expect(insertedLink.error).toBeNull()

      const response = await request.post(`${baseURL}/api/webhooks`, {
        data: {
          id: webhookId,
          type: 'order.paid',
          data: {
            id: orderId,
            code: paymentLinkId,
            amount: 12000,
            currency: 'BRL',
            charges: [{ payment_method: 'credit_card' }],
          },
        },
        headers: {
          'content-type': 'application/json',
          authorization,
        },
      })

      expect(response.status()).toBe(200)
      const json = (await response.json()) as { ok?: boolean; eventId?: string }
      expect(json.ok).toBeTruthy()
      expect(typeof json.eventId).toBe('string')

      const { data: eventRow } = await admin
        .from('webhook_events')
        .select('id, provider_event_id, type, status')
        .eq('id', json.eventId as string)
        .maybeSingle()
      expect(eventRow?.provider_event_id).toBe(webhookId)
      expect(eventRow?.type).toBe('order.paid')

      const { data: tx } = await admin
        .from('transactions')
        .select('id, organization_id, payment_link_id, status, amount, method, provider_reference')
        .eq('organization_id', organizationId)
        .eq('payment_link_id', paymentLinkId)
        .eq('provider_reference', orderId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      expect(tx?.status).toBe('paid')
      expect(tx?.amount).toBe(12000)
      expect(tx?.method).toBe('card')

      const { data: splitSnapshot } = await admin
        .from('pay_transacao')
        .select('transaction_id, payment_link_id, provider_reference, status')
        .eq('transaction_id', tx?.id as string)
        .maybeSingle()

      if (splitSnapshot) {
        expect(splitSnapshot.payment_link_id).toBe(paymentLinkId)
        expect(splitSnapshot.provider_reference).toBe(orderId)
        expect(splitSnapshot.status).toBe('paid')
      }
    } finally {
      process.env.FINANCIAL_PROVIDER = originalProvider
      process.env.PAGARME_WEBHOOK_USERNAME = originalUsername
      process.env.PAGARME_WEBHOOK_PASSWORD = originalPassword
    }
  })
})

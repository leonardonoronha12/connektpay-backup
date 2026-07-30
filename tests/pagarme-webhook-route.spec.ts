import crypto from 'crypto'
import { spawn } from 'node:child_process'
import net from 'node:net'
import { expect, test } from '@playwright/test'

import { createBasicAuthorizationHeader } from '@/lib/webhook-basic-auth'
import { getAdminClient, loadEnvLocalIfNeeded } from '@/tests/helpers/e2e-auth'

const WEBHOOK_USERNAME = 'webhook-user'
const WEBHOOK_PASSWORD = 'sup3r:s3cret!'
const SERVER_READY_TIMEOUT_MS = 120_000
const SERVER_STOP_TIMEOUT_MS = 10_000
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'

async function getAnyOrganizationId() {
  loadEnvLocalIfNeeded()
  const admin = getAdminClient()
  if (!admin) return null
  const { data, error } = await admin.from('organizations').select('id').limit(1).maybeSingle()
  if (error) return null
  return typeof data?.id === 'string' ? data.id : null
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function getFreePort() {
  return await new Promise<number>((resolve, reject) => {
    const server = net.createServer()
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Falha ao obter porta livre para o servidor temporário do webhook.')))
        return
      }

      server.close((error) => {
        if (error) {
          reject(error)
          return
        }
        resolve(address.port)
      })
    })
    server.on('error', reject)
  })
}

async function stopChildProcess(child: ReturnType<typeof spawn>) {
  if (!child || child.exitCode !== null) return

  if (process.platform === 'win32') {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, SERVER_STOP_TIMEOUT_MS)
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        cwd: process.cwd(),
        stdio: 'ignore',
        shell: true,
      })

      killer.once('exit', () => {
        clearTimeout(timer)
        resolve()
      })
      killer.once('error', () => {
        clearTimeout(timer)
        resolve()
      })
    })
    return
  }

  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      resolve()
    }, SERVER_STOP_TIMEOUT_MS)

    child.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })

    child.kill('SIGTERM')
  })
}

async function waitForHttpReady(baseURL: string, child: ReturnType<typeof spawn>, logs: string[]) {
  const loginUrl = new URL('/login', baseURL).toString()
  const deadline = Date.now() + SERVER_READY_TIMEOUT_MS

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `Servidor temporário do webhook encerrou prematuramente com código ${child.exitCode}.\n${logs.slice(-60).join('')}`,
      )
    }

    try {
      const response = await fetch(loginUrl, {
        redirect: 'manual',
        signal: AbortSignal.timeout(5_000),
      })
      if (response.status < 500) return
    } catch {}

    await sleep(1_000)
  }

  throw new Error(
    `Timeout aguardando readiness HTTP em ${loginUrl}.\n${logs.slice(-60).join('')}`,
  )
}

async function createWebhookTestServer(envOverrides: Record<string, string>) {
  loadEnvLocalIfNeeded()

  const port = await getFreePort()
  const baseURL = `http://localhost:${port}`
  const env = {
    ...process.env,
    BASE_URL: baseURL,
    FINANCIAL_PROVIDER: 'pagarme',
    PAGARME_ENVIRONMENT: 'sandbox',
    ...envOverrides,
  }
  const logs: string[] = []
  const child = spawn(npmCommand, ['run', 'dev', '--', '--hostname', 'localhost', '--port', String(port)], {
    cwd: process.cwd(),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  })

  child.stdout.on('data', (chunk) => logs.push(String(chunk)))
  child.stderr.on('data', (chunk) => logs.push(String(chunk)))

  await waitForHttpReady(baseURL, child, logs)

  return {
    baseURL,
    logs,
    stop: async () => {
      await stopChildProcess(child)
    },
  }
}

async function withWebhookTestServer(
  envOverrides: Record<string, string>,
  fn: (server: { baseURL: string }) => Promise<void>,
) {
  const server = await createWebhookTestServer(envOverrides)
  try {
    await fn({ baseURL: server.baseURL })
  } finally {
    await server.stop()
  }
}

async function postWebhook(
  baseURL: string,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  return fetch(new URL('/api/webhooks', baseURL), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  })
}

loadEnvLocalIfNeeded()

test.describe('Pagar.me webhook route', () => {
  test('retorna 503 quando o webhook Pagar.me está sem credenciais configuradas', async () => {
    await withWebhookTestServer(
      {
        FINANCIAL_PROVIDER: 'pagarme',
        PAGARME_ENVIRONMENT: 'sandbox',
        PAGARME_WEBHOOK_USERNAME: '',
        PAGARME_WEBHOOK_PASSWORD: '',
      },
      async ({ baseURL }) => {
        const response = await postWebhook(baseURL, {
          id: 'hook_missing_config',
          type: 'order.paid',
          data: {
            id: 'or_missing_config',
          },
        })

        expect(response.status).toBe(503)
        await expect(response.json()).resolves.toMatchObject({
          error: 'Webhook basic auth not configured',
          code: 'webhook_auth_not_configured',
        })
      },
    )
  })

  test.describe.serial('Pagar.me webhook com credenciais configuradas', () => {
    let server: { baseURL: string; stop: () => Promise<void> }
    let organizationId: string | null

    test.beforeAll(async () => {
      organizationId = await getAnyOrganizationId()
      server = await createWebhookTestServer({
        FINANCIAL_PROVIDER: 'pagarme',
        PAGARME_ENVIRONMENT: 'sandbox',
        PAGARME_WEBHOOK_USERNAME: WEBHOOK_USERNAME,
        PAGARME_WEBHOOK_PASSWORD: WEBHOOK_PASSWORD,
      })
    })

    test.afterAll(async () => {
      await server?.stop()
    })

    test('retorna 401 sem Authorization quando o webhook Pagar.me está configurado', async () => {
      const response = await postWebhook(server.baseURL, {
        id: 'hook_missing_auth',
        type: 'order.paid',
        data: {
          id: 'or_missing_auth',
        },
      })

      expect(response.status).toBe(401)
      expect(response.headers.get('www-authenticate')).toContain('Basic')
    })

    test('retorna 401 com Authorization inválido quando o webhook Pagar.me está configurado', async () => {
      const response = await postWebhook(
        server.baseURL,
        {
          id: 'hook_invalid_auth',
          type: 'order.paid',
          data: {
            id: 'or_invalid_auth',
          },
        },
        {
          authorization: 'Bearer token',
        },
      )

      expect(response.status).toBe(401)
      expect(response.headers.get('www-authenticate')).toContain('Basic')
    })

    test('aceita Authorization válido e retorna sucesso controlado', async () => {
      test.skip(!organizationId, 'Sem organization_id disponível no Supabase local para validar o webhook autenticado.')

      const webhookId = `hook_authorized_${Date.now()}`
      const response = await postWebhook(
        server.baseURL,
        {
          id: webhookId,
          type: 'provider.unknown',
          data: {
            id: `unknown_authorized_${Date.now()}`,
            metadata: {
              organization_id: organizationId,
            },
          },
        },
        {
          authorization: createBasicAuthorizationHeader({
            username: WEBHOOK_USERNAME,
            password: WEBHOOK_PASSWORD,
          }),
        },
      )

      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toMatchObject({
        ok: true,
        eventId: expect.any(String),
      })
    })
  })

  test('mantém o comportamento atual de assinatura para MyGateway', async () => {
    await withWebhookTestServer(
      {
        FINANCIAL_PROVIDER: 'mygateway',
        MYGATEWAY_WEBHOOK_SECRET: 'mygateway-webhook-secret',
        PAGARME_WEBHOOK_USERNAME: '',
        PAGARME_WEBHOOK_PASSWORD: '',
      },
      async ({ baseURL }) => {
        const response = await postWebhook(baseURL, {
          id: 'hook_mygateway_missing_signature',
          type: 'order.paid',
          data: {
            id: 'or_mygateway_missing_signature',
          },
        })

        expect(response.status).toBe(401)
        await expect(response.json()).resolves.toMatchObject({
          error: 'Missing signature',
        })
      },
    )
  })

  test('aceita Basic Auth valido, rejeita credenciais invalidas, atualiza banco e preserva idempotencia', async ({ request, baseURL }) => {
    test.skip(!baseURL, 'BASE_URL não configurado para o teste do endpoint.')
    test.skip(/^https:\/\/.+\.vercel\.app$/i.test(String(baseURL)), 'Este teste continua restrito ao harness local.')
    test.skip(
      process.env.FINANCIAL_PROVIDER !== 'pagarme' ||
        process.env.PAGARME_ENVIRONMENT !== 'sandbox' ||
        process.env.PAGARME_WEBHOOK_USERNAME !== WEBHOOK_USERNAME ||
        process.env.PAGARME_WEBHOOK_PASSWORD !== WEBHOOK_PASSWORD,
      'Este teste exige o harness local com FINANCIAL_PROVIDER=pagarme, PAGARME_ENVIRONMENT=sandbox e credenciais de webhook injetadas no servidor.',
    )

    const organizationId = await getAnyOrganizationId()
    test.skip(!organizationId, 'Sem organization_id disponível no Supabase local para validar idempotência do webhook.')

    const admin = getAdminClient()
    if (!admin) return
    const webhookId = `hook_test_${Date.now()}`
    const unknownWebhookId = `${webhookId}_unknown`
    const authorization = createBasicAuthorizationHeader({
      username: WEBHOOK_USERNAME,
      password: WEBHOOK_PASSWORD,
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

  test('sincroniza receiver e KYC quando recebe evento de recipient do provider', async ({ request, baseURL }) => {
    test.skip(!baseURL, 'BASE_URL não configurado para o teste do endpoint.')
    test.skip(/^https:\/\/.+\.vercel\.app$/i.test(String(baseURL)), 'Este teste continua restrito ao harness local.')
    test.skip(
      process.env.FINANCIAL_PROVIDER !== 'pagarme' ||
        process.env.PAGARME_ENVIRONMENT !== 'sandbox' ||
        process.env.PAGARME_WEBHOOK_USERNAME !== WEBHOOK_USERNAME ||
        process.env.PAGARME_WEBHOOK_PASSWORD !== WEBHOOK_PASSWORD,
      'Este teste exige o harness local com FINANCIAL_PROVIDER=pagarme, PAGARME_ENVIRONMENT=sandbox e credenciais de webhook injetadas no servidor.',
    )

    const organizationId = await getAnyOrganizationId()
    test.skip(!organizationId, 'Sem organization_id disponível no Supabase local para validar sincronização de receiver.')

    const admin = getAdminClient()
    test.skip(!admin, 'Sem Supabase admin disponível para preparar receiver e KYC.')
    if (!admin) return

    const receiverId = crypto.randomUUID()
    const kycRequestId = crypto.randomUUID()
    const providerRecipientId = `re_test_${Date.now()}`
    const webhookId = `hook_recipient_${Date.now()}`
    const authorization = createBasicAuthorizationHeader({
      username: WEBHOOK_USERNAME,
      password: WEBHOOK_PASSWORD,
    })

    try {
      const insertedReceiver = await admin
        .from('receivers')
        .insert({
          id: receiverId,
          organization_id: organizationId,
          provider: 'pagarme',
          provider_environment: 'sandbox',
          provider_receiver_id: null,
          provider_reference: null,
          name: 'Receiver Webhook Teste',
          document: '12345678000199',
          bank_account: {},
          type: 'pj',
          legal_name: 'Receiver Webhook Teste LTDA',
          email: 'receiver-webhook@teste.com',
          phone: '11999990000',
          address: {
            street: 'Rua Teste',
            number: '100',
            neighborhood: 'Centro',
            city: 'Sao Paulo',
            state: 'SP',
            zip: '01001000',
          },
          kyc_status: 'pending',
          status: 'active',
          provider_last_error: 'old_error',
        })
        .select('id')
        .single()
      expect(insertedReceiver.error).toBeNull()

      const insertedKyc = await admin
        .from('kyc_requests')
        .insert({
          id: kycRequestId,
          organization_id: organizationId,
          receiver_id: receiverId,
          status: 'under_review',
          provider_status: 'pending',
          provider_last_error: 'old_error',
          evidence: {},
          checklist: {},
        })
        .select('id')
        .single()
      expect(insertedKyc.error).toBeNull()

      const response = await request.post(`${baseURL}/api/webhooks`, {
        data: {
          id: webhookId,
          type: 'recipient.updated',
          data: {
            id: providerRecipientId,
            object: 'recipient',
            status: 'active',
            request_id: 'req_recipient_1',
            metadata: {
              organization_id: organizationId,
              internal_receiver_id: receiverId,
            },
            kyc_details: {
              status: 'approved',
              status_reason: 'ok',
            },
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

      const { data: receiver } = await admin
        .from('receivers')
        .select(
          'id, provider, provider_environment, provider_receiver_id, provider_reference, provider_status, external_status, provider_request_id, provider_synced_at, kyc_status, status, provider_last_error',
        )
        .eq('organization_id', organizationId)
        .eq('id', receiverId)
        .maybeSingle()

      expect(receiver?.provider).toBe('pagarme')
      expect(receiver?.provider_environment).toBe('sandbox')
      expect(receiver?.provider_receiver_id).toBe(providerRecipientId)
      expect(receiver?.provider_reference).toBe(providerRecipientId)
      expect(receiver?.provider_status).toBe('active:approved')
      expect(receiver?.external_status).toBe('active')
      expect(receiver?.provider_request_id).toBe('req_recipient_1')
      expect(receiver?.provider_synced_at).toBeTruthy()
      expect(receiver?.kyc_status).toBe('approved')
      expect(receiver?.status).toBe('active')
      expect(receiver?.provider_last_error).toBeNull()

      const { data: kycRequest } = await admin
        .from('kyc_requests')
        .select('id, provider_status, provider_last_error')
        .eq('organization_id', organizationId)
        .eq('id', kycRequestId)
        .maybeSingle()

      expect(kycRequest?.provider_status).toBe('active:approved')
      expect(kycRequest?.provider_last_error).toBeNull()

      const { data: eventRow } = await admin
        .from('webhook_events')
        .select('id, provider_event_id, status')
        .eq('id', json.eventId as string)
        .maybeSingle()
      expect(eventRow?.provider_event_id).toBe(webhookId)
      expect(eventRow?.status).toBe('processed')
    } finally {
      const { data: webhookRows } = await admin.from('webhook_events').select('id').eq('provider_event_id', webhookId).eq('organization_id', organizationId)
      const webhookIds = Array.isArray(webhookRows)
        ? webhookRows.map((row) => row.id).filter((value): value is string => typeof value === 'string')
        : []
      if (webhookIds.length > 0) {
        await admin.from('webhook_attempts').delete().in('webhook_event_id', webhookIds)
      }
      await admin.from('webhook_events').delete().eq('provider_event_id', webhookId).eq('organization_id', organizationId)
      await admin.from('kyc_requests').delete().eq('id', kycRequestId).eq('organization_id', organizationId)
      await admin.from('receivers').delete().eq('id', receiverId).eq('organization_id', organizationId)
    }
  })

  test('cria transação interna para order.paid correlacionado por order_code do payment link', async ({ request, baseURL }) => {
    test.skip(!baseURL, 'BASE_URL não configurado para o teste do endpoint.')
    test.skip(/^https:\/\/.+\.vercel\.app$/i.test(String(baseURL)), 'Este teste continua restrito ao harness local.')
    test.skip(
      process.env.FINANCIAL_PROVIDER !== 'pagarme' ||
        process.env.PAGARME_ENVIRONMENT !== 'sandbox' ||
        process.env.PAGARME_WEBHOOK_USERNAME !== WEBHOOK_USERNAME ||
        process.env.PAGARME_WEBHOOK_PASSWORD !== WEBHOOK_PASSWORD,
      'Este teste exige o harness local com FINANCIAL_PROVIDER=pagarme, PAGARME_ENVIRONMENT=sandbox e credenciais de webhook injetadas no servidor.',
    )

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
      username: WEBHOOK_USERNAME,
      password: WEBHOOK_PASSWORD,
    })

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
  })
})

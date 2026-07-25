import { expect, test } from '@playwright/test'

import { MyGatewayError, MygProvider } from '@/lib/acquirer/myg-provider'
import { isMyGatewayConfigured } from '@/lib/env'
import crypto from 'crypto'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

test.describe('MygProvider (MyGateway)', () => {
  test('authenticate() usa /authentication/v2/auth com x-api-key + authData', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const provider = new MygProvider({
      baseUrl: 'https://example.mygateway.test',
      xApiKey: 'x-api-key-123',
      authData: 'YmFzZTY0OnRlc3Q=',
      fetcher: async (input, init) => {
        calls.push({ url: String(input), init })
        if (String(input).endsWith('/authentication/v2/auth')) {
          return jsonResponse({ auth_token: 'token-abc', expires_in: new Date(Date.now() + 60_000).toISOString() })
        }
        return jsonResponse({ message: 'not found' }, 404)
      },
      timeoutMs: 5_000,
    })

    await provider.authenticate()

    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('https://example.mygateway.test/authentication/v2/auth')
    expect(calls[0].init?.method).toBe('POST')
    expect((calls[0].init?.headers as any)?.['x-api-key']).toBe('x-api-key-123')
    expect(String(calls[0].init?.body)).toContain('authData')
  })

  test('createPaymentLink() autentica e cria payment link em /payments/v1/paymentlink', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const provider = new MygProvider({
      baseUrl: 'https://example.mygateway.test',
      xApiKey: 'x-api-key-123',
      authData: 'YmFzZTY0OnRlc3Q=',
      fetcher: async (input, init) => {
        calls.push({ url: String(input), init })
        if (String(input).endsWith('/authentication/v2/auth')) {
          return jsonResponse({ auth_token: 'token-abc', expires_in: '3600' })
        }
        if (String(input).endsWith('/payments/v1/paymentlink')) {
          const body = JSON.parse(String(init?.body ?? '{}'))
          expect(body.value).toBe('12345')
          expect(body.title).toBe('Produto')
          expect(typeof body.validity).toBe('string')
          expect(body.minimumNumberOfInstallments).toBe(1)
          expect(body.maximumQuantityOfInstallments).toBe(18)
          expect(Array.isArray(body.acceptedPaymentsType)).toBe(true)
          return jsonResponse({ id: 'pl_123', link: 'https://pay.link/pl_123' })
        }
        return jsonResponse({ message: 'not found' }, 404)
      },
      timeoutMs: 5_000,
    })

    const link = await provider.createPaymentLink({
      name: 'Produto',
      description: 'Desc',
      amount: { amount: 12345, currency: 'BRL' },
      methods: { pix: true, card: true },
    })

    expect(link.id).toBe('pl_123')
    expect(link.url).toBe('https://pay.link/pl_123')
    expect(calls.map((c) => c.url)).toEqual([
      'https://example.mygateway.test/authentication/v2/auth',
      'https://example.mygateway.test/payments/v1/paymentlink',
    ])
    expect((calls[1].init?.headers as any)?.Authorization).toBe('token-abc')
    expect((calls[1].init?.headers as any)?.['x-api-key']).toBe('x-api-key-123')
  })

  test('getPaymentLink() consulta payment link por id em /payments/v1/paymentlink/{id}', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const provider = new MygProvider({
      baseUrl: 'https://example.mygateway.test',
      xApiKey: 'x-api-key-123',
      authData: 'YmFzZTY0OnRlc3Q=',
      fetcher: async (input, init) => {
        calls.push({ url: String(input), init })
        if (String(input).endsWith('/authentication/v2/auth')) {
          return jsonResponse({ auth_token: 'token-abc', expires_in: new Date(Date.now() + 60_000).toISOString() })
        }
        if (String(input).endsWith('/payments/v1/paymentlink/pl_123')) {
          return jsonResponse({ id: 'pl_123', link: 'https://pay.link/pl_123', status: 'active' })
        }
        return jsonResponse({ message: 'not found' }, 404)
      },
      timeoutMs: 5_000,
    })

    const link = await provider.getPaymentLink({ paymentLinkId: 'pl_123' })
    expect(link.id).toBe('pl_123')
    expect(link.status).toBe('active')
    expect(calls.map((c) => c.url)).toEqual([
      'https://example.mygateway.test/authentication/v2/auth',
      'https://example.mygateway.test/payments/v1/paymentlink/pl_123',
    ])
  })

  test('listPaymentLinks() lista payment links em /payments/v1/paymentlink', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const provider = new MygProvider({
      baseUrl: 'https://example.mygateway.test',
      xApiKey: 'x-api-key-123',
      authData: 'YmFzZTY0OnRlc3Q=',
      fetcher: async (input, init) => {
        calls.push({ url: String(input), init })
        if (String(input).endsWith('/authentication/v2/auth')) {
          return jsonResponse({ auth_token: 'token-abc', expires_in: '3600' })
        }
        if (String(input).endsWith('/payments/v1/paymentlink')) {
          return jsonResponse([{ id: 'pl_1', link: 'https://pay.link/pl_1', status: 'active' }])
        }
        return jsonResponse({ message: 'not found' }, 404)
      },
      timeoutMs: 5_000,
    })

    const list = await provider.listPaymentLinks({ limit: 10 })
    expect(list).toHaveLength(1)
    expect(list[0]?.id).toBe('pl_1')
    expect(list[0]?.url).toBe('https://pay.link/pl_1')
    expect(calls.map((c) => c.url)).toEqual([
      'https://example.mygateway.test/authentication/v2/auth',
      'https://example.mygateway.test/payments/v1/paymentlink',
    ])
  })

  test('tokenizeCard() usa /payments/v1/creditcard/generate/token com header configuravel (default Authorization)', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const provider = new MygProvider({
      baseUrl: 'https://example.mygateway.test',
      xApiKey: 'x-api-key-123',
      authData: 'YmFzZTY0OnRlc3Q=',
      fetcher: async (input, init) => {
        calls.push({ url: String(input), init })
        if (String(input).endsWith('/authentication/v2/auth')) {
          return jsonResponse({ auth_token: 'token-abc', expires_in: new Date(Date.now() + 60_000).toISOString() })
        }
        if (String(input).endsWith('/payments/v1/creditcard/generate/token')) {
          const body = JSON.parse(String(init?.body ?? '{}'))
          expect(body.cardNumber).toBe('4111111111111111')
          expect(body.transactionId).toBe('tx_1')
          return jsonResponse({ data: { numberToken: 'tok_123' } })
        }
        return jsonResponse({ message: 'not found' }, 404)
      },
      timeoutMs: 5_000,
    })

    const out = await provider.tokenizeCard({ cardNumber: '4111 1111 1111 1111', transactionId: 'tx_1' })
    expect(out.cardTokenRef).toBe('tok_123')
    expect(calls.map((c) => c.url)).toEqual([
      'https://example.mygateway.test/authentication/v2/auth',
      'https://example.mygateway.test/payments/v1/creditcard/generate/token',
    ])
    expect((calls[1].init?.headers as any)?.Authorization).toBe('token-abc')
  })

  test('getAuthToken() evita autenticações concorrentes e reaproveita token ate a margem', async () => {
    const originalNow = Date.now
    let now = 1_000_000_000_000
    ;(Date as any).now = () => now
    const calls: Array<{ url: string; init?: RequestInit }> = []

    try {
      const provider = new MygProvider({
        baseUrl: 'https://example.mygateway.test',
        xApiKey: 'x-api-key-123',
        authData: 'YmFzZTY0OnRlc3Q=',
        fetcher: async (input, init) => {
          calls.push({ url: String(input), init })
          if (String(input).endsWith('/authentication/v2/auth')) {
            return jsonResponse({ auth_token: `token_${calls.length}`, expires_in: '61' })
          }
          if (String(input).endsWith('/payments/v1/paymentlink')) {
            return jsonResponse({ id: crypto.randomUUID(), link: 'https://pay.link/x' })
          }
          return jsonResponse({ message: 'not found' }, 404)
        },
        timeoutMs: 5_000,
      })

      await Promise.all([
        provider.createPaymentLink({ name: 'Produto', description: 'Desc', amount: { amount: 1000, currency: 'BRL' }, methods: { pix: true } }),
        provider.createPaymentLink({ name: 'Produto', description: 'Desc', amount: { amount: 1000, currency: 'BRL' }, methods: { pix: true } }),
      ])

      expect(calls.filter((c) => c.url.endsWith('/authentication/v2/auth'))).toHaveLength(1)

      now += 2_000
      await provider.createPaymentLink({ name: 'Produto', description: 'Desc', amount: { amount: 1000, currency: 'BRL' }, methods: { pix: true } })
      expect(calls.filter((c) => c.url.endsWith('/authentication/v2/auth'))).toHaveLength(2)
    } finally {
      ;(Date as any).now = originalNow
    }
  })

  test('authenticate() propaga erro 401 como invalid_credentials', async () => {
    const provider = new MygProvider({
      baseUrl: 'https://example.mygateway.test',
      xApiKey: 'x-api-key-123',
      authData: 'YmFzZTY0OnRlc3Q=',
      fetcher: async (input) => {
        if (String(input).endsWith('/authentication/v2/auth')) return jsonResponse({ message: 'Unauthorized' }, 401)
        return jsonResponse({ message: 'not found' }, 404)
      },
    })

    await expect(provider.authenticate()).rejects.toMatchObject({ status: 401, code: 'invalid_credentials' } satisfies Partial<MyGatewayError>)
  })

  test('requestJson mapeia 429 como rate_limited', async () => {
    const provider = new MygProvider({
      baseUrl: 'https://example.mygateway.test',
      xApiKey: 'x-api-key-123',
      authData: 'YmFzZTY0OnRlc3Q=',
      fetcher: async (input) => {
        if (String(input).endsWith('/authentication/v2/auth')) return jsonResponse({ message: 'Too many' }, 429)
        return jsonResponse({ message: 'not found' }, 404)
      },
    })

    await expect(provider.authenticate()).rejects.toMatchObject({ status: 429, code: 'rate_limited' } satisfies Partial<MyGatewayError>)
  })

  test('createSubscription() usa /subscriptions/v1/create com split + metadata', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const provider = new MygProvider({
      baseUrl: 'https://example.mygateway.test',
      xApiKey: 'x-api-key-123',
      authData: 'YmFzZTY0OnRlc3Q=',
      fetcher: async (input, init) => {
        calls.push({ url: String(input), init })
        if (String(input).endsWith('/authentication/v2/auth')) {
          return jsonResponse({ auth_token: 'token-abc', expires_in: new Date(Date.now() + 60_000).toISOString() })
        }
        if (String(input).endsWith('/subscriptions/v1/create')) {
          const body = JSON.parse(String(init?.body ?? '{}'))
          expect(body.externalId).toBe('sub_local_1')
          expect(body.amount).toBe(1000)
          expect(body.split?.connektFeeAmount).toBe(10)
          expect(Array.isArray(body.split?.receivers)).toBe(true)
          return jsonResponse({ data: { subscriptionId: 'sub_prov_1', status: 'active', nextChargeAt: '2026-01-01T00:00:00Z' } })
        }
        return jsonResponse({ message: 'not found' }, 404)
      },
      timeoutMs: 5_000,
    })

    const out = await provider.createSubscription({
      externalId: 'sub_local_1',
      amountCents: 1000,
      cycle: 'monthly',
      trialDays: 0,
      receiverId: 'recv_1',
      payer: { name: 'Ana', email: 'ana@example.com', document: '123', phone: null },
      card: { tokenRef: 'tok_123', holderName: 'ANA', expMonth: '01', expYear: '30', cvv: '123' },
      split: { connektFeeAmount: 10, receivers: [{ receiverId: 'prov_recv_1', amount: 990 }] },
      metadata: { organization_id: 'org_1' },
    })

    expect(out.id).toBe('sub_prov_1')
    expect(out.status).toBe('active')
    expect(out.nextChargeAt).toBe('2026-01-01T00:00:00Z')
    expect((calls[1].init?.headers as any)?.Authorization).toBe('token-abc')
  })

  test('cancelSubscription() usa /subscriptions/v1/cancel', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const provider = new MygProvider({
      baseUrl: 'https://example.mygateway.test',
      xApiKey: 'x-api-key-123',
      authData: 'YmFzZTY0OnRlc3Q=',
      fetcher: async (input, init) => {
        calls.push({ url: String(input), init })
        if (String(input).endsWith('/authentication/v2/auth')) {
          return jsonResponse({ auth_token: 'token-abc', expires_in: new Date(Date.now() + 60_000).toISOString() })
        }
        if (String(input).endsWith('/subscriptions/v1/cancel')) {
          const body = JSON.parse(String(init?.body ?? '{}'))
          expect(body.subscriptionId).toBe('sub_prov_1')
          return jsonResponse({ ok: true })
        }
        return jsonResponse({ message: 'not found' }, 404)
      },
      timeoutMs: 5_000,
    })

    const out = await provider.cancelSubscription({ id: 'sub_prov_1', metadata: { organization_id: 'org_1' } })
    expect(out.ok).toBe(true)
  })

  test('anticipate() usa /anticipations/v1/request', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const provider = new MygProvider({
      baseUrl: 'https://example.mygateway.test',
      xApiKey: 'x-api-key-123',
      authData: 'YmFzZTY0OnRlc3Q=',
      fetcher: async (input, init) => {
        calls.push({ url: String(input), init })
        if (String(input).endsWith('/authentication/v2/auth')) {
          return jsonResponse({ auth_token: 'token-abc', expires_in: new Date(Date.now() + 60_000).toISOString() })
        }
        if (String(input).endsWith('/anticipations/v1/request')) {
          const body = JSON.parse(String(init?.body ?? '{}'))
          expect(body.externalId).toBe('ant_local_1')
          expect(body.amount).toBe(50000)
          expect(body.feeBps).toBe(400)
          return jsonResponse({ data: { anticipationId: 'ant_prov_1', status: 'requested' } })
        }
        return jsonResponse({ message: 'not found' }, 404)
      },
      timeoutMs: 5_000,
    })

    const out = await provider.anticipate({
      externalId: 'ant_local_1',
      amountCents: 50000,
      feeBps: 400,
      receiverId: 'recv_1',
      metadata: { organization_id: 'org_1' },
    })
    expect(out.id).toBe('ant_prov_1')
    expect(out.status).toBe('requested')
    expect(calls.map((c) => c.url)).toEqual([
      'https://example.mygateway.test/authentication/v2/auth',
      'https://example.mygateway.test/anticipations/v1/request',
    ])
  })

  test('cancelAnticipation() usa /anticipations/v1/cancel', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const provider = new MygProvider({
      baseUrl: 'https://example.mygateway.test',
      xApiKey: 'x-api-key-123',
      authData: 'YmFzZTY0OnRlc3Q=',
      fetcher: async (input, init) => {
        calls.push({ url: String(input), init })
        if (String(input).endsWith('/authentication/v2/auth')) {
          return jsonResponse({ auth_token: 'token-abc', expires_in: new Date(Date.now() + 60_000).toISOString() })
        }
        if (String(input).endsWith('/anticipations/v1/cancel')) {
          const body = JSON.parse(String(init?.body ?? '{}'))
          expect(body.anticipationId).toBe('ant_prov_1')
          return jsonResponse({ ok: true })
        }
        return jsonResponse({ message: 'not found' }, 404)
      },
      timeoutMs: 5_000,
    })

    const out = await provider.cancelAnticipation({ id: 'ant_prov_1', metadata: { organization_id: 'org_1' } })
    expect(out.ok).toBe(true)
  })

  test('getTransaction() usa /payments/v1/situation/{id} e normaliza status', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const provider = new MygProvider({
      baseUrl: 'https://example.mygateway.test',
      xApiKey: 'x-api-key-123',
      authData: 'YmFzZTY0OnRlc3Q=',
      fetcher: async (input, init) => {
        calls.push({ url: String(input), init })
        if (String(input).endsWith('/authentication/v2/auth')) {
          return jsonResponse({ auth_token: 'token-abc', expires_in: new Date(Date.now() + 60_000).toISOString() })
        }
        if (String(input).endsWith('/payments/v1/situation/pay_789')) {
          return jsonResponse({ situation: 'Paid', data: { value: 12345 } })
        }
        return jsonResponse({ message: 'not found' }, 404)
      },
      timeoutMs: 5_000,
    })

    const out = await provider.getTransaction({ id: 'pay_789' })
    expect(out.id).toBe('pay_789')
    expect(out.status).toBe('paid')
    expect(out.amountCents).toBe(12345)
    expect(calls.map((c) => c.url)).toEqual([
      'https://example.mygateway.test/authentication/v2/auth',
      'https://example.mygateway.test/payments/v1/situation/pay_789',
    ])
  })

  test('getTransaction() normaliza situations do provider para status internos', async () => {
    const cases = [
      { situation: 'Paid', expected: 'paid' },
      { situation: '99999', expected: 'paid' },
      { situation: 'PartialReversed', expected: 'refunded' },
      { situation: 'Cancelled', expected: 'canceled' },
      { situation: 'IN_PROGRESS', expected: 'processing' },
      { situation: 'waiting_payment', expected: 'pending' },
      { situation: 'Chargeback', expected: 'failed' },
      { situation: 'desconhecido', expected: 'pending' },
    ] as const

    for (const item of cases) {
      const provider = new MygProvider({
        baseUrl: 'https://example.mygateway.test',
        xApiKey: 'x-api-key-123',
        authData: 'YmFzZTY0OnRlc3Q=',
        fetcher: async (input) => {
          if (String(input).endsWith('/authentication/v2/auth')) {
            return jsonResponse({ auth_token: 'token-abc', expires_in: new Date(Date.now() + 60_000).toISOString() })
          }
          if (String(input).endsWith('/payments/v1/situation/pay_status')) {
            return jsonResponse({ situation: item.situation, data: { value: 100 } })
          }
          return jsonResponse({ message: 'not found' }, 404)
        },
        timeoutMs: 5_000,
      })

      const out = await provider.getTransaction({ id: 'pay_status' })
      expect(out.status, `situation ${item.situation}`).toBe(item.expected)
    }
  })

  test('listPayouts() sem endpoint disponível lança erro controlado', async () => {
    const provider = new MygProvider({
      baseUrl: 'https://example.mygateway.test',
      xApiKey: 'x-api-key-123',
      authData: 'YmFzZTY0OnRlc3Q=',
      fetcher: async (input) => {
        if (String(input).endsWith('/authentication/v2/auth')) {
          return jsonResponse({ auth_token: 'token-abc', expires_in: new Date(Date.now() + 60_000).toISOString() })
        }
        return jsonResponse({ message: 'not found' }, 404)
      },
      timeoutMs: 5_000,
    })

    await expect(provider.listPayouts({ periodStartIso: '2026-01-01T00:00:00Z', periodEndIso: '2026-01-31T23:59:59Z' })).rejects.toBeInstanceOf(MyGatewayError)
  })

  test('timeout gera MyGatewayError(code=timeout)', async () => {
    const provider = new MygProvider({
      baseUrl: 'https://example.mygateway.test',
      xApiKey: 'x-api-key-123',
      authData: 'YmFzZTY0OnRlc3Q=',
      fetcher: async (_input, init) =>
        await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('AbortError')))
        }),
      timeoutMs: 5,
    })

    await expect(provider.authenticate()).rejects.toMatchObject({ code: 'timeout' })
  })

  test('credenciais inválidas gera MyGatewayError(code=invalid_credentials)', async () => {
    const provider = new MygProvider({
      baseUrl: 'https://example.mygateway.test',
      xApiKey: 'x-api-key-123',
      authData: 'YmFzZTY0OnRlc3Q=',
      fetcher: async (input) => {
        if (String(input).endsWith('/authentication/v2/auth')) {
          return jsonResponse({ message: 'Unauthorized' }, 401)
        }
        return jsonResponse({ message: 'not found' }, 404)
      },
      timeoutMs: 5_000,
    })

    await expect(provider.authenticate()).rejects.toBeInstanceOf(MyGatewayError)
    await expect(provider.authenticate()).rejects.toMatchObject({ code: 'invalid_credentials' })
  })

  test('ausência de credenciais (env) faz isMyGatewayConfigured() retornar false', async () => {
    const prev = { ...process.env }
    try {
      delete process.env.MYGATEWAY_BASE_URL
      delete process.env.MYGATEWAY_X_API_KEY
      delete process.env.MYGATEWAY_API_KEY
      delete process.env.MYGATEWAY_AUTH_DATA
      delete process.env.MYGATEWAY_CLIENT_ID
      delete process.env.MYGATEWAY_CLIENT_SECRET

      expect(isMyGatewayConfigured()).toBe(false)
    } finally {
      process.env = prev
    }
  })
})

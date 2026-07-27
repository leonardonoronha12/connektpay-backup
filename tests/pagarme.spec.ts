import { expect, test } from '@playwright/test'

import { PagarMeProvider } from '@/lib/acquirer/pagarme-provider'
import {
  createPagarMePaymentLinkPayload,
  normalizePagarMePaymentLinkResponse,
  normalizePagarMePaymentLinkStatus,
  sanitizePagarMePaymentLinkResponse,
} from '@/lib/acquirer/pagarme-payment-links'
import { ProviderError, sanitizeProviderErrorDetails } from '@/lib/acquirer/provider-error'
import { getAcquirerProvider } from '@/lib/acquirer'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function textResponse(body: string, status = 200, contentType = 'text/plain') {
  return new Response(body, { status, headers: { 'content-type': contentType } })
}

test.describe('PagarMe payment link mapper', () => {
  test('mapeia amount/item/métodos/expiração para payload order', async () => {
    const payload = createPagarMePaymentLinkPayload({
      name: 'Link QA',
      description: 'Produto de teste',
      amount: { amount: 12345, currency: 'BRL' },
      methods: { pix: true, card: true },
      validity: '2026-12-01 15:30',
      numberOfAllowedSales: 2,
      metadata: { payment_link_id: '4e601410-64ac-4b3d-9321-496ae3efc658', slug: 'g76svv136o2qft' },
    })

    expect(payload.type).toBe('order')
    expect(payload.is_building).toBeFalsy()
    expect(payload.name).toBe('Link QA')
    expect(payload.order_code).toBe('4e601410-64ac-4b3d-9321-496ae3efc658')
    expect(payload.payment_settings.accepted_payment_methods).toEqual(['pix', 'credit_card'])
    expect(payload.payment_settings.pix_settings).toEqual({ expires_in: 60 })
    expect(payload.payment_settings.credit_card_settings).toEqual({
      operation_type: 'auth_and_capture',
      installments: [{ number: 1, total: 12345 }],
    })
    expect(payload.cart_settings.items).toEqual([
      {
        name: 'Link QA',
        description: 'Produto de teste',
        amount: 12345,
        default_quantity: 1,
      },
    ])
    expect(payload.expires_at).toBeTruthy()
    expect(payload.max_paid_sessions).toBe(2)
  })

  test('bloqueia payload sem método aceito', async () => {
    await expect(async () =>
      createPagarMePaymentLinkPayload({
        name: 'Sem método',
        amount: { amount: 1000, currency: 'BRL' },
        methods: { pix: false, card: false },
      }),
    ).rejects.toMatchObject({ code: 'bad_request', provider: 'pagarme' } satisfies Partial<ProviderError>)
  })

  test('bloqueia expiração inválida', async () => {
    await expect(async () =>
      createPagarMePaymentLinkPayload({
        name: 'Link inválido',
        amount: { amount: 1000, currency: 'BRL' },
        methods: { pix: true },
        validity: 'data-invalida',
      }),
    ).rejects.toMatchObject({ code: 'bad_request', provider: 'pagarme' } satisfies Partial<ProviderError>)
  })

  test('normaliza resposta e sanitiza payload', async () => {
    const response = normalizePagarMePaymentLinkResponse({
      id: 'pl_test_123',
      status: 'active',
      url: 'https://checkout.pagar.me/pl_test_123',
      name: 'Link QA',
      type: 'order',
      created_at: '2026-01-01T10:00:00Z',
      updated_at: '2026-01-01T10:10:00Z',
      authorization: 'Basic abc',
      secret_key: 'sk_test_123',
    })

    expect(response).toEqual({
      id: 'pl_test_123',
      status: 'active',
      url: 'https://checkout.pagar.me/pl_test_123',
      metadata: {
        raw: {
          id: 'pl_test_123',
          status: 'active',
          url: 'https://checkout.pagar.me/pl_test_123',
          name: 'Link QA',
          type: 'order',
          created_at: '2026-01-01T10:00:00Z',
          updated_at: '2026-01-01T10:10:00Z',
          expires_at: null,
        },
      },
    })
  })

  test('mapeia status externo para contrato interno neutro', async () => {
    expect(normalizePagarMePaymentLinkStatus('active')).toBe('active')
    expect(normalizePagarMePaymentLinkStatus('disabled')).toBe('inactive')
    expect(normalizePagarMePaymentLinkStatus('closed')).toBe('expired')
    expect(normalizePagarMePaymentLinkStatus(undefined)).toBe('pending')
  })

  test('sanitiza detalhes sensíveis', async () => {
    expect(
      sanitizeProviderErrorDetails({
        authorization: 'Basic secret',
        token: 'abc',
        cardNumber: '4111111111111111',
        nested: { api_key: 'key', status: 'bad_request' },
      }),
    ).toEqual({
      authorization: '[redacted]',
      token: '[redacted]',
      cardNumber: '[redacted]',
      nested: { api_key: '[redacted]', status: 'bad_request' },
    })
  })

  test('resposta inválida sem id gera unexpected_response', async () => {
    await expect(async () => normalizePagarMePaymentLinkResponse({ status: 'active' })).rejects.toMatchObject({
      code: 'unexpected_response',
      provider: 'pagarme',
    } satisfies Partial<ProviderError>)
  })

  test('sanitiza somente campos seguros da resposta do provider', async () => {
    expect(
      sanitizePagarMePaymentLinkResponse({
        id: 'pl_1',
        url: 'https://checkout.pagar.me/pl_1',
        authorization: 'Basic abc',
        secret_key: 'sk_test',
      }),
    ).toEqual({
      id: 'pl_1',
      status: null,
      url: 'https://checkout.pagar.me/pl_1',
      name: null,
      type: null,
      created_at: null,
      updated_at: null,
      expires_at: null,
    })
  })
})

test.describe('PagarMeProvider', () => {
  test('authenticate usa GET /paymentlinks sem expor segredo', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const provider = new PagarMeProvider({
      baseUrl: 'https://sdx-api.pagar.me/core/v5',
      secretKey: 'sk_test_123',
      fetcher: async (input, init) => {
        calls.push({ url: String(input), init })
        return jsonResponse({ data: [] })
      },
    })

    const result = await provider.authenticate()

    expect(result.ok).toBe(true)
    expect(result.environment).toBe('sandbox')
    expect(calls[0]?.url).toBe('https://sdx-api.pagar.me/core/v5/paymentlinks?page=1&size=1')
    expect((calls[0]?.init?.headers as Record<string, string>)?.authorization).toMatch(/^Basic /)
  })

  test('createPaymentLink envia payload order e normaliza resposta', async () => {
    const provider = new PagarMeProvider({
      baseUrl: 'https://sdx-api.pagar.me/core/v5',
      secretKey: 'sk_test_123',
      fetcher: async (input, init) => {
        expect(String(input)).toBe('https://sdx-api.pagar.me/core/v5/paymentlinks')
        expect(init?.method).toBe('POST')
        expect((init?.headers as Record<string, string>)?.['user-agent']).toBe('connektpay/1.0')
        const body = JSON.parse(String(init?.body ?? '{}'))
        expect(body.type).toBe('order')
        expect(body.is_building).toBe(false)
        expect(body.order_code).toBe('4e601410-64ac-4b3d-9321-496ae3efc658')
        expect(body.cart_settings.items[0]?.amount).toBe(50025)
        expect(body.payment_settings.pix_settings).toEqual({ expires_in: 60 })
        expect(body.payment_settings.credit_card_settings).toEqual({
          operation_type: 'auth_and_capture',
          installments: [{ number: 1, total: 50025 }],
        })
        return jsonResponse({
          id: 'plink_123',
          status: 'active',
          url: 'https://checkout.pagar.me/plink_123',
          created_at: '2026-07-22T10:00:00Z',
          updated_at: '2026-07-22T10:00:00Z',
        }, 201)
      },
    })

    const link = await provider.createPaymentLink({
      name: 'Venda de Produto X',
      description: 'Descrição detalhada do produto',
      amount: { amount: 50025, currency: 'BRL' },
      methods: { pix: true, card: true },
      validity: '2026-08-01 10:30',
      numberOfAllowedSales: 1,
      metadata: { payment_link_id: '4e601410-64ac-4b3d-9321-496ae3efc658' },
    })

    expect(link.id).toBe('plink_123')
    expect(link.status).toBe('active')
    expect(link.url).toBe('https://checkout.pagar.me/plink_123')
  })

  test('getPaymentLink consulta por id', async () => {
    const provider = new PagarMeProvider({
      baseUrl: 'https://sdx-api.pagar.me/core/v5',
      secretKey: 'sk_test_123',
      fetcher: async (input) => {
        expect(String(input)).toBe('https://sdx-api.pagar.me/core/v5/paymentlinks/plink_123')
        return jsonResponse({ id: 'plink_123', status: 'active', url: 'https://checkout.pagar.me/plink_123' })
      },
    })

    const link = await provider.getPaymentLink({ paymentLinkId: 'plink_123' })
    expect(link.id).toBe('plink_123')
    expect(link.status).toBe('active')
  })

  test('listPaymentLinks aceita resposta array', async () => {
    const provider = new PagarMeProvider({
      baseUrl: 'https://sdx-api.pagar.me/core/v5',
      secretKey: 'sk_test_123',
      fetcher: async (input) => {
        expect(String(input)).toBe('https://sdx-api.pagar.me/core/v5/paymentlinks?page=1&size=10')
        return jsonResponse([{ id: 'plink_1', status: 'active', url: 'https://checkout.pagar.me/plink_1' }])
      },
    })

    const list = await provider.listPaymentLinks({ limit: 10 })
    expect(list).toHaveLength(1)
    expect(list[0]?.id).toBe('plink_1')
  })

  test('listPaymentLinks aceita resposta com data[]', async () => {
    const provider = new PagarMeProvider({
      baseUrl: 'https://sdx-api.pagar.me/core/v5',
      secretKey: 'sk_test_123',
      fetcher: async () => jsonResponse({ data: [{ id: 'plink_2', status: 'disabled', url: 'https://checkout.pagar.me/plink_2' }] }),
    })

    const list = await provider.listPaymentLinks()
    expect(list).toHaveLength(1)
    expect(list[0]?.status).toBe('inactive')
  })

  test('401 vira invalid_credentials', async () => {
    const provider = new PagarMeProvider({
      baseUrl: 'https://sdx-api.pagar.me/core/v5',
      secretKey: 'sk_test_123',
      fetcher: async () => jsonResponse({ message: 'Unauthorized' }, 401),
    })

    await expect(provider.authenticate()).rejects.toMatchObject({ code: 'invalid_credentials', status: 401 } satisfies Partial<ProviderError>)
  })

  test('422 vira unprocessable', async () => {
    const provider = new PagarMeProvider({
      baseUrl: 'https://sdx-api.pagar.me/core/v5',
      secretKey: 'sk_test_123',
      fetcher: async () => jsonResponse({ message: 'Invalid payload' }, 422),
    })

    await expect(
      provider.createPaymentLink({
        name: 'Produto',
        amount: { amount: 1000, currency: 'BRL' },
        methods: { pix: true },
      }),
    ).rejects.toMatchObject({ code: 'unprocessable', status: 422 } satisfies Partial<ProviderError>)
  })

  test('429 vira rate_limited', async () => {
    const provider = new PagarMeProvider({
      baseUrl: 'https://sdx-api.pagar.me/core/v5',
      secretKey: 'sk_test_123',
      fetcher: async () => jsonResponse({ message: 'Too many requests' }, 429),
    })

    await expect(provider.authenticate()).rejects.toMatchObject({ code: 'rate_limited', status: 429 } satisfies Partial<ProviderError>)
  })

  test('500 vira unavailable', async () => {
    const provider = new PagarMeProvider({
      baseUrl: 'https://sdx-api.pagar.me/core/v5',
      secretKey: 'sk_test_123',
      fetcher: async () => jsonResponse({ message: 'Server error' }, 500),
    })

    await expect(provider.authenticate()).rejects.toMatchObject({ code: 'unavailable', status: 500 } satisfies Partial<ProviderError>)
  })

  test('timeout vira timeout', async () => {
    const provider = new PagarMeProvider({
      baseUrl: 'https://sdx-api.pagar.me/core/v5',
      secretKey: 'sk_test_123',
      fetcher: async (_input, init) => {
        const signal = init?.signal as AbortSignal
        await new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('AbortError')))
        })
        return jsonResponse({})
      },
      timeoutMs: 5,
    })

    await expect(provider.authenticate()).rejects.toMatchObject({ code: 'timeout', status: 504 } satisfies Partial<ProviderError>)
  })

  test('resposta não JSON vira unexpected_response', async () => {
    const provider = new PagarMeProvider({
      baseUrl: 'https://sdx-api.pagar.me/core/v5',
      secretKey: 'sk_test_123',
      fetcher: async () => textResponse('<html>oops</html>', 200, 'text/html'),
    })

    await expect(provider.authenticate()).rejects.toMatchObject({ code: 'unexpected_response', status: 502 } satisfies Partial<ProviderError>)
  })

  test('createPayment cria order Pix direta com metadata segura, split flat e normaliza resposta', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const provider = new PagarMeProvider({
      baseUrl: 'https://sdx-api.pagar.me/core/v5',
      secretKey: 'sk_test_123',
      fetcher: async (input, init) => {
        calls.push({ url: String(input), init })
        expect(String(input)).toBe('https://sdx-api.pagar.me/core/v5/orders')
        expect(init?.method).toBe('POST')
        const headers = init?.headers as Record<string, string>
        expect(headers.authorization).toMatch(/^Basic /)
        expect(headers['Idempotency-Key']).toBe('idem_123')
        const body = JSON.parse(String(init?.body ?? '{}'))
        expect(body.metadata).toMatchObject({
          organization_id: 'org_123',
          internal_transaction_id: 'tx_123',
          internal_payment_link_id: 'plink_123',
          idempotency_key: 'idem_123',
        })
        expect(body.customer).toEqual({
          name: 'Tony Stark',
          email: 'tony@stark.com',
          type: 'individual',
          document: '12345678909',
          phones: {
            mobile_phone: {
              country_code: '55',
              area_code: '11',
              number: '999990000',
            },
          },
        })
        expect(body.payments[0]).toMatchObject({
          payment_method: 'pix',
          pix: { expires_in: 900 },
          split: [
            {
              type: 'flat',
              amount: 8000,
              recipient_id: 'rp_primary',
            },
          ],
        })
        return jsonResponse({
          id: 'or_test_123',
          amount: 10000,
          currency: 'BRL',
          status: 'pending',
          created_at: '2026-07-25T20:00:00Z',
          metadata: {
            internal_transaction_id: 'tx_123',
          },
          charges: [
            {
              id: 'ch_test_123',
              amount: 10000,
              currency: 'BRL',
              status: 'pending',
              payment_method: 'pix',
              created_at: '2026-07-25T20:00:01Z',
              last_transaction: {
                id: 'tran_test_123',
                status: 'waiting_payment',
                qr_code: '000201pix',
                qr_code_url: 'https://api.pagar.me/core/v1/transactions/tran_test_123/qrcode.png',
                expires_at: '2026-07-25T20:15:00Z',
                created_at: '2026-07-25T20:00:01Z',
              },
            },
          ],
        }, 201)
      },
    })

    const payment = await provider.createPayment({
      amount: { amount: 10000, currency: 'BRL' },
      method: 'pix',
      description: 'Pedido Connekt Pay',
      customer: {
        name: 'Tony Stark',
        email: 'tony@stark.com',
        document: '123.456.789-09',
        phone: '(11) 99999-0000',
      },
      metadata: {
        organization_id: 'org_123',
        internal_transaction_id: 'tx_123',
        internal_payment_link_id: 'plink_123',
        idempotency_key: 'idem_123',
      },
      split: [{ receiverId: 'rp_primary', amount: 8000 }],
    })

    expect(calls).toHaveLength(1)
    expect(payment).toEqual({
      id: 'tran_test_123',
      status: 'pending',
      providerPaymentId: 'tran_test_123',
      providerReference: 'tran_test_123',
      providerOrderId: 'or_test_123',
      providerChargeId: 'ch_test_123',
      amount: 10000,
      currency: 'BRL',
      createdAt: '2026-07-25T20:00:01Z',
      pix: {
        qrCode: '000201pix',
        qrCodeUrl: 'https://api.pagar.me/core/v1/transactions/tran_test_123/qrcode.png',
        copyPaste: '000201pix',
        expiresAt: '2026-07-25T20:15:00Z',
      },
      raw: {
        id: 'or_test_123',
        status: 'pending',
        amount: 10000,
        currency: 'BRL',
        created_at: '2026-07-25T20:00:01Z',
        charges: [
          {
            id: 'ch_test_123',
            status: 'pending',
            amount: 10000,
            currency: 'BRL',
            payment_method: 'pix',
            last_transaction: {
              id: 'tran_test_123',
              status: 'waiting_payment',
              qr_code: '000201pix',
              qr_code_url: 'https://api.pagar.me/core/v1/transactions/tran_test_123/qrcode.png',
              expires_at: '2026-07-25T20:15:00Z',
              created_at: '2026-07-25T20:00:01Z',
            },
          },
        ],
        metadata: {
          internal_transaction_id: 'tx_123',
        },
      },
    })
  })

  test('createPayment rejeita Pix sem telefone exigido pelo provider', async () => {
    const provider = new PagarMeProvider({
      baseUrl: 'https://sdx-api.pagar.me/core/v5',
      secretKey: 'sk_test_123',
      fetcher: async () => jsonResponse({}),
    })

    await expect(
      provider.createPayment({
        amount: { amount: 1000, currency: 'BRL' },
        method: 'pix',
        customer: {
          name: 'Cliente',
          email: 'cliente@connektpay.com',
          document: '12345678909',
        },
      }),
    ).rejects.toMatchObject({ code: 'bad_request', status: 400 } satisfies Partial<ProviderError>)
  })

  test('createPayment cria order de cartão com card_token e status autorizado', async () => {
    const provider = new PagarMeProvider({
      baseUrl: 'https://sdx-api.pagar.me/core/v5',
      secretKey: 'sk_test_123',
      fetcher: async (input, init) => {
        expect(String(input)).toBe('https://sdx-api.pagar.me/core/v5/orders')
        expect(init?.method).toBe('POST')
        const headers = init?.headers as Record<string, string>
        expect(headers['Idempotency-Key']).toBe('idem_card_123')
        const body = JSON.parse(String(init?.body ?? '{}'))
        expect(body.code).toBe('tx_card_123')
        expect(body.closed).toBe(true)
        expect(body.customer).toMatchObject({
          name: 'Tony Stark',
          email: 'tony@stark.com',
          type: 'individual',
          document: '12345678909',
          phones: {
            mobile_phone: {
              country_code: '55',
              area_code: '11',
              number: '999990000',
            },
          },
        })
        expect(body.metadata).toMatchObject({
          organization_id: 'org_123',
          internal_transaction_id: 'tx_card_123',
          internal_payment_link_id: 'plink_123',
          idempotency_key: 'idem_card_123',
        })
        expect(body.payments[0]).toEqual({
          payment_method: 'credit_card',
          credit_card: {
            operation_type: 'auth_and_capture',
            installments: 3,
            card_token: 'card_tok_123',
            statement_descriptor: 'CONNEKTPAY',
          },
          split: [
            {
              type: 'flat',
              amount: 7000,
              recipient_id: 'rp_primary',
            },
          ],
        })
        return jsonResponse(
          {
            id: 'or_card_123',
            amount: 10000,
            currency: 'BRL',
            status: 'processing',
            created_at: '2026-07-25T20:00:00Z',
            metadata: {
              internal_transaction_id: 'tx_card_123',
            },
            charges: [
              {
                id: 'ch_card_123',
                amount: 10000,
                currency: 'BRL',
                status: 'authorized',
                payment_method: 'credit_card',
                created_at: '2026-07-25T20:00:01Z',
                last_transaction: {
                  id: 'tran_card_123',
                  status: 'authorized',
                  created_at: '2026-07-25T20:00:01Z',
                },
              },
            ],
          },
          201,
        )
      },
    })

    const payment = await provider.createPayment({
      amount: { amount: 10000, currency: 'BRL' },
      method: 'card',
      description: 'Pedido Connekt Pay',
      customer: {
        name: 'Tony Stark',
        email: 'tony@stark.com',
        document: '123.456.789-09',
        phone: '(11) 99999-0000',
      },
      metadata: {
        organization_id: 'org_123',
        internal_transaction_id: 'tx_card_123',
        internal_payment_link_id: 'plink_123',
        idempotency_key: 'idem_card_123',
        statement_descriptor: 'CONNEKTPAY',
      },
      installments: 3,
      card: {
        holderName: 'TONY STARK',
        token: 'card_tok_123',
        brand: 'Visa',
        last4: '0010',
      },
      split: [{ receiverId: 'rp_primary', amount: 7000 }],
    })

    expect(payment).toEqual({
      id: 'tran_card_123',
      status: 'authorized',
      providerPaymentId: 'tran_card_123',
      providerReference: 'tran_card_123',
      providerOrderId: 'or_card_123',
      providerChargeId: 'ch_card_123',
      amount: 10000,
      currency: 'BRL',
      createdAt: '2026-07-25T20:00:01Z',
      raw: {
        id: 'or_card_123',
        status: 'processing',
        amount: 10000,
        currency: 'BRL',
        created_at: '2026-07-25T20:00:01Z',
        charges: [
          {
            id: 'ch_card_123',
            status: 'authorized',
            amount: 10000,
            currency: 'BRL',
            payment_method: 'credit_card',
            last_transaction: {
              id: 'tran_card_123',
              status: 'authorized',
              qr_code: null,
              qr_code_url: null,
              expires_at: null,
              created_at: '2026-07-25T20:00:01Z',
            },
          },
        ],
        metadata: {
          internal_transaction_id: 'tx_card_123',
        },
      },
    })
  })

  test('createPayment rejeita cartão sem card_token', async () => {
    const provider = new PagarMeProvider({
      baseUrl: 'https://sdx-api.pagar.me/core/v5',
      secretKey: 'sk_test_123',
      fetcher: async () => jsonResponse({}),
    })

    await expect(
      provider.createPayment({
        amount: { amount: 1000, currency: 'BRL' },
        method: 'card',
        customer: {
          name: 'Cliente',
          email: 'cliente@connektpay.com',
          document: '12345678909',
        },
      }),
    ).rejects.toMatchObject({ code: 'bad_request', status: 400 } satisfies Partial<ProviderError>)
  })

  test('createPayment cria cobrança recorrente com customer_id, card_id e payment_origin', async () => {
    const provider = new PagarMeProvider({
      baseUrl: 'https://sdx-api.pagar.me/core/v5',
      secretKey: 'sk_test_123',
      fetcher: async (input, init) => {
        expect(String(input)).toBe('https://sdx-api.pagar.me/core/v5/orders')
        const headers = init?.headers as Record<string, string>
        expect(headers['Idempotency-Key']).toBe('idem_sub_123')
        const body = JSON.parse(String(init?.body ?? '{}'))
        expect(body.customer_id).toBe('cus_123')
        expect(body.metadata).toMatchObject({
          organization_id: 'org_123',
          internal_transaction_id: 'tx_sub_123',
          idempotency_key: 'idem_sub_123',
          assinatura_id: 'sub_123',
        })
        expect(body.payments[0]).toEqual({
          payment_method: 'credit_card',
          credit_card: {
            operation_type: 'auth_and_capture',
            installments: 1,
            card_id: 'card_123',
            recurrence_cycle: 'subsequent',
            payment_origin: {
              charge_id: 'ch_first_123',
            },
          },
          split: [
            {
              type: 'flat',
              amount: 7000,
              recipient_id: 'rp_primary',
            },
          ],
        })
        return jsonResponse(
          {
            id: 'or_sub_123',
            amount: 10000,
            currency: 'BRL',
            status: 'processing',
            metadata: {
              assinatura_id: 'sub_123',
            },
            charges: [
              {
                id: 'ch_sub_123',
                amount: 10000,
                currency: 'BRL',
                status: 'authorized',
                payment_method: 'credit_card',
                created_at: '2026-07-25T20:00:01Z',
                last_transaction: {
                  id: 'tran_sub_123',
                  status: 'authorized',
                  created_at: '2026-07-25T20:00:01Z',
                },
              },
            ],
          },
          201,
        )
      },
    })

    const payment = await provider.createPayment({
      amount: { amount: 10000, currency: 'BRL' },
      method: 'card',
      description: 'Recorrência Connekt Pay',
      customerId: 'cus_123',
      metadata: {
        organization_id: 'org_123',
        internal_transaction_id: 'tx_sub_123',
        idempotency_key: 'idem_sub_123',
        assinatura_id: 'sub_123',
      },
      installments: 1,
      card: {
        cardId: 'card_123',
        recurrenceCycle: 'subsequent',
        paymentOriginChargeId: 'ch_first_123',
      },
      split: [{ receiverId: 'rp_primary', amount: 7000 }],
    })

    expect(payment.providerOrderId).toBe('or_sub_123')
    expect(payment.providerChargeId).toBe('ch_sub_123')
    expect(payment.providerReference).toBe('tran_sub_123')
    expect(payment.status).toBe('authorized')
  })
})

test.describe('provider registry', () => {
  test('seleciona Pagar.me quando FINANCIAL_PROVIDER=pagarme', async () => {
    const previousProvider = process.env.FINANCIAL_PROVIDER
    const previousBase = process.env.PAGARME_BASE_URL
    const previousSecret = process.env.PAGARME_SECRET_KEY

    try {
      process.env.FINANCIAL_PROVIDER = 'pagarme'
      process.env.PAGARME_BASE_URL = 'https://sdx-api.pagar.me/core/v5'
      process.env.PAGARME_SECRET_KEY = 'sk_test_123'

      const provider = getAcquirerProvider()
      expect(provider).toBeInstanceOf(PagarMeProvider)
    } finally {
      process.env.FINANCIAL_PROVIDER = previousProvider
      process.env.PAGARME_BASE_URL = previousBase
      process.env.PAGARME_SECRET_KEY = previousSecret
    }
  })

  test('provider desconhecido gera erro explícito', async () => {
    await expect(async () => getAcquirerProvider('desconhecido')).rejects.toMatchObject({
      code: 'invalid_config',
      message: 'Unknown financial provider: desconhecido',
    } satisfies Partial<ProviderError>)
  })
})

import { expect, test } from '@playwright/test'

import { createSplitPayloadForMyGateway } from '@/lib/split-core'
import { ReceiverSyncService, buildReceiverProviderIdempotencyKey, normalizeReceiverProviderState } from '@/lib/receiver-sync-core'

type TableName = 'receivers' | 'kyc_requests'

type MockDatabase = {
  receivers: any[]
  kyc_requests: any[]
}

function createMockSupabase(seed?: Partial<MockDatabase>) {
  const db: MockDatabase = {
    receivers: seed?.receivers ? [...seed.receivers] : [],
    kyc_requests: seed?.kyc_requests ? [...seed.kyc_requests] : [],
  }

  class QueryBuilder {
    private action: 'select' | 'update' = 'select'
    private filters: Array<(row: any) => boolean> = []
    private patch: Record<string, unknown> | null = null
    private singleMode = false

    constructor(private readonly table: TableName) {}

    select() {
      return this
    }

    update(patch: Record<string, unknown>) {
      this.action = 'update'
      this.patch = patch
      return this
    }

    eq(column: string, value: unknown) {
      this.filters.push((row) => row[column] === value)
      return this
    }

    in(column: string, values: unknown[]) {
      this.filters.push((row) => values.includes(row[column]))
      return this
    }

    maybeSingle() {
      this.singleMode = true
      return this
    }

    limit() {
      return this
    }

    or(expression: string) {
      const branches = expression
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map<(row: any) => boolean>((entry) => {
          const eqMatch = /^([a-z_]+)\.eq\.(.+)$/i.exec(entry)
          if (eqMatch) {
            const [, column, rawValue] = eqMatch
            return (row) => String(row[column] ?? '') === rawValue
          }
          return () => false
        })
      this.filters.push((row) => branches.some((branch) => branch(row)))
      return this
    }

    then(resolve: (value: any) => any, reject?: (reason: any) => any) {
      return Promise.resolve(this.execute()).then(resolve, reject)
    }

    private execute() {
      const rows = db[this.table].filter((row) => this.filters.every((filter) => filter(row)))
      if (this.action === 'update') {
        for (const row of rows) Object.assign(row, this.patch ?? {})
      }
      if (this.singleMode) return { data: rows[0] ?? null, error: null }
      return { data: rows, error: null }
    }
  }

  return {
    db,
    from(table: TableName) {
      return new QueryBuilder(table)
    },
  }
}

function buildReceiver(overrides?: Record<string, unknown>) {
  return {
    id: 'recv_1',
    organization_id: 'org_1',
    type: 'pj',
    name: 'Empresa Teste',
    legal_name: 'Empresa Teste LTDA',
    trade_name: 'Empresa Teste',
    birth_date: null,
    legal_responsible_name: 'Maria Silva',
    legal_responsible_document: '12345678901',
    document: '12345678000199',
    email: 'financeiro@empresa.com',
    phone: '11999990000',
    address: {
      zip: '01001000',
      street: 'Rua A',
      number: '100',
      complement: 'Sala 1',
      city: 'Sao Paulo',
      state: 'SP',
      neighborhood: 'Centro',
    },
    bank_account: {
      bank_code: '341',
      agency: '1234',
      account: '123456',
      account_digit: '7',
      account_type: 'checking',
    },
    status: 'active',
    kyc_status: 'pending',
    provider: 'pagarme',
    provider_environment: 'sandbox',
    provider_receiver_id: null,
    provider_reference: null,
    provider_status: null,
    external_status: null,
    provider_request_id: null,
    ...overrides,
  }
}

test.describe('ReceiverSyncService', () => {
  test('cria receiver automaticamente com idempotência e persiste vínculo externo', async () => {
    const supabase = createMockSupabase({
      receivers: [buildReceiver()],
      kyc_requests: [],
    })

    const providerCalls: any[] = []
    const service = new ReceiverSyncService({
      webhookUrl: 'https://connektpay.test/api/webhooks',
      providerFactory: () =>
        ({
          authenticate: async () => ({ ok: true }),
          createPaymentLink: async () => {
            throw new Error('not used')
          },
          listPaymentLinks: async () => [],
          getPaymentLink: async () => {
            throw new Error('not used')
          },
          getPaymentLinkCharges: async () => [],
          createPayment: async () => {
            throw new Error('not used')
          },
          tokenizeCard: async () => {
            throw new Error('not used')
          },
          createSubscription: async () => {
            throw new Error('not used')
          },
          cancelSubscription: async () => {
            throw new Error('not used')
          },
          anticipate: async () => {
            throw new Error('not used')
          },
          listTransactions: async () => {
            throw new Error('not used')
          },
          getTransaction: async () => {
            throw new Error('not used')
          },
          listPayouts: async () => {
            throw new Error('not used')
          },
          getPayout: async () => {
            throw new Error('not used')
          },
          listAnticipations: async () => {
            throw new Error('not used')
          },
          getAnticipation: async () => {
            throw new Error('not used')
          },
          cancelAnticipation: async () => {
            throw new Error('not used')
          },
          createPayout: async () => ({ id: 'po_1', status: 'pending' }),
          createRecipient: async (input: any) => {
            providerCalls.push(input)
            return {
              id: 're_test_1',
              status: 'active',
              requestId: 'req_1',
              raw: {
                id: 're_test_1',
                status: 'active',
                kyc_details: { status: 'approved', status_reason: 'ok' },
                request_id: 'req_1',
              },
            }
          },
        }) as any,
    })

    const first = await service.synchronizeReceiver({
      supabase,
      organizationId: 'org_1',
      receiverId: 'recv_1',
      provider: 'pagarme',
      providerEnvironment: 'sandbox',
    })
    const second = await service.synchronizeReceiver({
      supabase,
      organizationId: 'org_1',
      receiverId: 'recv_1',
      provider: 'pagarme',
      providerEnvironment: 'sandbox',
    })

    expect(providerCalls).toHaveLength(1)
    expect(providerCalls[0].idempotencyKey).toBe(
      buildReceiverProviderIdempotencyKey({
        provider: 'pagarme',
        providerEnvironment: 'sandbox',
        organizationId: 'org_1',
        receiverId: 'recv_1',
      }),
    )
    expect(first.receiver?.provider_receiver_id).toBe('re_test_1')
    expect(first.receiver?.provider_reference).toBe('re_test_1')
    expect(first.receiver?.kyc_status).toBe('approved')
    expect(first.receiver?.status).toBe('active')
    expect(second.receiver?.provider_receiver_id).toBe('re_test_1')
  })

  test('não tenta criar receiver com perfil incompleto e mantém retry posterior possível', async () => {
    const supabase = createMockSupabase({
      receivers: [
        buildReceiver({
          email: null,
          bank_account: {},
        }),
      ],
      kyc_requests: [],
    })

    let createCalls = 0
    const service = new ReceiverSyncService({
      webhookUrl: 'https://connektpay.test/api/webhooks',
      providerFactory: () =>
        ({
          authenticate: async () => ({ ok: true }),
          createRecipient: async () => {
            createCalls += 1
            return { id: 're_test_1', status: 'registration' }
          },
        }) as any,
    })

    const result = await service.synchronizeReceiver({
      supabase,
      organizationId: 'org_1',
      receiverId: 'recv_1',
      provider: 'pagarme',
      providerEnvironment: 'sandbox',
    })

    expect(createCalls).toBe(0)
    expect(result.warning?.code).toBe('receiver_profile_incomplete')
    expect(result.receiver?.provider_receiver_id).toBeNull()
  })

  test('normaliza estados do provider para status operacional e KYC locais', async () => {
    const state = normalizeReceiverProviderState({
      id: 're_test_1',
      status: 'affiliation',
      kyc_details: {
        status: 'partially_denied',
        status_reason: 'additional_documents_required',
      },
      request_id: 'req_2',
    })

    expect(state.providerReceiverId).toBe('re_test_1')
    expect(state.externalStatus).toBe('affiliation')
    expect(state.kycStatus).toBe('blocked')
    expect(state.operationalStatus).toBe('active')
    expect(state.requestId).toBe('req_2')
  })

  test('split permanece bloqueado antes da aprovação e libera após receiver apto', async () => {
    expect(() =>
      createSplitPayloadForMyGateway({
        split: {
          grossAmount: 10000n,
          connektFeeAmount: 0n,
          receiverTotalAmount: 10000n,
          receivers: [{ receiverId: 'recv_1', ruleId: 'rule_1', priority: 100, amount: 10000n, percentageBps: 10000 }],
        },
        providerId: 'pagarme',
        providerEnvironment: 'sandbox',
        receivers: [
          {
            id: 'recv_1',
            provider: 'pagarme',
            providerEnvironment: 'sandbox',
            providerReference: null,
            status: 'active',
            kycStatus: 'pending',
          },
        ],
      }),
    ).toThrow(/KYC|provider reference/i)

    const payload = createSplitPayloadForMyGateway({
      split: {
        grossAmount: 10000n,
        connektFeeAmount: 0n,
        receiverTotalAmount: 10000n,
        receivers: [{ receiverId: 'recv_1', ruleId: 'rule_1', priority: 100, amount: 10000n, percentageBps: 10000 }],
      },
      providerId: 'pagarme',
      providerEnvironment: 'sandbox',
      receivers: [
        {
          id: 'recv_1',
          provider: 'pagarme',
          providerEnvironment: 'sandbox',
          providerReference: 're_test_1',
          status: 'active',
          kycStatus: 'approved',
        },
      ],
    })

    expect(payload.receivers).toEqual([{ receiverId: 're_test_1', amount: 10000 }])
  })
})

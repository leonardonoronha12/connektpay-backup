import { expect, test } from '@playwright/test'

import { GET as runCronGet, POST as runCronPost } from '@/app/api/events/process-pending/route'
import { reconcileTransactions } from '@/lib/reconciliation-service'
import { calculateSplit, createSplitPayloadForMyGateway, type SplitRuleConfig } from '@/lib/split-core'
import { processDueRecurringSubscriptions } from '@/lib/subscription-service'

function withEnv(vars: Record<string, string>, fn: () => Promise<void> | void) {
  const previous = new Map<string, string | undefined>()
  for (const [key, value] of Object.entries(vars)) {
    previous.set(key, process.env[key])
    process.env[key] = value
  }

  try {
    return fn()
  } finally {
    for (const [key, value] of previous.entries()) {
      if (typeof value === 'undefined') delete process.env[key]
      else process.env[key] = value
    }
  }
}

function buildSingleReceiverSplit() {
  const rules: SplitRuleConfig[] = [
    {
      id: 'rule_1',
      receiverId: 'recv_1',
      type: 'percentage',
      valueCents: null,
      percentageBps: 10000,
      priority: 0,
    },
  ]

  return calculateSplit({
    grossAmount: 10_000,
    taxConfig: null,
    rules,
  })
}

function createRecurringWorkerSupabase(rows: any[]) {
  class QueryBuilder {
    private filters: Array<(row: any) => boolean> = []
    private rowLimit: number | null = null

    select() {
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

    lte(column: string, value: unknown) {
      this.filters.push((row) => String(row[column] ?? '') <= String(value ?? ''))
      return this
    }

    order() {
      return this
    }

    limit(value: number) {
      this.rowLimit = value
      return this
    }

    then(resolve: (value: any) => any, reject?: (reason: any) => any) {
      let data = rows.filter((row) => this.filters.every((filter) => filter(row)))
      if (typeof this.rowLimit === 'number') data = data.slice(0, this.rowLimit)
      return Promise.resolve({ data, error: null }).then(resolve, reject)
    }
  }

  return {
    from(table: string) {
      if (table !== 'pay_assinatura') {
        throw new Error(`Tabela inesperada no mock de worker: ${table}`)
      }
      return new QueryBuilder()
    },
  }
}

function createReconciliationSupabase(seed: { transactions: any[]; pay_conciliation_items?: any[] }) {
  const db = {
    transactions: [...seed.transactions],
    pay_conciliation_items: [...(seed.pay_conciliation_items ?? [])],
  }

  class QueryBuilder {
    private action: 'select' | 'insert' | 'update' = 'select'
    private filters: Array<(row: any) => boolean> = []
    private insertedRows: any[] = []
    private updatePatch: Record<string, unknown> | null = null
    private rowLimit: number | null = null
    private singleMode: 'single' | 'maybeSingle' | null = null

    constructor(private readonly table: keyof typeof db) {}

    select() {
      return this
    }

    insert(values: any | any[]) {
      this.action = 'insert'
      this.insertedRows = Array.isArray(values) ? values : [values]
      return this
    }

    update(patch: Record<string, unknown>) {
      this.action = 'update'
      this.updatePatch = patch
      return this
    }

    eq(column: string, value: unknown) {
      this.filters.push((row) => row[column] === value)
      return this
    }

    gte(column: string, value: unknown) {
      this.filters.push((row) => String(row[column] ?? '') >= String(value ?? ''))
      return this
    }

    lte(column: string, value: unknown) {
      this.filters.push((row) => String(row[column] ?? '') <= String(value ?? ''))
      return this
    }

    order() {
      return this
    }

    limit(value: number) {
      this.rowLimit = value
      return this
    }

    maybeSingle() {
      this.singleMode = 'maybeSingle'
      return this
    }

    single() {
      this.singleMode = 'single'
      return this
    }

    then(resolve: (value: any) => any, reject?: (reason: any) => any) {
      const tableRows = db[this.table]

      if (this.action === 'insert') {
        const inserted = this.insertedRows.map((row, index) => ({
          id: row.id ?? `${this.table}_${tableRows.length + index + 1}`,
          ...row,
        }))
        tableRows.push(...inserted)
        const data = this.singleMode ? inserted[0] ?? null : inserted
        return Promise.resolve({ data, error: null }).then(resolve, reject)
      }

      if (this.action === 'update') {
        const matches = tableRows.filter((row) => this.filters.every((filter) => filter(row)))
        for (const row of matches) Object.assign(row, this.updatePatch ?? {})
        const data = this.singleMode ? matches[0] ?? null : matches
        return Promise.resolve({ data, error: null }).then(resolve, reject)
      }

      let data = tableRows.filter((row) => this.filters.every((filter) => filter(row)))
      if (typeof this.rowLimit === 'number') data = data.slice(0, this.rowLimit)
      const result = this.singleMode ? data[0] ?? null : data
      return Promise.resolve({ data: result, error: null }).then(resolve, reject)
    }
  }

  return {
    db,
    from(table: string) {
      if (table !== 'transactions' && table !== 'pay_conciliation_items') {
        throw new Error(`Tabela inesperada no mock de conciliação: ${table}`)
      }
      return new QueryBuilder(table)
    },
  }
}

test.describe('isolamento financeiro por ambiente', () => {
  test('receiver sandbox em pagamento sandbox é permitido', async () => {
    const split = buildSingleReceiverSplit()
    const payload = createSplitPayloadForMyGateway({
      split,
      providerId: 'pagarme',
      providerEnvironment: 'sandbox',
      receivers: [
        {
          id: 'recv_1',
          provider: 'pagarme',
          providerEnvironment: 'sandbox',
          providerReference: 'prov_recv_sandbox',
          status: 'active',
          kycStatus: 'approved',
        },
      ],
    })

    expect(payload.receivers).toEqual([{ receiverId: 'prov_recv_sandbox', amount: 10_000 }])
  })

  test('receiver production em pagamento production é permitido', async () => {
    const split = buildSingleReceiverSplit()
    const payload = createSplitPayloadForMyGateway({
      split,
      providerId: 'pagarme',
      providerEnvironment: 'production',
      receivers: [
        {
          id: 'recv_1',
          provider: 'pagarme',
          providerEnvironment: 'production',
          providerReference: 'prov_recv_prod',
          status: 'active',
          kycStatus: 'approved',
        },
      ],
    })

    expect(payload.receivers).toEqual([{ receiverId: 'prov_recv_prod', amount: 10_000 }])
  })

  test('receiver sandbox em pagamento production é rejeitado', async () => {
    const split = buildSingleReceiverSplit()
    expect(() =>
      createSplitPayloadForMyGateway({
        split,
        providerId: 'pagarme',
        providerEnvironment: 'production',
        receivers: [
          {
            id: 'recv_1',
            provider: 'pagarme',
            providerEnvironment: 'sandbox',
            providerReference: 'prov_recv_sandbox',
            status: 'active',
            kycStatus: 'approved',
          },
        ],
      }),
    ).toThrow('Receiver bound to another provider environment')
  })

  test('receiver production em pagamento sandbox é rejeitado', async () => {
    const split = buildSingleReceiverSplit()
    expect(() =>
      createSplitPayloadForMyGateway({
        split,
        providerId: 'pagarme',
        providerEnvironment: 'sandbox',
        receivers: [
          {
            id: 'recv_1',
            provider: 'pagarme',
            providerEnvironment: 'production',
            providerReference: 'prov_recv_prod',
            status: 'active',
            kycStatus: 'approved',
          },
        ],
      }),
    ).toThrow('Receiver bound to another provider environment')
  })

  test('worker sandbox ignora assinaturas production na query inicial', async () => {
    await withEnv(
      {
        FINANCIAL_PROVIDER: 'pagarme',
        PAGARME_ENVIRONMENT: 'sandbox',
      },
      async () => {
        const supabase = createRecurringWorkerSupabase([
          {
            id: 'sub_prod',
            organization_id: 'org_1',
            provider: 'pagarme',
            provider_environment: 'production',
            status: 'active',
            next_charge_at: '2026-07-01T00:00:00.000Z',
          },
        ])

        const result = await processDueRecurringSubscriptions({
          supabase,
          nowIso: '2026-07-02T00:00:00.000Z',
          limit: 20,
        })

        expect(result.scanned).toBe(0)
        expect(result.processed).toBe(0)
      },
    )
  })

  test('worker production ignora assinaturas sandbox na query inicial', async () => {
    await withEnv(
      {
        FINANCIAL_PROVIDER: 'pagarme',
        PAGARME_ENVIRONMENT: 'production',
      },
      async () => {
        const supabase = createRecurringWorkerSupabase([
          {
            id: 'sub_sandbox',
            organization_id: 'org_1',
            provider: 'pagarme',
            provider_environment: 'sandbox',
            status: 'active',
            next_charge_at: '2026-07-01T00:00:00.000Z',
          },
        ])

        const result = await processDueRecurringSubscriptions({
          supabase,
          nowIso: '2026-07-02T00:00:00.000Z',
          limit: 20,
        })

        expect(result.scanned).toBe(0)
        expect(result.processed).toBe(0)
      },
    )
  })

  test('cron GET rejeita override de environment enviado pelo cliente', async () => {
    await withEnv(
      {
        NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
        CRON_SECRET: 'cron-secret',
      },
      async () => {
        const request = new Request('https://connektpay.test/api/events/process-pending?environment=production', {
          headers: { authorization: 'Bearer cron-secret' },
        })
        const response = await runCronGet(request)
        expect(response.status).toBe(400)
      },
    )
  })

  test('cron POST rejeita override de environment enviado pelo cliente', async () => {
    await withEnv(
      {
        NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
        CRON_SECRET: 'cron-secret',
      },
      async () => {
        const request = new Request('https://connektpay.test/api/events/process-pending', {
          method: 'POST',
          headers: {
            authorization: 'Bearer cron-secret',
            'content-type': 'application/json',
          },
          body: JSON.stringify({ environment: 'sandbox' }),
        })
        const response = await runCronPost(request)
        expect(response.status).toBe(400)
      },
    )
  })

  test('run sandbox concilia apenas registro sandbox com provider_reference duplicado', async () => {
    const supabase = createReconciliationSupabase({
      transactions: [
        {
          id: 'tx_sandbox',
          organization_id: 'org_1',
          provider: 'pagarme',
          provider_environment: 'sandbox',
          provider_reference: 'shared_ref',
          amount: 1_000,
          status: 'paid',
          created_at: '2026-07-01T00:00:00.000Z',
        },
        {
          id: 'tx_prod',
          organization_id: 'org_1',
          provider: 'pagarme',
          provider_environment: 'production',
          provider_reference: 'shared_ref',
          amount: 1_000,
          status: 'paid',
          created_at: '2026-07-01T00:00:00.000Z',
        },
      ],
    })

    const stats = { checked: 0, matched: 0, divergent: 0, internalSum: 0, providerSum: 0, diffSum: 0, providerErrors: 0 }
    await reconcileTransactions({
      supabase,
      organizationId: 'org_1',
      runId: 'run_sandbox',
      periodStart: '2026-07-01T00:00:00.000Z',
      periodEnd: '2026-07-02T00:00:00.000Z',
      providerId: 'pagarme',
      providerEnvironment: 'sandbox',
      provider: {
        async getTransaction() {
          return { status: 'paid', amountCents: 1_000, raw: { id: 'shared_ref' } }
        },
      },
      stats,
      actorProfileId: 'profile_1',
    })

    expect(supabase.db.pay_conciliation_items).toHaveLength(1)
    expect(supabase.db.pay_conciliation_items[0].entity_id).toBe('tx_sandbox')
  })

  test('run production concilia apenas registro production com provider_reference duplicado', async () => {
    const supabase = createReconciliationSupabase({
      transactions: [
        {
          id: 'tx_sandbox',
          organization_id: 'org_1',
          provider: 'pagarme',
          provider_environment: 'sandbox',
          provider_reference: 'shared_ref',
          amount: 1_000,
          status: 'paid',
          created_at: '2026-07-01T00:00:00.000Z',
        },
        {
          id: 'tx_prod',
          organization_id: 'org_1',
          provider: 'pagarme',
          provider_environment: 'production',
          provider_reference: 'shared_ref',
          amount: 1_000,
          status: 'paid',
          created_at: '2026-07-01T00:00:00.000Z',
        },
      ],
    })

    const stats = { checked: 0, matched: 0, divergent: 0, internalSum: 0, providerSum: 0, diffSum: 0, providerErrors: 0 }
    await reconcileTransactions({
      supabase,
      organizationId: 'org_1',
      runId: 'run_prod',
      periodStart: '2026-07-01T00:00:00.000Z',
      periodEnd: '2026-07-02T00:00:00.000Z',
      providerId: 'pagarme',
      providerEnvironment: 'production',
      provider: {
        async getTransaction() {
          return { status: 'paid', amountCents: 1_000, raw: { id: 'shared_ref' } }
        },
      },
      stats,
      actorProfileId: 'profile_1',
    })

    expect(supabase.db.pay_conciliation_items).toHaveLength(1)
    expect(supabase.db.pay_conciliation_items[0].entity_id).toBe('tx_prod')
  })
})

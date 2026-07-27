import { expect, test } from '@playwright/test'
import { promises as fs } from 'fs'

import {
  buildInternalPaymentIdempotencyKey,
  buildInternalSplitSnapshot,
  createPhase2InternalPayment,
  InternalPaymentError,
  validateCheckoutPaymentLink,
  type CheckoutPaymentLinkRecord,
} from '@/lib/payments-internal'

type TableName = 'pay_taxa_config' | 'receivers' | 'split_rules' | 'transactions' | 'pay_transacao' | 'pay_split'

type MockDatabase = Record<TableName, any[]>

function createMockSupabase(seed?: Partial<MockDatabase>) {
  const db: MockDatabase = {
    pay_taxa_config: seed?.pay_taxa_config ? [...seed.pay_taxa_config] : [],
    receivers: seed?.receivers ? [...seed.receivers] : [],
    split_rules: seed?.split_rules ? [...seed.split_rules] : [],
    transactions: seed?.transactions ? [...seed.transactions] : [],
    pay_transacao: seed?.pay_transacao ? [...seed.pay_transacao] : [],
    pay_split: seed?.pay_split ? [...seed.pay_split] : [],
  }

  class QueryBuilder {
    private action: 'select' | 'insert' | 'update' | 'upsert' = 'select'
    private filters: Array<(row: any) => boolean> = []
    private selectColumns: string | null = null
    private orderBy: { column: string; ascending: boolean } | null = null
    private insertedRows: any[] = []
    private updatePatch: Record<string, unknown> | null = null
    private singleMode: 'single' | 'maybeSingle' | null = null
    private rowLimit: number | null = null
    private onConflict: string | null = null

    constructor(private readonly table: TableName) {}

    select(columns?: string) {
      this.selectColumns = columns ?? null
      return this
    }

    insert(values: any | any[]) {
      this.action = 'insert'
      this.insertedRows = Array.isArray(values) ? values : [values]
      return this
    }

    upsert(values: any | any[], options?: { onConflict?: string }) {
      this.action = 'upsert'
      this.insertedRows = Array.isArray(values) ? values : [values]
      this.onConflict = options?.onConflict ?? null
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

    in(column: string, values: unknown[]) {
      this.filters.push((row) => values.includes(row[column]))
      return this
    }

    is(column: string, value: unknown) {
      this.filters.push((row) => row[column] === value)
      return this
    }

    or(expression: string) {
      const branches = expression
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
        .map<(row: any) => boolean>((part) => {
          const eqMatch = /^([a-z_]+)\.eq\.(.+)$/i.exec(part)
          if (eqMatch) {
            const [, column, rawValue] = eqMatch
            return (row) => String(row[column] ?? '') === rawValue
          }

          const isNullMatch = /^([a-z_]+)\.is\.null$/i.exec(part)
          if (isNullMatch) {
            const [, column] = isNullMatch
            return (row) => row[column] == null
          }

          return () => false
        })

      this.filters.push((row) => branches.some((branch) => branch(row)))
      return this
    }

    order(column: string, options?: { ascending?: boolean }) {
      this.orderBy = { column, ascending: options?.ascending !== false }
      return this
    }

    limit(value: number) {
      this.rowLimit = value
      return this
    }

    single() {
      this.singleMode = 'single'
      return this
    }

    maybeSingle() {
      this.singleMode = 'maybeSingle'
      return this
    }

    then(resolve: (value: any) => any, reject?: (reason: any) => any) {
      return Promise.resolve(this.execute()).then(resolve, reject)
    }

    private applyFilters(rows: any[]) {
      let out = rows.filter((row) => this.filters.every((fn) => fn(row)))
      if (this.orderBy) {
        const { column, ascending } = this.orderBy
        out = out.sort((a, b) => {
          const av = a[column]
          const bv = b[column]
          if (av === bv) return 0
          return ascending ? (av > bv ? 1 : -1) : av > bv ? -1 : 1
        })
      }
      if (typeof this.rowLimit === 'number') out = out.slice(0, this.rowLimit)
      return out
    }

    private project(rows: any[]) {
      if (!this.selectColumns) return rows
      const columns = this.selectColumns
        .split(',')
        .map((column) => column.trim())
        .filter(Boolean)

      return rows.map((row) => {
        const picked: Record<string, unknown> = {}
        for (const column of columns) picked[column] = row[column]
        return picked
      })
    }

    private findUpsertIndex(tableRows: any[], row: any) {
      if (!this.onConflict) return -1
      const columns = this.onConflict
        .split(',')
        .map((column) => column.trim())
        .filter(Boolean)
      return tableRows.findIndex((existing) => columns.every((column) => existing[column] === row[column]))
    }

    private execute() {
      const tableRows = db[this.table]

      if (this.action === 'insert') {
        const inserted = this.insertedRows.map((row) => ({ ...row }))
        tableRows.push(...inserted)
        const data = this.project(inserted)
        if (this.singleMode) return { data: data[0] ?? null, error: null }
        return { data, error: null }
      }

      if (this.action === 'upsert') {
        const upserted: any[] = []
        for (const row of this.insertedRows.map((entry) => ({ ...entry }))) {
          const existingIndex = this.findUpsertIndex(tableRows, row)
          if (existingIndex >= 0) {
            tableRows[existingIndex] = { ...tableRows[existingIndex], ...row }
            upserted.push(tableRows[existingIndex])
          } else {
            tableRows.push(row)
            upserted.push(row)
          }
        }
        const data = this.project(upserted)
        if (this.singleMode) return { data: data[0] ?? null, error: null }
        return { data, error: null }
      }

      if (this.action === 'update') {
        const rows = this.applyFilters(tableRows)
        for (const row of rows) Object.assign(row, this.updatePatch ?? {})
        const data = this.project(rows)
        if (this.singleMode) return { data: data[0] ?? null, error: null }
        return { data, error: null }
      }

      const rows = this.project(this.applyFilters(tableRows))
      if (this.singleMode === 'maybeSingle') return { data: rows[0] ?? null, error: null }
      if (this.singleMode === 'single') return { data: rows[0] ?? null, error: null }
      return { data: rows, error: null }
    }
  }

  return {
    db,
    from(table: TableName) {
      return new QueryBuilder(table)
    },
    async rpc(name: string, payload: any) {
      if (name !== 'create_internal_checkout_transaction') {
        return { data: null, error: new Error('RPC não suportada no mock') }
      }

      const existing = db.transactions.find(
        (row) => row.organization_id === payload.p_organization_id && row.idempotency_key === payload.p_idempotency_key,
      )

      if (existing) {
        const existingPay = db.pay_transacao.find((row) => row.transaction_id === existing.id)
        if (!existingPay) {
          db.pay_transacao.push({
            transaction_id: existing.id,
            organization_id: payload.p_organization_id,
            payment_link_id: payload.p_payment_link_id,
            gross_amount: payload.p_split_summary.gross_amount ?? payload.p_amount,
            connekt_fee_amount: payload.p_split_summary.connekt_fee_amount ?? 0,
            receiver_total_amount: payload.p_split_summary.receiver_total_amount ?? payload.p_amount,
            currency: payload.p_currency,
            status: payload.p_status,
            provider: payload.p_provider,
            provider_reference: null,
            provider_order_id: null,
            provider_charge_id: null,
            provider_payload: {},
            provider_split_payload: {},
            idempotency_key: payload.p_idempotency_key,
            split_snapshot: payload.p_split_summary,
          })
        }

        for (const row of payload.p_split_rows ?? []) {
          const found = db.pay_split.find(
            (entry) =>
              entry.transaction_id === existing.id &&
              entry.kind === row.kind &&
              (entry.receiver_id ?? null) === (row.receiver_id || null),
          )
          if (!found) {
            db.pay_split.push({
              transaction_id: existing.id,
              organization_id: payload.p_organization_id,
              receiver_id: row.receiver_id || null,
              kind: row.kind,
              amount: row.amount,
              percentage_bps: row.percentage_bps,
              rule_id: row.rule_id || null,
            })
          }
        }

        return {
          data: [
            {
              transaction_id: existing.id,
              public_token: existing.public_token,
              status: existing.status,
              idempotency_key: existing.idempotency_key,
              reused: true,
            },
          ],
          error: null,
        }
      }

      const transaction = {
        id: payload.p_transaction_id,
        organization_id: payload.p_organization_id,
        customer_id: payload.p_customer_id,
        payment_link_id: payload.p_payment_link_id,
        amount: payload.p_amount,
        currency: payload.p_currency,
        method: payload.p_method,
        status: payload.p_status,
        provider: payload.p_provider,
        provider_reference: null,
        provider_order_id: null,
        provider_charge_id: null,
        provider_payload: {},
        public_token: `public_${payload.p_transaction_id}`,
        idempotency_key: payload.p_idempotency_key,
        metadata: payload.p_transaction_metadata,
      }
      db.transactions.push(transaction)
      db.pay_transacao.push({
        transaction_id: payload.p_transaction_id,
        organization_id: payload.p_organization_id,
        payment_link_id: payload.p_payment_link_id,
        gross_amount: payload.p_split_summary.gross_amount ?? payload.p_amount,
        connekt_fee_amount: payload.p_split_summary.connekt_fee_amount ?? 0,
        receiver_total_amount: payload.p_split_summary.receiver_total_amount ?? payload.p_amount,
        currency: payload.p_currency,
        status: payload.p_status,
        provider: payload.p_provider,
        provider_reference: null,
        provider_order_id: null,
        provider_charge_id: null,
        provider_payload: {},
        provider_split_payload: {},
        idempotency_key: payload.p_idempotency_key,
        split_snapshot: payload.p_split_summary,
      })
      for (const row of payload.p_split_rows ?? []) {
        db.pay_split.push({
          transaction_id: payload.p_transaction_id,
          organization_id: payload.p_organization_id,
          receiver_id: row.receiver_id || null,
          kind: row.kind,
          amount: row.amount,
          percentage_bps: row.percentage_bps,
          rule_id: row.rule_id || null,
        })
      }

      return {
        data: [
          {
            transaction_id: transaction.id,
            public_token: transaction.public_token,
            status: transaction.status,
            idempotency_key: transaction.idempotency_key,
            reused: false,
          },
        ],
        error: null,
      }
    },
  }
}

function createValidLink(overrides?: Partial<CheckoutPaymentLinkRecord>): CheckoutPaymentLinkRecord {
  return {
    id: 'pl_1',
    organization_id: 'org_1',
    amount: 10000,
    currency: 'BRL',
    name: 'Checkout White Label',
    description: 'Link interno',
    type: 'one_time',
    methods: { pix: true, card: true },
    max_installments: 1,
    status: 'active',
    slug: 'checkout-valido',
    metadata: {},
    ...overrides,
  }
}

function createSplitSeed(overrides?: {
  paymentLinkId?: string | null
  receiver2Bps?: number
  receiver1Bps?: number
  secondReceiverOrganizationId?: string
  secondReceiverStatus?: string
  secondReceiverKycStatus?: string
  provider?: string
  providerEnvironment?: string
  secondReceiverProviderEnvironment?: string
}) {
  const paymentLinkId = overrides?.paymentLinkId ?? 'pl_1'
  const provider = overrides?.provider ?? 'pagarme'
  const providerEnvironment = overrides?.providerEnvironment ?? 'sandbox'
  return {
    pay_taxa_config: [{ organization_id: 'org_1', fee_fixed_amount: 0, fee_percentage_bps: 0, min_fee_amount: null, max_fee_amount: null, status: 'active' }],
    receivers: [
      {
        id: 'recv_main',
        organization_id: 'org_1',
        provider,
        provider_environment: providerEnvironment,
        provider_receiver_id: 'prov_recv_main',
        provider_reference: 'prov_recv_main',
        status: 'active',
        kyc_status: 'approved',
        created_at: '2026-07-20T10:00:00.000Z',
      },
      {
        id: 'recv_partner',
        organization_id: overrides?.secondReceiverOrganizationId ?? 'org_1',
        provider,
        provider_environment: overrides?.secondReceiverProviderEnvironment ?? providerEnvironment,
        provider_receiver_id: 'prov_recv_partner',
        provider_reference: 'prov_recv_partner',
        status: overrides?.secondReceiverStatus ?? 'active',
        kyc_status: overrides?.secondReceiverKycStatus ?? 'approved',
        created_at: '2026-07-20T10:01:00.000Z',
      },
    ],
    split_rules: [
      {
        id: 'rule_main',
        organization_id: 'org_1',
        receiver_id: 'recv_main',
        payment_link_id: paymentLinkId,
        type: 'percentage',
        value_cents: null,
        percentage_bps: overrides?.receiver1Bps ?? 7000,
        priority: 100,
        status: 'active',
      },
      {
        id: 'rule_partner',
        organization_id: 'org_1',
        receiver_id: 'recv_partner',
        payment_link_id: paymentLinkId,
        type: 'percentage',
        value_cents: null,
        percentage_bps: overrides?.receiver2Bps ?? 3000,
        priority: 90,
        status: 'active',
      },
    ],
  }
}

function createInheritedGlobalLegacySplitSeed() {
  return {
    pay_taxa_config: [{ organization_id: 'org_1', fee_fixed_amount: 0, fee_percentage_bps: 0, min_fee_amount: null, max_fee_amount: null, status: 'active' }],
    receivers: [
      {
        id: 'recv_main',
        organization_id: 'org_1',
        provider: 'pagarme',
        provider_environment: 'sandbox',
        provider_receiver_id: 'prov_recv_main',
        provider_reference: 'prov_recv_main',
        status: 'active',
        kyc_status: 'approved',
        created_at: '2026-07-20T10:00:00.000Z',
      },
    ],
    split_rules: [
      {
        id: 'rule_global_legacy',
        organization_id: 'org_1',
        receiver_id: 'recv_legacy',
        payment_link_id: null,
        type: 'percentage',
        value_cents: null,
        percentage_bps: 10000,
        priority: 100,
        status: 'active',
      },
    ],
  }
}

test.describe('payments internal phase 2', () => {
  test('cria transacao interna completa antes do provider com snapshot e metadata segura', async () => {
    const supabase = createMockSupabase(createSplitSeed())
    const link = createValidLink()

    const result = await createPhase2InternalPayment({
      supabase,
      organizationId: 'org_1',
      paymentLink: link,
      method: 'pix',
      customer: { name: 'Cliente Teste', email: 'cliente@teste.com', document: '12345678901' },
      customerId: 'cust_1',
      provider: 'pagarme',
      providerEnvironment: 'sandbox',
      metadata: { attempt_id: 'attempt_1' },
      explicitIdempotencyKey: 'idem-1',
      requestId: 'req-1',
      attemptId: 'attempt_1',
      phase2ProviderErrorCode: 'provider_phase_pending',
      phase2ProviderErrorMessage: 'Provider ainda não habilitado nesta fase.',
    })

    expect(result.transaction.transactionId).toBeTruthy()
    expect(result.transaction.publicToken).toBeTruthy()
    expect(result.transaction.idempotencyKey).toBeTruthy()
    expect(supabase.db.transactions).toHaveLength(1)
    expect(supabase.db.pay_transacao).toHaveLength(1)
    expect(supabase.db.pay_split).toHaveLength(3)

    const transactionRow = supabase.db.transactions[0]
    expect(transactionRow.id).toBe(result.transaction.transactionId)
    expect(transactionRow.organization_id).toBe('org_1')
    expect(transactionRow.payment_link_id).toBe('pl_1')
    expect(transactionRow.status).toBe('provider_error')
    expect(transactionRow.provider).toBe('pagarme')
    expect(transactionRow.provider_reference).toBeNull()
    expect(transactionRow.provider_order_id).toBeNull()
    expect(transactionRow.provider_charge_id).toBeNull()
    expect(transactionRow.metadata.internal_transaction_id).toBe(result.transaction.transactionId)
    expect(transactionRow.metadata.organization_id).toBe('org_1')
    expect(transactionRow.metadata.payment_link_id).toBe('pl_1')

    const payTransacaoRow = supabase.db.pay_transacao[0]
    expect(payTransacaoRow.transaction_id).toBe(result.transaction.transactionId)
    expect(payTransacaoRow.status).toBe('provider_error')
    expect(payTransacaoRow.split_snapshot.validated_total_amount).toBe(10000)
    expect(payTransacaoRow.split_snapshot.applied_receivers).toHaveLength(2)
    expect(payTransacaoRow.provider_error_code).toBe('provider_phase_pending')
  })

  test('cria transacao interna de cartao com split explicito valido', async () => {
    const supabase = createMockSupabase(createSplitSeed())
    const link = createValidLink()

    const result = await createPhase2InternalPayment({
      supabase,
      organizationId: 'org_1',
      paymentLink: link,
      method: 'card',
      customer: { name: 'Cliente Cartao', email: 'cartao@teste.com', document: '12345678901' },
      customerId: 'cust_card_1',
      provider: 'pagarme',
      providerEnvironment: 'sandbox',
      metadata: { attempt_id: 'attempt_card_1' },
      explicitIdempotencyKey: 'idem-card-1',
      requestId: 'req-card-1',
      attemptId: 'attempt_card_1',
      phase2ProviderErrorCode: 'provider_phase_pending',
      phase2ProviderErrorMessage: 'Provider ainda não habilitado nesta fase.',
    })

    expect(result.splitSnapshot.rules).toHaveLength(2)
    expect(result.splitSnapshot.applied_receivers).toHaveLength(2)
    expect(supabase.db.pay_split).toHaveLength(3)
    expect(supabase.db.transactions[0].method).toBe('card')
  })

  test('retry com mesma idempotency_key reaproveita a transacao interna sem duplicar registros', async () => {
    const supabase = createMockSupabase(createSplitSeed())
    const link = createValidLink()

    const first = await createPhase2InternalPayment({
      supabase,
      organizationId: 'org_1',
      paymentLink: link,
      method: 'card',
      customer: { email: 'cliente@teste.com', document: '12345678901' },
      customerId: 'cust_1',
      provider: 'pagarme',
      providerEnvironment: 'sandbox',
      explicitIdempotencyKey: 'same-attempt',
      phase2ProviderErrorCode: 'provider_phase_pending',
      phase2ProviderErrorMessage: 'Provider ainda não habilitado nesta fase.',
    })

    const second = await createPhase2InternalPayment({
      supabase,
      organizationId: 'org_1',
      paymentLink: link,
      method: 'card',
      customer: { email: 'cliente@teste.com', document: '12345678901' },
      customerId: 'cust_1',
      provider: 'pagarme',
      providerEnvironment: 'sandbox',
      explicitIdempotencyKey: 'same-attempt',
      phase2ProviderErrorCode: 'provider_phase_pending',
      phase2ProviderErrorMessage: 'Provider ainda não habilitado nesta fase.',
    })

    expect(second.transaction.transactionId).toBe(first.transaction.transactionId)
    expect(second.transaction.reused).toBeTruthy()
    expect(supabase.db.transactions).toHaveLength(1)
    expect(supabase.db.pay_transacao).toHaveLength(1)
    expect(supabase.db.pay_split).toHaveLength(3)
  })

  test('falha simulada apos criacao interna preserva transacao e marca provider_error', async () => {
    const supabase = createMockSupabase(createSplitSeed())

    await createPhase2InternalPayment({
      supabase,
      organizationId: 'org_1',
      paymentLink: createValidLink(),
      method: 'pix',
      customer: { email: 'cliente@teste.com' },
      customerId: 'cust_1',
      provider: 'pagarme',
      providerEnvironment: 'sandbox',
      explicitIdempotencyKey: 'attempt-provider-error',
      phase2ProviderErrorCode: 'provider_phase_pending',
      phase2ProviderErrorMessage: 'Provider ainda não habilitado nesta fase.',
    })

    expect(supabase.db.transactions[0].status).toBe('provider_error')
    expect(supabase.db.transactions[0].provider_error_code).toBe('provider_phase_pending')
    expect(supabase.db.transactions[0].provider_error_message).toContain('Provider ainda não habilitado')
    expect(supabase.db.pay_transacao[0].status).toBe('provider_error')
  })

  test('gera idempotency key estavel para a mesma tentativa', async () => {
    const first = buildInternalPaymentIdempotencyKey({
      organizationId: 'org_1',
      paymentLinkId: 'pl_1',
      provider: 'pagarme',
      providerEnvironment: 'sandbox',
      method: 'pix',
      amount: 10000,
      currency: 'BRL',
      customer: { email: 'cliente@teste.com', document: '123.456.789-01' },
      explicitKey: 'attempt_1',
      requestId: 'req_1',
      attemptId: 'attempt_1',
    })

    const second = buildInternalPaymentIdempotencyKey({
      organizationId: 'org_1',
      paymentLinkId: 'pl_1',
      provider: 'pagarme',
      providerEnvironment: 'sandbox',
      method: 'pix',
      amount: 10000,
      currency: 'BRL',
      customer: { email: 'cliente@teste.com', document: '12345678901' },
      explicitKey: 'attempt_1',
      requestId: 'req_1',
      attemptId: 'attempt_1',
    })

    expect(first).toBe(second)
  })

  test('gera idempotency key diferente entre sandbox e produção', async () => {
    const sandboxKey = buildInternalPaymentIdempotencyKey({
      organizationId: 'org_1',
      paymentLinkId: 'pl_1',
      provider: 'pagarme',
      providerEnvironment: 'sandbox',
      method: 'pix',
      amount: 10000,
      currency: 'BRL',
      customer: { email: 'cliente@teste.com', document: '123.456.789-01' },
      explicitKey: 'attempt_1',
      requestId: 'req_1',
      attemptId: 'attempt_1',
    })

    const productionKey = buildInternalPaymentIdempotencyKey({
      organizationId: 'org_1',
      paymentLinkId: 'pl_1',
      provider: 'pagarme',
      providerEnvironment: 'production',
      method: 'pix',
      amount: 10000,
      currency: 'BRL',
      customer: { email: 'cliente@teste.com', document: '123.456.789-01' },
      explicitKey: 'attempt_1',
      requestId: 'req_1',
      attemptId: 'attempt_1',
    })

    expect(sandboxKey).not.toBe(productionKey)
  })

  test('valida criação normal do split snapshot', async () => {
    const supabase = createMockSupabase(createSplitSeed())
    const result = await buildInternalSplitSnapshot({
      supabase,
      organizationId: 'org_1',
      paymentLinkId: 'pl_1',
      grossAmount: 10000,
      provider: 'pagarme',
      providerEnvironment: 'sandbox',
    })

    expect(result.splitSnapshot.gross_amount).toBe(10000)
    expect(result.splitSnapshot.validated_total_amount).toBe(10000)
    expect(result.splitSnapshot.rules).toHaveLength(2)
    expect(result.splitSnapshot.receivers).toHaveLength(2)
    expect(result.paySplitRows).toHaveLength(3)
  })

  test('rejeita split invalido com recebedor fora do tenant', async () => {
    const supabase = createMockSupabase(createSplitSeed({ secondReceiverOrganizationId: 'org_2' }))

    await expect(
      buildInternalSplitSnapshot({
        supabase,
        organizationId: 'org_1',
        paymentLinkId: 'pl_1',
        grossAmount: 10000,
        provider: 'pagarme',
        providerEnvironment: 'sandbox',
      }),
    ).rejects.toMatchObject({ code: 'split_invalid_receiver' })
  })

  test('checkout sem split explicito ignora regra global legada e nao cria pay_split', async () => {
    const supabase = createMockSupabase(createInheritedGlobalLegacySplitSeed())

    const result = await createPhase2InternalPayment({
      supabase,
      organizationId: 'org_1',
      paymentLink: createValidLink({ id: 'pl_sem_split', slug: 'sem-split' }),
      method: 'pix',
      customer: { email: 'cliente@teste.com', document: '12345678901' },
      customerId: 'cust_1',
      provider: 'pagarme',
      providerEnvironment: 'sandbox',
      explicitIdempotencyKey: 'sem-split-herdado',
      phase2ProviderErrorCode: 'provider_phase_pending',
      phase2ProviderErrorMessage: 'Provider ainda não habilitado nesta fase.',
    })

    expect(result.splitSnapshot.rules).toEqual([])
    expect(result.splitSnapshot.receivers).toEqual([])
    expect(result.splitSnapshot.applied_receivers).toEqual([])
    expect(supabase.db.pay_split).toEqual([])
  })

  test('cartao sem split explicito tambem ignora regra global legada', async () => {
    const supabase = createMockSupabase(createInheritedGlobalLegacySplitSeed())

    const result = await createPhase2InternalPayment({
      supabase,
      organizationId: 'org_1',
      paymentLink: createValidLink({ id: 'pl_sem_split_card', slug: 'sem-split-card' }),
      method: 'card',
      customer: { email: 'cliente@teste.com', document: '12345678901' },
      customerId: 'cust_1',
      provider: 'pagarme',
      providerEnvironment: 'sandbox',
      explicitIdempotencyKey: 'sem-split-herdado-card',
      phase2ProviderErrorCode: 'provider_phase_pending',
      phase2ProviderErrorMessage: 'Provider ainda não habilitado nesta fase.',
    })

    expect(result.splitSnapshot.rules).toEqual([])
    expect(result.splitSnapshot.applied_receivers).toEqual([])
    expect(supabase.db.pay_split).toEqual([])
  })

  test('rejeita split com soma incorreta', async () => {
    const supabase = createMockSupabase(createSplitSeed({ receiver1Bps: 7000, receiver2Bps: 4000 }))

    await expect(
      buildInternalSplitSnapshot({
        supabase,
        organizationId: 'org_1',
        paymentLinkId: 'pl_1',
        grossAmount: 10000,
        provider: 'pagarme',
        providerEnvironment: 'sandbox',
      }),
    ).rejects.toMatchObject({ code: 'split_total_mismatch' })
  })

  test('rejeita link inexistente', async () => {
    expect(() => validateCheckoutPaymentLink({ link: null, method: 'pix' })).toThrowError(InternalPaymentError)
    expect(() => validateCheckoutPaymentLink({ link: null, method: 'pix' })).toThrow(/não encontrado/i)
  })

  test('rejeita link inativo', async () => {
    expect(() => validateCheckoutPaymentLink({ link: createValidLink({ status: 'disabled' }), method: 'pix' })).toThrow(/inativo/i)
  })

  test('rejeita link expirado', async () => {
    expect(() =>
      validateCheckoutPaymentLink({
        link: createValidLink({ metadata: { expires_at: '2020-01-01T00:00:00.000Z' } }),
        method: 'pix',
      }),
    ).toThrow(/expirado/i)
  })

  test('rejeita organização inválida no link', async () => {
    try {
      validateCheckoutPaymentLink({ link: createValidLink({ organization_id: '' }), method: 'pix' })
      throw new Error('era esperado erro de organization_id')
    } catch (error) {
      expect(error).toBeInstanceOf(InternalPaymentError)
      expect((error as InternalPaymentError).code).toBe('payment_link_invalid_organization')
    }
  })

  test('rejeita valor inválido no link', async () => {
    try {
      validateCheckoutPaymentLink({ link: createValidLink({ amount: 0 }), method: 'pix' })
      throw new Error('era esperado erro de valor')
    } catch (error) {
      expect(error).toBeInstanceOf(InternalPaymentError)
      expect((error as InternalPaymentError).code).toBe('payment_link_invalid_amount')
    }
  })

  test('rejeita violação de multi-tenant no checkout', async () => {
    try {
      validateCheckoutPaymentLink({
        link: createValidLink({ organization_id: 'org_1' }),
        method: 'pix',
        expectedOrganizationId: 'org_2',
      })
      throw new Error('era esperado erro de tenant')
    } catch (error) {
      expect(error).toBeInstanceOf(InternalPaymentError)
      expect((error as InternalPaymentError).code).toBe('payment_link_tenant_mismatch')
    }
  })

  test('fase 2 nao chama o provider diretamente no endpoint', async () => {
    const routeSource = await fs.readFile('c:\\Users\\Leonardo\\Desktop\\ConnektPay\\app\\api\\payments\\route.ts', 'utf8')
    expect(routeSource).not.toMatch(/createPayment\s*\(/)
    expect(routeSource).not.toMatch(/getAcquirerProvider\s*\(/)
  })
})

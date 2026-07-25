import { expect, test } from '@playwright/test'

import { canAccessPath } from '@/lib/rbac'
import {
  calculateAnticipation,
  calculateFee,
  calculateNetAmount,
  getAnticipationAuditAction,
  getAnticipationInternalIssues,
  mapAnticipationStatus,
  normalizeAnticipationInternalDraft,
  simulateAnticipationInternal,
  type AnticipationEligibleReceiver,
} from '@/lib/anticipation-core'
import {
  approveAnticipation,
  cancelAnticipation,
  deleteAnticipation,
  rejectAnticipation,
  requestAnticipation,
  simulateAnticipation,
} from '@/lib/anticipation-service'

type TableName = 'receivers' | 'pay_antecipacao' | 'pay_antecipacao_events' | 'ledger_entries' | 'audit_logs'

type MockDatabase = {
  receivers: any[]
  pay_antecipacao: any[]
  pay_antecipacao_events: any[]
  ledger_entries: any[]
  audit_logs: any[]
}

function createMockSupabase(seed?: Partial<MockDatabase>) {
  const db: MockDatabase = {
    receivers: seed?.receivers ? [...seed.receivers] : [],
    pay_antecipacao: seed?.pay_antecipacao ? [...seed.pay_antecipacao] : [],
    pay_antecipacao_events: seed?.pay_antecipacao_events ? [...seed.pay_antecipacao_events] : [],
    ledger_entries: seed?.ledger_entries ? [...seed.ledger_entries] : [],
    audit_logs: seed?.audit_logs ? [...seed.audit_logs] : [],
  }

  let nextId = 1

  class QueryBuilder {
    private action: 'select' | 'insert' | 'update' | 'delete' = 'select'
    private filters: Array<(row: any) => boolean> = []
    private selectColumns: string | null = null
    private orderBy: { column: string; ascending: boolean } | null = null
    private insertedRows: any[] = []
    private updatePatch: Record<string, unknown> | null = null
    private singleMode: 'single' | 'maybeSingle' | null = null
    private limitCount: number | null = null

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

    update(patch: Record<string, unknown>) {
      this.action = 'update'
      this.updatePatch = patch
      return this
    }

    delete() {
      this.action = 'delete'
      return this
    }

    eq(column: string, value: unknown) {
      this.filters.push((row) => row[column] === value)
      return this
    }

    neq(column: string, value: unknown) {
      this.filters.push((row) => row[column] !== value)
      return this
    }

    in(column: string, values: unknown[]) {
      this.filters.push((row) => values.includes(row[column]))
      return this
    }

    order(column: string, options?: { ascending?: boolean }) {
      this.orderBy = { column, ascending: options?.ascending !== false }
      return this
    }

    limit(value: number) {
      this.limitCount = value
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
      if (typeof this.limitCount === 'number') out = out.slice(0, this.limitCount)
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

    private execute() {
      const tableRows = db[this.table]

      if (this.action === 'insert') {
        const now = new Date().toISOString()
        const inserted = this.insertedRows.map((row) => {
          const value = {
            id: row.id ?? `${this.table}_${nextId++}`,
            created_at: row.created_at ?? now,
            updated_at: row.updated_at ?? now,
            ...row,
          }
          tableRows.push(value)
          return value
        })
        const data = this.project(inserted)
        if (this.singleMode) return { data: data[0] ?? null, error: null }
        return { data, error: null }
      }

      if (this.action === 'update') {
        const rows = this.applyFilters(tableRows)
        const now = new Date().toISOString()
        for (const row of rows) Object.assign(row, this.updatePatch ?? {}, { updated_at: now })
        const data = this.project(rows)
        if (this.singleMode) return { data: data[0] ?? null, error: null }
        return { data, error: null }
      }

      if (this.action === 'delete') {
        const rows = this.applyFilters(tableRows)
        db[this.table] = tableRows.filter((row) => !rows.includes(row))
        if (this.table === 'pay_antecipacao') {
          db.pay_antecipacao_events = db.pay_antecipacao_events.filter((event) => !rows.some((row) => row.id === event.antecipacao_id))
        }
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
  }
}

function seedReceivers() {
  return [
    {
      id: 'recv_1',
      organization_id: 'org_1',
      name: 'Recebedor Elegivel',
      document: '12345678901',
      type: 'pf',
      status: 'active',
      kyc_status: 'approved',
      internal_status: 'internally_approved',
      bank_account: {
        bank_code: '001',
        agency: '1234',
        account: '987654',
        account_digit: '1',
        account_type: 'checking',
      },
      created_at: '2026-07-13T10:00:00.000Z',
    },
    {
      id: 'recv_blocked',
      organization_id: 'org_1',
      name: 'Recebedor Bloqueado',
      document: '10987654321',
      type: 'pf',
      status: 'active',
      kyc_status: 'approved',
      internal_status: 'blocked',
      bank_account: {
        bank_code: '237',
        agency: '2222',
        account: '555666',
        account_digit: '7',
        account_type: 'checking',
      },
      created_at: '2026-07-13T10:05:00.000Z',
    },
    {
      id: 'recv_other_org',
      organization_id: 'org_2',
      name: 'Outro Recebedor',
      document: '22233344455',
      type: 'pj',
      status: 'active',
      kyc_status: 'approved',
      internal_status: 'internally_approved',
      bank_account: {
        bank_code: '341',
        agency: '3333',
        account: '111222',
        account_digit: '9',
        account_type: 'checking',
      },
      created_at: '2026-07-13T10:10:00.000Z',
    },
  ]
}

function seedLedger(balanceAfter: number) {
  return [
    {
      id: 'ledger_1',
      organization_id: 'org_1',
      balance_after: balanceAfter,
      occurred_at: '2026-07-13T12:00:00.000Z',
      created_at: '2026-07-13T12:00:00.000Z',
    },
  ]
}

function eligibleReceiversFixture(): AnticipationEligibleReceiver[] {
  return [
    {
      id: 'recv_1',
      name: 'Recebedor Elegivel',
      document: '12345678901',
      type: 'pf',
      status: 'active',
      kycStatus: 'approved',
      internalStatus: 'internally_approved',
      bankAccountMasked: {
        bank_code: '001',
        agency: '1234',
        account: '***654',
        account_digit: '1',
        account_type: 'checking',
        pix_key: null,
      },
    },
  ]
}

test.describe('Antecipação interna', () => {
  test('core calcula fee/net e mapeia status do provider futuro', async () => {
    expect(calculateFee({ requestedAmountCents: 100_00, feeBps: 400 })).toBe(400)
    expect(calculateNetAmount({ requestedAmountCents: 10_000, feeCents: 400 })).toBe(9600)

    const calculated = calculateAnticipation({ requestedAmountCents: 50_000, availableAmountCents: 100_000, feeBps: 250, settlementDays: 3 })
    expect(calculated.feeCents).toBe(1250)
    expect(calculated.netCents).toBe(48_750)
    expect(calculated.settlementDays).toBe(3)

    expect(getAnticipationAuditAction({ beforeStatus: null, afterStatus: 'requested' })).toBe('REQUEST')
    expect(getAnticipationAuditAction({ beforeStatus: 'under_review', afterStatus: 'approved' })).toBe('APPROVE')
    expect(mapAnticipationStatus({ type: 'anticipation.requested' })).toBe('provider_pending')
    expect(mapAnticipationStatus({ type: 'anticipation.approved' })).toBe('provider_processing')
    expect(mapAnticipationStatus({ type: 'anticipation.executed' })).toBe('paid')
    expect(mapAnticipationStatus({ type: 'anticipation.canceled' })).toBe('cancelled')
  })

  test('simulador tolera saldo insuficiente e devolve issues de negocio', async () => {
    const draft = normalizeAnticipationInternalDraft({
      receiverId: 'recv_1',
      ...simulateAnticipationInternal({
        requestedAmountCents: 120_000,
        availableAmountCents: 80_000,
        feeBps: 400,
        settlementDays: 2,
      }),
      status: 'requested',
    })

    const issues = getAnticipationInternalIssues({
      draft,
      eligibleReceivers: eligibleReceiversFixture(),
      availableAmountCents: 80_000,
      providerEnabled: false,
    })

    expect(draft.requestedAmountCents).toBe(120_000)
    expect(draft.netAmountCents).toBe(115_200)
    expect(issues.some((issue) => issue.field === 'requestedAmountCents')).toBeTruthy()
  })

  test('simula antecipacao elegivel sem mover dinheiro', async () => {
    const supabase = createMockSupabase({
      receivers: seedReceivers(),
      ledger_entries: seedLedger(500_000),
    })

    const simulation = await simulateAnticipation({
      supabase,
      organizationId: 'org_1',
      receiverId: 'recv_1',
      requestedAmountCents: 100_000,
      feeBps: 400,
    })

    expect(simulation.ok).toBeTruthy()
    expect(simulation.netAmountCents).toBe(96_000)
    expect(simulation.estimatedFeeCents).toBe(4_000)
    expect(simulation.balanceCents).toBe(500_000)
    expect(simulation.eligibleReceivers).toHaveLength(1)
  })

  test('cria solicitacao valida, audita e nao inventa provider_reference', async () => {
    const supabase = createMockSupabase({
      receivers: seedReceivers(),
      ledger_entries: seedLedger(600_000),
    })

    const out = await requestAnticipation({
      supabase,
      organizationId: 'org_1',
      actorProfileId: 'profile_1',
      recebedorId: 'recv_1',
      requestedAmountCents: 100_000,
      status: 'requested',
      internalNotes: 'Pedido inicial',
    })

    expect(out.anticipation.status).toBe('requested')
    expect(out.anticipation.providerReference).toBeNull()
    expect(supabase.db.pay_antecipacao).toHaveLength(1)
    expect(supabase.db.pay_antecipacao[0]?.is_internal).toBeTruthy()
    expect(supabase.db.pay_antecipacao_events).toHaveLength(2)
    expect(supabase.db.audit_logs).toHaveLength(2)
    expect(supabase.db.audit_logs.map((entry) => entry.action)).toEqual(['CREATE', 'REQUEST'])
  })

  test('bloqueia saldo insuficiente com mensagem de negocio', async () => {
    const supabase = createMockSupabase({
      receivers: seedReceivers(),
      ledger_entries: seedLedger(50_000),
    })

    await expect(
      requestAnticipation({
        supabase,
        organizationId: 'org_1',
        actorProfileId: 'profile_1',
        recebedorId: 'recv_1',
        requestedAmountCents: 100_000,
        status: 'requested',
      }),
    ).rejects.toThrow('O valor solicitado nao pode ultrapassar o saldo elegivel disponivel.')
  })

  test('bloqueia duplicidade e organizacao incorreta', async () => {
    const supabase = createMockSupabase({
      receivers: seedReceivers(),
      ledger_entries: seedLedger(500_000),
      pay_antecipacao: [
        {
          id: 'ant_existing',
          organization_id: 'org_1',
          recebedor_id: 'recv_1',
          requested_amount_centavos: 90_000,
          available_amount_centavos: 500_000,
          eligible_amount_centavos: 500_000,
          estimated_fee_bps: 400,
          estimated_fee_centavos: 3_600,
          fee_bps: 400,
          fee_centavos: 3_600,
          net_amount_centavos: 86_400,
          expected_settlement_days: 2,
          expected_settlement_at: '2026-07-15T00:00:00.000Z',
          status: 'requested',
          is_internal: true,
          requested_at: '2026-07-13T10:20:00.000Z',
          created_at: '2026-07-13T10:20:00.000Z',
        },
      ],
    })

    await expect(
      requestAnticipation({
        supabase,
        organizationId: 'org_1',
        actorProfileId: 'profile_1',
        recebedorId: 'recv_1',
        requestedAmountCents: 40_000,
        status: 'requested',
      }),
    ).rejects.toThrow('Ja existe uma solicitacao interna em aberto para este recebedor.')

    await expect(
      requestAnticipation({
        supabase: createMockSupabase({
          receivers: seedReceivers(),
          ledger_entries: seedLedger(500_000),
        }),
        organizationId: 'org_1',
        actorProfileId: 'profile_1',
        recebedorId: 'recv_other_org',
        requestedAmountCents: 40_000,
        status: 'requested',
      }),
    ).rejects.toThrow('Escolha um recebedor ativo, aprovado internamente e pertencente a organizacao.')
  })

  test('aprova, reprova e cancela com auditoria especifica', async () => {
    const approvedSupabase = createMockSupabase({
      receivers: seedReceivers(),
      ledger_entries: seedLedger(500_000),
      pay_antecipacao: [
        {
          id: 'ant_review',
          organization_id: 'org_1',
          recebedor_id: 'recv_1',
          requested_amount_centavos: 100_000,
          available_amount_centavos: 500_000,
          eligible_amount_centavos: 500_000,
          estimated_fee_bps: 400,
          estimated_fee_centavos: 4_000,
          fee_bps: 400,
          fee_centavos: 4_000,
          net_amount_centavos: 96_000,
          expected_settlement_days: 2,
          expected_settlement_at: '2026-07-15T00:00:00.000Z',
          status: 'under_review',
          is_internal: true,
          requested_at: '2026-07-13T10:00:00.000Z',
          created_at: '2026-07-13T10:00:00.000Z',
        },
      ],
    })

    const approved = await approveAnticipation({
      supabase: approvedSupabase,
      organizationId: 'org_1',
      actorProfileId: 'profile_1',
      id: 'ant_review',
      internalNotes: 'Aprovado para agenda interna',
    })

    expect(approved.anticipation.status).toBe('approved')
    expect(approvedSupabase.db.audit_logs.at(-1)?.action).toBe('APPROVE')

    const rejectedSupabase = createMockSupabase({
      receivers: seedReceivers(),
      ledger_entries: seedLedger(500_000),
      pay_antecipacao: [
        {
          id: 'ant_reject',
          organization_id: 'org_1',
          recebedor_id: 'recv_1',
          requested_amount_centavos: 80_000,
          available_amount_centavos: 500_000,
          eligible_amount_centavos: 500_000,
          estimated_fee_bps: 400,
          estimated_fee_centavos: 3_200,
          fee_bps: 400,
          fee_centavos: 3_200,
          net_amount_centavos: 76_800,
          expected_settlement_days: 2,
          expected_settlement_at: '2026-07-15T00:00:00.000Z',
          status: 'under_review',
          is_internal: true,
          requested_at: '2026-07-13T10:05:00.000Z',
          created_at: '2026-07-13T10:05:00.000Z',
        },
      ],
    })

    const rejected = await rejectAnticipation({
      supabase: rejectedSupabase,
      organizationId: 'org_1',
      actorProfileId: 'profile_1',
      id: 'ant_reject',
      rejectionReason: 'Documentacao divergente.',
      internalNotes: 'Revisar cadastro antes de nova tentativa',
    })

    expect(rejected.anticipation.status).toBe('rejected')
    expect(rejectedSupabase.db.audit_logs.at(-1)?.action).toBe('REJECT')

    const cancelledSupabase = createMockSupabase({
      receivers: seedReceivers(),
      ledger_entries: seedLedger(500_000),
      pay_antecipacao: [
        {
          id: 'ant_cancel',
          organization_id: 'org_1',
          recebedor_id: 'recv_1',
          requested_amount_centavos: 60_000,
          available_amount_centavos: 500_000,
          eligible_amount_centavos: 500_000,
          estimated_fee_bps: 400,
          estimated_fee_centavos: 2_400,
          fee_bps: 400,
          fee_centavos: 2_400,
          net_amount_centavos: 57_600,
          expected_settlement_days: 2,
          expected_settlement_at: '2026-07-15T00:00:00.000Z',
          status: 'approved',
          is_internal: true,
          requested_at: '2026-07-13T10:10:00.000Z',
          created_at: '2026-07-13T10:10:00.000Z',
        },
      ],
    })

    const cancelled = await cancelAnticipation({
      supabase: cancelledSupabase,
      organizationId: 'org_1',
      actorProfileId: 'profile_1',
      id: 'ant_cancel',
    })

    expect(cancelled.anticipation.status).toBe('cancelled')
    expect(cancelledSupabase.db.audit_logs.at(-1)?.action).toBe('CANCEL')
  })

  test('exclui apenas rascunho e registra DELETE', async () => {
    const supabase = createMockSupabase({
      receivers: seedReceivers(),
      ledger_entries: seedLedger(500_000),
      pay_antecipacao: [
        {
          id: 'ant_draft',
          organization_id: 'org_1',
          recebedor_id: 'recv_1',
          requested_amount_centavos: 20_000,
          available_amount_centavos: 500_000,
          eligible_amount_centavos: 500_000,
          estimated_fee_bps: 400,
          estimated_fee_centavos: 800,
          fee_bps: 400,
          fee_centavos: 800,
          net_amount_centavos: 19_200,
          expected_settlement_days: 2,
          status: 'draft',
          is_internal: true,
          created_at: '2026-07-13T10:00:00.000Z',
        },
      ],
    })

    const out = await deleteAnticipation({
      supabase,
      organizationId: 'org_1',
      actorProfileId: 'profile_1',
      id: 'ant_draft',
    })

    expect(out.ok).toBeTruthy()
    expect(supabase.db.pay_antecipacao).toHaveLength(0)
    expect(supabase.db.audit_logs.at(-1)?.action).toBe('DELETE')
  })

  test('rbac restringe as rotas da antecipacao', async () => {
    expect(canAccessPath('owner', '/antecipacao')).toBeTruthy()
    expect(canAccessPath('financeiro', '/antecipacao')).toBeTruthy()
    expect(canAccessPath('admin', '/antecipacao')).toBeFalsy()
    expect(canAccessPath('super_admin', '/admin/anticipation')).toBeTruthy()
    expect(canAccessPath('admin', '/admin/anticipation')).toBeTruthy()
    expect(canAccessPath('financeiro', '/admin/anticipation')).toBeFalsy()
  })
})

import { expect, test } from '@playwright/test'

import { canAccessPath } from '@/lib/rbac'
import {
  getPayoutInternalIssues,
  normalizePayoutInternalDraft,
  simulateInternalPayout,
  type PayoutEligibleReceiver,
} from '@/lib/payouts-internal-core'
import { createPayoutInternal, deletePayoutInternal, updatePayoutInternal } from '@/lib/payouts-internal-service'

type TableName = 'receivers' | 'payouts' | 'payout_events' | 'ledger_entries' | 'audit_logs'

type MockDatabase = {
  receivers: any[]
  payouts: any[]
  payout_events: any[]
  ledger_entries: any[]
  audit_logs: any[]
}

function createMockSupabase(seed?: Partial<MockDatabase>) {
  const db: MockDatabase = {
    receivers: seed?.receivers ? [...seed.receivers] : [],
    payouts: seed?.payouts ? [...seed.payouts] : [],
    payout_events: seed?.payout_events ? [...seed.payout_events] : [],
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
        .map((col) => col.trim())
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
        if (this.table === 'payouts') {
          db.payout_events = db.payout_events.filter((row) => !rows.some((payout) => payout.id === row.payout_id))
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
      name: 'Recebedor Ativo',
      document: '12345678901',
      type: 'pf',
      status: 'active',
      kyc_status: 'approved',
      internal_status: 'internally_approved',
      bank_account: {
        bank_code: '001',
        agency: '1234',
        account: '999888',
        account_digit: '7',
        account_type: 'checking',
      },
      created_at: '2026-07-13T10:00:00.000Z',
    },
    {
      id: 'recv_blocked',
      organization_id: 'org_1',
      name: 'Recebedor Bloqueado',
      document: '99999999999',
      type: 'pf',
      status: 'active',
      kyc_status: 'approved',
      internal_status: 'blocked',
      bank_account: {
        bank_code: '001',
        agency: '1111',
        account: '222333',
        account_digit: '1',
        account_type: 'checking',
      },
      created_at: '2026-07-13T10:05:00.000Z',
    },
    {
      id: 'recv_other_org',
      organization_id: 'org_2',
      name: 'Outro Tenant',
      document: '88888888888',
      type: 'pf',
      status: 'active',
      kyc_status: 'approved',
      internal_status: 'internally_approved',
      bank_account: {
        bank_code: '237',
        agency: '4321',
        account: '777888',
        account_digit: '9',
        account_type: 'checking',
      },
      created_at: '2026-07-13T10:06:00.000Z',
    },
  ]
}

function seedLedger(balanceAfter = 500000) {
  return [
    {
      id: 'ledger_1',
      organization_id: 'org_1',
      balance_after: balanceAfter,
      occurred_at: '2026-07-13T09:00:00.000Z',
      created_at: '2026-07-13T09:00:00.000Z',
    },
  ]
}

const eligibleReceivers: PayoutEligibleReceiver[] = [
  {
    id: 'recv_1',
    name: 'Recebedor Ativo',
    document: '12345678901',
    type: 'pf',
    status: 'active',
    kycStatus: 'approved',
    internalStatus: 'internally_approved',
    bankAccountMasked: {
      bank_code: '001',
      agency: '12***',
      account: '***888',
      account_digit: '*',
      account_type: 'checking',
      pix_key: null,
    },
  },
]

test.describe('Repasses Internos', () => {
  test('simula valor liquido e saldo restante', async () => {
    const simulation = simulateInternalPayout({
      grossAmountCents: 100000,
      feeBps: 200,
      availableBalanceCents: 350000,
    })

    expect(simulation.feeAmountCents).toBe(2000)
    expect(simulation.netAmountCents).toBe(98000)
    expect(simulation.remainingBalanceCents).toBe(250000)
  })

  test('bloqueia valor invalido e status de provider com flag desligada', async () => {
    const draft = normalizePayoutInternalDraft({
      receiverId: 'recv_1',
      grossAmountCents: 0,
      status: 'paid',
    })

    const issues = getPayoutInternalIssues({
      draft,
      eligibleReceivers,
      availableBalanceCents: 100000,
      providerEnabled: false,
    })

    expect(issues.some((issue) => issue.field === 'grossAmountCents')).toBeTruthy()
    expect(issues.some((issue) => issue.field === 'status')).toBeTruthy()
  })

  test('cria solicitacao valida, audita e nao inventa provider_reference', async () => {
    const supabase = createMockSupabase({
      receivers: seedReceivers(),
      ledger_entries: seedLedger(600000),
    })

    const payout = await createPayoutInternal({
      supabase,
      organizationId: 'org_1',
      actorProfileId: 'profile_1',
      rawDraft: {
        receiverId: 'recv_1',
        grossAmountCents: 100000,
        status: 'requested',
        internalNotes: 'Solicitacao inicial',
      },
      providerEnabled: false,
    })

    expect(payout.status).toBe('requested')
    expect(payout.providerReference).toBeNull()
    expect(supabase.db.payouts).toHaveLength(1)
    expect(supabase.db.payout_events).toHaveLength(2)
    expect(supabase.db.audit_logs).toHaveLength(2)
    expect(supabase.db.audit_logs.map((entry) => entry.action)).toEqual(['CREATE', 'REQUEST'])
  })

  test('bloqueia saldo insuficiente', async () => {
    const supabase = createMockSupabase({
      receivers: seedReceivers(),
      ledger_entries: seedLedger(50000),
    })

    await expect(
      createPayoutInternal({
        supabase,
        organizationId: 'org_1',
        actorProfileId: 'profile_1',
        rawDraft: {
          receiverId: 'recv_1',
          grossAmountCents: 100000,
          status: 'requested',
        },
        providerEnabled: false,
      }),
    ).rejects.toThrow('O valor solicitado nao pode ultrapassar o saldo disponivel.')
  })

  test('bloqueia organizacao errada e recebedor nao elegivel', async () => {
    const supabase = createMockSupabase({
      receivers: seedReceivers(),
      ledger_entries: seedLedger(500000),
    })

    await expect(
      createPayoutInternal({
        supabase,
        organizationId: 'org_1',
        actorProfileId: 'profile_1',
        rawDraft: {
          receiverId: 'recv_other_org',
          grossAmountCents: 80000,
          status: 'requested',
        },
        providerEnabled: false,
      }),
    ).rejects.toThrow('Escolha um recebedor ativo, aprovado internamente e pertencente a organizacao.')
  })

  test('bloqueia duplicidade com solicitacao aberta para o mesmo recebedor', async () => {
    const supabase = createMockSupabase({
      receivers: seedReceivers(),
      ledger_entries: seedLedger(500000),
      payouts: [
        {
          id: 'payout_existing',
          organization_id: 'org_1',
          receiver_id: 'recv_1',
          gross_amount: 90000,
          fee_amount: 1800,
          net_amount: 88200,
          status: 'requested',
          is_internal: true,
          bank_account_snapshot: {
            bank_code: '001',
            agency: '1234',
            account: '999888',
            account_digit: '7',
            account_type: 'checking',
          },
          created_at: '2026-07-13T10:10:00.000Z',
        },
      ],
    })

    await expect(
      createPayoutInternal({
        supabase,
        organizationId: 'org_1',
        actorProfileId: 'profile_1',
        rawDraft: {
          receiverId: 'recv_1',
          grossAmountCents: 45000,
          status: 'requested',
        },
        providerEnabled: false,
      }),
    ).rejects.toThrow('Ja existe uma solicitacao interna em aberto para este recebedor.')
  })

  test('aprova, reprova e cancela com auditoria especifica', async () => {
    const supabase = createMockSupabase({
      receivers: seedReceivers(),
      ledger_entries: seedLedger(500000),
      payouts: [
        {
          id: 'payout_1',
          organization_id: 'org_1',
          receiver_id: 'recv_1',
          gross_amount: 100000,
          fee_amount: 2000,
          net_amount: 98000,
          status: 'under_review',
          is_internal: true,
          bank_account_snapshot: {
            bank_code: '001',
            agency: '1234',
            account: '999888',
            account_digit: '7',
            account_type: 'checking',
          },
          requested_at: '2026-07-13T10:00:00.000Z',
          created_at: '2026-07-13T10:00:00.000Z',
        },
      ],
    })

    const approved = await updatePayoutInternal({
      supabase,
      organizationId: 'org_1',
      actorProfileId: 'profile_1',
      payoutId: 'payout_1',
      rawDraft: {
        receiverId: 'recv_1',
        grossAmountCents: 100000,
        status: 'approved',
      },
      providerEnabled: false,
    })

    expect(approved.status).toBe('approved')
    expect(supabase.db.audit_logs.at(-1)?.action).toBe('APPROVE')

    const rejected = await updatePayoutInternal({
      supabase,
      organizationId: 'org_1',
      actorProfileId: 'profile_1',
      payoutId: 'payout_1',
      rawDraft: {
        receiverId: 'recv_1',
        grossAmountCents: 100000,
        status: 'rejected',
        rejectionReason: 'Documentacao bancaria divergente.',
      },
      providerEnabled: false,
    })

    expect(rejected.status).toBe('rejected')
    expect(supabase.db.audit_logs.at(-1)?.action).toBe('REJECT')

    const supabase2 = createMockSupabase({
      receivers: seedReceivers(),
      ledger_entries: seedLedger(500000),
      payouts: [
        {
          id: 'payout_2',
          organization_id: 'org_1',
          receiver_id: 'recv_1',
          gross_amount: 60000,
          fee_amount: 1200,
          net_amount: 58800,
          status: 'approved',
          is_internal: true,
          bank_account_snapshot: {
            bank_code: '001',
            agency: '1234',
            account: '999888',
            account_digit: '7',
            account_type: 'checking',
          },
          requested_at: '2026-07-13T10:00:00.000Z',
          created_at: '2026-07-13T10:00:00.000Z',
        },
      ],
    })

    const cancelled = await updatePayoutInternal({
      supabase: supabase2,
      organizationId: 'org_1',
      actorProfileId: 'profile_1',
      payoutId: 'payout_2',
      rawDraft: {
        receiverId: 'recv_1',
        grossAmountCents: 60000,
        status: 'cancelled',
      },
      providerEnabled: false,
    })

    expect(cancelled.status).toBe('cancelled')
    expect(supabase2.db.audit_logs.at(-1)?.action).toBe('CANCEL')
  })

  test('exclui apenas rascunho e registra auditoria DELETE', async () => {
    const supabase = createMockSupabase({
      receivers: seedReceivers(),
      ledger_entries: seedLedger(500000),
      payouts: [
        {
          id: 'draft_1',
          organization_id: 'org_1',
          receiver_id: 'recv_1',
          gross_amount: 20000,
          fee_amount: 400,
          net_amount: 19600,
          status: 'draft',
          is_internal: true,
          bank_account_snapshot: {
            bank_code: '001',
            agency: '1234',
            account: '999888',
            account_digit: '7',
            account_type: 'checking',
          },
          created_at: '2026-07-13T10:00:00.000Z',
        },
      ],
    })

    const out = await deletePayoutInternal({
      supabase,
      organizationId: 'org_1',
      actorProfileId: 'profile_1',
      payoutId: 'draft_1',
    })

    expect(out.ok).toBeTruthy()
    expect(supabase.db.payouts).toHaveLength(0)
    expect(supabase.db.audit_logs.at(-1)?.action).toBe('DELETE')
  })

  test('rbac restringe a rota de repasses internos', async () => {
    expect(canAccessPath('owner', '/repasses-internos')).toBeTruthy()
    expect(canAccessPath('admin', '/repasses-internos')).toBeTruthy()
    expect(canAccessPath('financeiro', '/repasses-internos')).toBeTruthy()
    expect(canAccessPath('super_admin', '/repasses-internos')).toBeTruthy()
    expect(canAccessPath('operacional', '/repasses-internos')).toBeFalsy()
  })
})

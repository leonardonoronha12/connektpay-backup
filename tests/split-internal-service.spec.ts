import { expect, test } from '@playwright/test'

import {
  createSplitConfig,
  deleteSplitConfig,
  listSplitConfigs,
  simulateSplitConfigDraft,
  updateSplitConfig,
  updateSplitConfigStatus,
} from '@/lib/split-internal-service'

type TableName = 'receivers' | 'split_configs' | 'split_rules'

type MockDatabase = {
  receivers: any[]
  split_configs: any[]
  split_rules: any[]
}

function createMockSupabase(seed?: Partial<MockDatabase>) {
  const db: MockDatabase = {
    receivers: seed?.receivers ? [...seed.receivers] : [],
    split_configs: seed?.split_configs ? [...seed.split_configs] : [],
    split_rules: seed?.split_rules ? [...seed.split_rules] : [],
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

    not(column: string, operator: string, value: unknown) {
      if (operator === 'is') this.filters.push((row) => row[column] !== value)
      return this
    }

    order(column: string, options?: { ascending?: boolean }) {
      this.orderBy = { column, ascending: options?.ascending !== false }
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
        if (this.table === 'split_configs') {
          db.split_rules = db.split_rules.filter((row) => !rows.some((config) => config.id === row.split_config_id))
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
      id: 'recv_main',
      organization_id: 'org_1',
      name: 'Principal',
      document: '12345678901',
      type: 'pf',
      status: 'active',
      kyc_status: 'approved',
      internal_status: 'internally_approved',
      created_at: '2026-07-13T10:00:00.000Z',
    },
    {
      id: 'recv_partner',
      organization_id: 'org_1',
      name: 'Parceiro',
      document: '10987654321',
      type: 'pj',
      status: 'active',
      kyc_status: 'approved',
      internal_status: 'internally_approved',
      created_at: '2026-07-13T10:01:00.000Z',
    },
    {
      id: 'recv_other',
      organization_id: 'org_2',
      name: 'Outro tenant',
      document: '11111111111',
      type: 'pf',
      status: 'active',
      kyc_status: 'approved',
      internal_status: 'internally_approved',
      created_at: '2026-07-13T10:02:00.000Z',
    },
  ]
}

test.describe('Split Interno Service', () => {
  test('cria configuracao e registra auditoria', async () => {
    const supabase = createMockSupabase({ receivers: seedReceivers() })
    const auditEntries: any[] = []

    const created = await createSplitConfig({
      supabase,
      organizationId: 'org_1',
      actorProfileId: 'profile_1',
      rawDraft: {
        name: 'Split inicial',
        mainReceiverId: 'recv_main',
        status: 'active',
        rules: [
          { receiverId: 'recv_main', type: 'percentage', percentageBps: 8000, priority: 100 },
          { receiverId: 'recv_partner', type: 'percentage', percentageBps: 2000, priority: 90 },
        ],
      },
      deps: {
        insertAuditLogFn: async (entry: any) => {
          auditEntries.push(entry)
        },
      },
    })

    expect(created.name).toBe('Split inicial')
    expect(created.ruleCount).toBe(2)
    expect(supabase.db.split_configs).toHaveLength(1)
    expect(supabase.db.split_rules).toHaveLength(2)
    expect(auditEntries).toHaveLength(1)
    expect(auditEntries[0].action).toBe('CREATE')
    expect(auditEntries[0].entity).toBe('split_config')
  })

  test('edita configuracao, regrava regras e registra auditoria', async () => {
    const supabase = createMockSupabase({ receivers: seedReceivers() })
    const auditEntries: any[] = []

    const created = await createSplitConfig({
      supabase,
      organizationId: 'org_1',
      actorProfileId: 'profile_1',
      rawDraft: {
        name: 'Split inicial',
        mainReceiverId: 'recv_main',
        status: 'active',
        rules: [
          { receiverId: 'recv_main', type: 'percentage', percentageBps: 9000, priority: 100 },
          { receiverId: 'recv_partner', type: 'percentage', percentageBps: 1000, priority: 90 },
        ],
      },
      deps: {
        insertAuditLogFn: async (entry: any) => {
          auditEntries.push(entry)
        },
      },
    })

    const updated = await updateSplitConfig({
      supabase,
      organizationId: 'org_1',
      actorProfileId: 'profile_1',
      id: created.id,
      rawDraft: {
        name: 'Split revisado',
        mainReceiverId: 'recv_main',
        status: 'active',
        rules: [
          { receiverId: 'recv_main', type: 'percentage', percentageBps: 7000, priority: 100 },
          { receiverId: 'recv_partner', type: 'fixed', valueCents: 1500, priority: 90 },
        ],
      },
      deps: {
        insertAuditLogFn: async (entry: any) => {
          auditEntries.push(entry)
        },
      },
    })

    expect(updated.name).toBe('Split revisado')
    expect(updated.rules.some((rule: any) => rule.type === 'fixed' && rule.valueCents === 1500)).toBeTruthy()
    expect(supabase.db.split_rules.filter((row) => row.split_config_id === created.id)).toHaveLength(2)
    expect(auditEntries.at(-1)?.action).toBe('UPDATE')
  })

  test('altera status, exclui configuracao e registra auditoria', async () => {
    const supabase = createMockSupabase({ receivers: seedReceivers() })
    const auditEntries: any[] = []

    const created = await createSplitConfig({
      supabase,
      organizationId: 'org_1',
      actorProfileId: 'profile_1',
      rawDraft: {
        name: 'Split operacional',
        mainReceiverId: 'recv_main',
        status: 'active',
        rules: [
          { receiverId: 'recv_main', type: 'percentage', percentageBps: 10000, priority: 100 },
        ],
      },
      deps: {
        insertAuditLogFn: async (entry: any) => {
          auditEntries.push(entry)
        },
      },
    })

    const inactive = await updateSplitConfigStatus({
      supabase,
      organizationId: 'org_1',
      actorProfileId: 'profile_1',
      id: created.id,
      status: 'inactive',
      deps: {
        insertAuditLogFn: async (entry: any) => {
          auditEntries.push(entry)
        },
      },
    })

    expect(inactive.status).toBe('inactive')
    expect(auditEntries.at(-1)?.action).toBe('DEACTIVATE')

    const out = await deleteSplitConfig({
      supabase,
      organizationId: 'org_1',
      actorProfileId: 'profile_1',
      id: created.id,
      deps: {
        insertAuditLogFn: async (entry: any) => {
          auditEntries.push(entry)
        },
      },
    })

    expect(out.ok).toBeTruthy()
    expect(supabase.db.split_configs).toHaveLength(0)
    expect(supabase.db.split_rules).toHaveLength(0)
    expect(auditEntries.at(-1)?.action).toBe('DELETE')
  })

  test('simula distribuicao sem provider externo', async () => {
    const supabase = createMockSupabase({ receivers: seedReceivers() })

    const simulation = await simulateSplitConfigDraft({
      supabase,
      organizationId: 'org_1',
      saleAmountCents: 10000,
      rawDraft: {
        name: 'Simulador',
        mainReceiverId: 'recv_main',
        status: 'active',
        rules: [
          { receiverId: 'recv_main', type: 'percentage', percentageBps: 7000, priority: 100 },
          { receiverId: 'recv_partner', type: 'percentage', percentageBps: 3000, priority: 90 },
        ],
      },
      deps: {
        loadPayTaxaConfigFn: async () => ({ feeFixedAmount: 0n, feePercentageBps: 0, minFeeAmount: null, maxFeeAmount: null }),
      },
    })

    expect(simulation.summary.saleAmountCents).toBe(10000)
    expect(simulation.summary.receiverTotalAmount).toBe(10000)
    expect(simulation.receivers).toHaveLength(2)
  })

  test('lista apenas configuracoes da organizacao atual', async () => {
    const supabase = createMockSupabase({
      receivers: seedReceivers(),
      split_configs: [
        {
          id: 'cfg_org_1',
          organization_id: 'org_1',
          name: 'Split org 1',
          main_receiver_id: 'recv_main',
          status: 'active',
          valid_from: null,
          valid_until: null,
          internal_notes: null,
          created_at: '2026-07-13T10:00:00.000Z',
          updated_at: '2026-07-13T10:00:00.000Z',
        },
        {
          id: 'cfg_org_2',
          organization_id: 'org_2',
          name: 'Split org 2',
          main_receiver_id: 'recv_other',
          status: 'active',
          valid_from: null,
          valid_until: null,
          internal_notes: null,
          created_at: '2026-07-13T10:00:00.000Z',
          updated_at: '2026-07-13T10:00:00.000Z',
        },
      ],
      split_rules: [
        {
          id: 'rule_org_1',
          organization_id: 'org_1',
          split_config_id: 'cfg_org_1',
          receiver_id: 'recv_main',
          type: 'percentage',
          value_cents: null,
          percentage_bps: 10000,
          priority: 100,
          status: 'active',
        },
        {
          id: 'rule_org_2',
          organization_id: 'org_2',
          split_config_id: 'cfg_org_2',
          receiver_id: 'recv_other',
          type: 'percentage',
          value_cents: null,
          percentage_bps: 10000,
          priority: 100,
          status: 'active',
        },
      ],
    })

    const result = await listSplitConfigs({ supabase, organizationId: 'org_1' })

    expect(result.splitConfigs).toHaveLength(1)
    expect(result.splitConfigs[0].id).toBe('cfg_org_1')
    expect(result.eligibleReceivers.every((receiver) => receiver.id !== 'recv_other')).toBeTruthy()
  })
})

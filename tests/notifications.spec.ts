import { expect, test } from '@playwright/test'

import { buildEmail, type EmailTemplateId } from '@/lib/email-templates'
import {
  getOrCreateNotificationPreferences,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  updateNotificationPreferences,
} from '@/lib/notifications'

type TableName = 'notification_preferences' | 'notifications'

type MockDatabase = {
  notification_preferences: any[]
  notifications: any[]
}

function createMockSupabase(seed?: Partial<MockDatabase>) {
  const db: MockDatabase = {
    notification_preferences: seed?.notification_preferences ? [...seed.notification_preferences] : [],
    notifications: seed?.notifications ? [...seed.notifications] : [],
  }

  let nextId = 1

  class QueryBuilder {
    private action: 'select' | 'insert' | 'update' = 'select'
    private filters: Array<(row: any) => boolean> = []
    private selectColumns: string | null = null
    private selectOptions: { count?: 'exact'; head?: boolean } | null = null
    private orderBy: { column: string; ascending: boolean } | null = null
    private limitCount: number | null = null
    private singleMode: 'single' | 'maybeSingle' | null = null
    private insertedRows: any[] = []
    private updatePatch: Record<string, unknown> | null = null

    constructor(private readonly table: TableName) {}

    select(columns?: string, options?: { count?: 'exact'; head?: boolean }) {
      this.selectColumns = columns ?? null
      this.selectOptions = options ?? null
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

    is(column: string, value: unknown) {
      this.filters.push((row) => (row[column] ?? null) === value)
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
        const now = new Date().toISOString()
        const rows = this.applyFilters(tableRows)
        for (const row of rows) Object.assign(row, this.updatePatch ?? {}, { updated_at: now })
        const data = this.project(rows)
        if (this.singleMode === 'single') return { data: data[0] ?? null, error: data[0] ? null : new Error('Row not found') }
        if (this.singleMode === 'maybeSingle') return { data: data[0] ?? null, error: null }
        return { data, error: null }
      }

      const rows = this.applyFilters(tableRows)
      if (this.selectOptions?.count === 'exact') {
        return { data: this.selectOptions.head ? null : this.project(rows), count: rows.length, error: null }
      }
      const data = this.project(rows)
      if (this.singleMode === 'single') return { data: data[0] ?? null, error: data[0] ? null : new Error('Row not found') }
      if (this.singleMode === 'maybeSingle') return { data: data[0] ?? null, error: null }
      return { data, error: null }
    }
  }

  return {
    db,
    supabase: {
      from(table: TableName) {
        return new QueryBuilder(table)
      },
    },
  }
}

test.describe('Notificacoes (templates)', () => {
  const templates: EmailTemplateId[] = [
    'payment.approved',
    'payment.failed',
    'payment_link.created',
    'subscription.created',
    'subscription.canceled',
    'recurring.charge.paid',
    'recurring.charge.failed',
    'kyc.approved',
    'kyc.rejected',
    'anticipation.approved',
    'anticipation.executed',
    'payout.paid',
    'reconciliation.divergence',
  ]

  test('buildEmail gera subject e HTML para todos templates', async () => {
    for (const t of templates) {
      const out = buildEmail({ template: t, brandName: 'Connekt Pay', data: { id: 'x', ok: true, amount_cents: 123 } })
      expect(out.subject).toContain('Connekt Pay')
      expect(out.html).toContain('Connekt Pay')
      expect(out.html).toContain('amount_cents')
      expect(out.html).toContain('123')
    }
  })
})

test.describe('Notificacoes internas', () => {
  test('cria preferencias padrao quando a organizacao ainda nao tem registro', async () => {
    const { supabase, db } = createMockSupabase()

    const preferences = await getOrCreateNotificationPreferences(supabase, 'org_1')

    expect(preferences).toMatchObject({
      organization_id: 'org_1',
      email_enabled: true,
      sms_enabled: false,
      webhook_enabled: true,
    })
    expect(db.notification_preferences).toHaveLength(1)
    expect(db.notification_preferences[0]?.organization_id).toBe('org_1')
  })

  test('atualiza apenas os campos enviados nas preferencias', async () => {
    const { supabase, db } = createMockSupabase({
      notification_preferences: [
        {
          organization_id: 'org_1',
          email_enabled: true,
          sms_enabled: false,
          webhook_enabled: true,
          created_at: '2026-07-21T10:00:00.000Z',
          updated_at: '2026-07-21T10:00:00.000Z',
        },
      ],
    })

    const updated = await updateNotificationPreferences({
      supabase,
      organizationId: 'org_1',
      smsEnabled: true,
    })

    expect(updated).toMatchObject({
      organization_id: 'org_1',
      email_enabled: true,
      sms_enabled: true,
      webhook_enabled: true,
    })
    expect(db.notification_preferences[0]?.email_enabled).toBe(true)
    expect(db.notification_preferences[0]?.sms_enabled).toBe(true)
    expect(db.notification_preferences[0]?.webhook_enabled).toBe(true)
  })

  test('lista notificacoes abertas, ordena por data e conta apenas as nao lidas', async () => {
    const { supabase } = createMockSupabase({
      notifications: [
        {
          id: 'notif_unread_old',
          organization_id: 'org_1',
          type: 'kyc.pending',
          severity: 'warning',
          title: 'KYC aguardando analise',
          message: 'Recebedor A esta pendente.',
          href: '/admin/aprovacao-kyc',
          metadata: { receiver: 'A' },
          read_at: null,
          resolved_at: null,
          created_at: '2026-07-20T10:00:00.000Z',
        },
        {
          id: 'notif_read_new',
          organization_id: 'org_1',
          type: 'webhook.failed',
          severity: 'error',
          title: 'Falha em webhook',
          message: 'Evento precisa de reprocessamento.',
          href: '/admin/eventos',
          metadata: { event: 'evt_1' },
          read_at: '2026-07-21T08:00:00.000Z',
          resolved_at: null,
          created_at: '2026-07-21T07:00:00.000Z',
        },
        {
          id: 'notif_resolved',
          organization_id: 'org_1',
          type: 'reconciliation.divergence',
          severity: 'warning',
          title: 'Divergencia resolvida',
          message: 'Nao deve aparecer na lista aberta.',
          href: '/admin/conciliacao',
          metadata: {},
          read_at: null,
          resolved_at: '2026-07-21T09:00:00.000Z',
          created_at: '2026-07-21T06:00:00.000Z',
        },
      ],
    })

    const result = await listNotifications({
      supabase,
      organizationId: 'org_1',
      limit: 10,
      sync: false,
    })

    expect(result.unreadCount).toBe(1)
    expect(result.notifications.map((notification: { id: string }) => notification.id)).toEqual(['notif_read_new', 'notif_unread_old'])
    expect(result.notifications[0]).toMatchObject({
      id: 'notif_read_new',
      read: true,
      href: '/admin/eventos',
    })
    expect(result.notifications[1]).toMatchObject({
      id: 'notif_unread_old',
      read: false,
      severity: 'warning',
    })
  })

  test('marca uma notificacao e depois todas as abertas como lidas', async () => {
    const { supabase, db } = createMockSupabase({
      notifications: [
        {
          id: 'notif_1',
          organization_id: 'org_1',
          type: 'kyc.pending',
          severity: 'warning',
          title: 'KYC 1',
          message: 'Primeiro alerta',
          href: '/admin/aprovacao-kyc',
          metadata: {},
          read_at: null,
          resolved_at: null,
          created_at: '2026-07-21T06:00:00.000Z',
        },
        {
          id: 'notif_2',
          organization_id: 'org_1',
          type: 'webhook.failed',
          severity: 'error',
          title: 'Webhook 2',
          message: 'Segundo alerta',
          href: '/admin/eventos',
          metadata: {},
          read_at: null,
          resolved_at: null,
          created_at: '2026-07-21T07:00:00.000Z',
        },
        {
          id: 'notif_resolved',
          organization_id: 'org_1',
          type: 'reconciliation.pending',
          severity: 'info',
          title: 'Conciliacao',
          message: 'Resolvido',
          href: '/admin/conciliacao',
          metadata: {},
          read_at: null,
          resolved_at: '2026-07-21T08:00:00.000Z',
          created_at: '2026-07-21T05:00:00.000Z',
        },
      ],
    })

    const marked = await markNotificationRead({
      supabase,
      organizationId: 'org_1',
      notificationId: 'notif_1',
    })

    expect(marked).toMatchObject({
      id: 'notif_1',
      read: true,
    })
    expect(db.notifications.find((notification) => notification.id === 'notif_1')?.read_at).toBeTruthy()

    await markAllNotificationsRead({
      supabase,
      organizationId: 'org_1',
    })

    expect(db.notifications.find((notification) => notification.id === 'notif_2')?.read_at).toBeTruthy()
    expect(db.notifications.find((notification) => notification.id === 'notif_resolved')?.read_at).toBeNull()
  })
})

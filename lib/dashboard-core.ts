export function clampInt(v: unknown, min: number, max: number, fallback: number) {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.round(n)))
}

export function parsePeriod(input: { days?: unknown; start?: string | null; end?: string | null }) {
  const days = clampInt(input.days, 1, 365, 30)
  const startDate = input.start ? new Date(input.start) : null
  const endDate = input.end ? new Date(input.end) : null
  const periodEnd = endDate && !Number.isNaN(endDate.getTime()) ? endDate : new Date()
  const periodStart =
    startDate && !Number.isNaN(startDate.getTime()) ? startDate : new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  return { startIso: periodStart.toISOString(), endIso: periodEnd.toISOString(), days }
}

export function isoDay(input: string) {
  const d = new Date(input)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

export function buildDailySeriesFromPaidTransactions(input: { paidTx: Array<{ created_at?: string | null; gross_amount?: any; connekt_fee_amount?: any }> }) {
  const byDay = new Map<string, { volume: number; revenue: number }>()
  for (const t of input.paidTx) {
    const day = typeof t.created_at === 'string' ? isoDay(t.created_at) : null
    if (!day) continue
    const cur = byDay.get(day) ?? { volume: 0, revenue: 0 }
    cur.volume += Number(t.gross_amount ?? 0)
    cur.revenue += Number(t.connekt_fee_amount ?? 0)
    byDay.set(day, cur)
  }
  return Array.from(byDay.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([day, v]) => ({ day, volume_cents: v.volume, revenue_cents: v.revenue }))
}

export function buildPaymentsByMethod(input: { txs: Array<{ method?: unknown; amount?: unknown }> }) {
  const m = new Map<string, { count: number; amount: number }>()
  for (const t of input.txs) {
    const method = String(t.method ?? 'unknown')
    const cur = m.get(method) ?? { count: 0, amount: 0 }
    cur.count += 1
    cur.amount += Number(t.amount ?? 0)
    m.set(method, cur)
  }
  return Array.from(m.entries()).map(([method, v]) => ({ method, count: v.count, amount_cents: v.amount }))
}

export function buildSubscriptionsByStatus(input: { subs: Array<{ status?: unknown }> }) {
  const m = new Map<string, number>()
  for (const s of input.subs) {
    const st = String(s.status ?? 'unknown')
    m.set(st, (m.get(st) ?? 0) + 1)
  }
  return Array.from(m.entries()).map(([status, count]) => ({ status, count }))
}


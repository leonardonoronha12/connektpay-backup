export type PlanCycle = 'monthly' | 'yearly' | 'weekly'

export function nowUtcIso() {
  return new Date().toISOString()
}

export function addDaysUtc(dateIso: string, days: number) {
  const base = new Date(dateIso)
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000).toISOString()
}

export function addCycleUtc(dateIso: string, cycle: PlanCycle) {
  const d = new Date(dateIso)
  if (cycle === 'weekly') return new Date(d.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
  if (cycle === 'monthly') {
    const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()))
    return x.toISOString()
  }
  const y = new Date(Date.UTC(d.getUTCFullYear() + 1, d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()))
  return y.toISOString()
}

export function computeInitialNextChargeAt(input: { createdAtIso: string; trialDays: number; cycle: PlanCycle }) {
  const start = input.trialDays > 0 ? addDaysUtc(input.createdAtIso, input.trialDays) : input.createdAtIso
  return addCycleUtc(start, input.cycle)
}

export function calculateMRRCents(input: {
  plansById: Map<string, { amountCents: number; cycle: PlanCycle }>
  subscriptions: Array<{ planoId: string; status: string }>
}) {
  let total = 0
  for (const s of input.subscriptions) {
    const st = String(s.status ?? '')
    if (!['active', 'past_due', 'pending'].includes(st)) continue
    const plan = input.plansById.get(String(s.planoId))
    if (!plan) continue
    const amount = plan.amountCents
    if (!Number.isFinite(amount) || amount <= 0) continue
    if (plan.cycle === 'monthly') total += amount
    else if (plan.cycle === 'yearly') total += Math.round(amount / 12)
    else if (plan.cycle === 'weekly') total += Math.round((amount * 52) / 12)
  }
  return total
}

export function calculateChurnRate(input: {
  subscriptions: Array<{ status: string; canceledAt?: string | null; createdAt?: string | null }>
  windowDays: number
  nowIso: string
}) {
  const now = new Date(input.nowIso).getTime()
  const windowMs = input.windowDays * 24 * 60 * 60 * 1000
  const start = now - windowMs

  let canceled = 0
  let base = 0
  for (const s of input.subscriptions) {
    const createdAt = s.createdAt ? new Date(s.createdAt).getTime() : null
    const inBase = typeof createdAt === 'number' && createdAt <= start
    if (inBase) base += 1
    const canceledAt = s.canceledAt ? new Date(s.canceledAt).getTime() : null
    if (inBase && typeof canceledAt === 'number' && canceledAt >= start && canceledAt <= now) canceled += 1
  }
  if (base <= 0) return 0
  return canceled / base
}

export type DunningAction = 'none' | 'notify' | 'suspend' | 'cancel'

export function decideDunningAction(input: { attemptsFailed: number }) {
  if (input.attemptsFailed >= 3) return 'cancel' as const
  if (input.attemptsFailed === 2) return 'notify' as const
  if (input.attemptsFailed === 1) return 'none' as const
  return 'none' as const
}

export function validateSubscriptionPaymentMethod(method: unknown) {
  const m = String(method ?? '').trim()
  if (m === 'card') return { ok: true as const, method: 'card' as const }
  if (m === 'pix_auto') return { ok: false as const, message: 'Pix Automático ainda não está disponível.' }
  return { ok: false as const, message: 'Método de pagamento inválido.' }
}

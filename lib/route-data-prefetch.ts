'use client'

import { getMeCached } from '@/hooks/me'
import { readScreenCache, writeScreenCache } from '@/lib/screen-cache'

const inflight = new Map<string, Promise<void>>()

async function fetchJson(input: string) {
  const res = await fetch(input, { method: 'GET' })
  const json = await res.json().catch(() => null)
  return { res, json }
}

function runOnce(path: string, loader: () => Promise<void>) {
  const current = inflight.get(path)
  if (current) return current
  const next = loader().finally(() => inflight.delete(path))
  inflight.set(path, next)
  return next
}

export function prefetchRouteData(path: string) {
  if (path === '/dashboard') {
    if (readScreenCache('dashboard:30:all:all')) return Promise.resolve()
    return runOnce(path, async () => {
      const me = await getMeCached().catch(() => null)
      const role = typeof me?.role === 'string' ? me.role.trim().toLowerCase() : null
      const canLoadReceivers = role !== 'financeiro'
      const [tx, dash, rec] = await Promise.all([
        fetchJson('/api/transactions'),
        fetchJson('/api/dashboard?days=30'),
        canLoadReceivers ? fetchJson('/api/receivers') : Promise.resolve(null),
      ])
      if (!tx.res.ok || !dash.res.ok || (rec && !rec.res.ok)) return
      writeScreenCache('dashboard:30:all:all', {
        txs: Array.isArray(tx.json?.transactions) ? tx.json.transactions : [],
        metrics: dash.json?.metrics ?? null,
        receivers: Array.isArray(rec?.json?.receivers) ? rec?.json?.receivers : [],
      })
    })
  }

  if (path === '/transacoes') {
    if (readScreenCache('transactions:Todos:')) return Promise.resolve()
    return runOnce(path, async () => {
      const { res, json } = await fetchJson('/api/transactions')
      if (!res.ok) return
      writeScreenCache('transactions:Todos:', { rows: Array.isArray(json?.transactions) ? json.transactions : [] })
    })
  }

  if (path === '/links-pagamento') {
    if (readScreenCache('payment-links:list')) return Promise.resolve()
    return runOnce(path, async () => {
      const { res, json } = await fetchJson('/api/payment-links')
      if (!res.ok) return
      writeScreenCache('payment-links:list', { links: Array.isArray(json?.paymentLinks) ? json.paymentLinks : [] })
    })
  }

  if (path === '/assinaturas' || path === '/subscriptions') {
    if (readScreenCache('subscriptions:list')) return Promise.resolve()
    return runOnce(path, async () => {
      const [subs, me] = await Promise.all([fetchJson('/api/subscriptions'), getMeCached().catch(() => null)])
      if (!subs.res.ok) return
      const role = typeof me?.role === 'string' ? String(me.role) : null
      writeScreenCache('subscriptions:list', {
        subs: Array.isArray(subs.json?.subscriptions) ? subs.json.subscriptions : [],
        mrrCents: typeof subs.json?.mrrCents === 'number' ? subs.json.mrrCents : 0,
        churnRate: typeof subs.json?.churnRate === 'number' ? subs.json.churnRate : 0,
        nextChargeAt: typeof subs.json?.nextChargeAt === 'string' ? subs.json.nextChargeAt : null,
        role,
      })
    })
  }

  if (path === '/assinaturas-internas') {
    if (readScreenCache('subscriptions-internal:bootstrap')) return Promise.resolve()
    return runOnce(path, async () => {
      const { res, json } = await fetchJson('/api/subscriptions-internal')
      if (!res.ok) return
      writeScreenCache('subscriptions-internal:bootstrap', {
        plans: Array.isArray(json?.plans) ? json.plans : [],
        customers: Array.isArray(json?.customers) ? json.customers : [],
        subscriptions: Array.isArray(json?.subscriptions) ? json.subscriptions : [],
        eligibleReceivers: Array.isArray(json?.eligibleReceivers) ? json.eligibleReceivers : [],
        providerEnabled: Boolean(json?.providerEnabled),
      })
    })
  }

  if (path === '/repasses-internos') {
    if (readScreenCache('payouts-internal:bootstrap')) return Promise.resolve()
    return runOnce(path, async () => {
      const { res, json } = await fetchJson('/api/payouts-internal')
      if (!res.ok) return
      writeScreenCache('payouts-internal:bootstrap', {
        payouts: Array.isArray(json?.payouts) ? json.payouts : [],
        eligibleReceivers: Array.isArray(json?.eligibleReceivers) ? json.eligibleReceivers : [],
        availableBalanceCents: typeof json?.availableBalanceCents === 'number' ? json.availableBalanceCents : 0,
        providerEnabled: Boolean(json?.providerEnabled),
        summary: json?.summary ?? null,
      })
    })
  }

  if (path === '/recebedores') {
    if (readScreenCache('receivers:list')) return Promise.resolve()
    return runOnce(path, async () => {
      const { res, json } = await fetchJson('/api/receivers')
      if (!res.ok) return
      writeScreenCache('receivers:list', { receivers: Array.isArray(json?.receivers) ? json.receivers : [] })
    })
  }

  if (path === '/subscriptions/plans') {
    if (readScreenCache('subscription-plans:list')) return Promise.resolve()
    return runOnce(path, async () => {
      const [plans, receivers] = await Promise.all([fetchJson('/api/plans'), fetchJson('/api/receivers')])
      if (!plans.res.ok || !receivers.res.ok) return
      writeScreenCache('subscription-plans:list', {
        plans: Array.isArray(plans.json?.plans) ? plans.json.plans : [],
        receivers: Array.isArray(receivers.json?.receivers) ? receivers.json.receivers : [],
      })
    })
  }

  return Promise.resolve()
}

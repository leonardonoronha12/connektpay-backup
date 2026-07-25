import { expect, test } from '@playwright/test'

import { canAccessPath } from '@/lib/rbac'
import {
  getSubscriptionInternalIssues,
  getSubscriptionPlanIssues,
  normalizeSubscriptionInternalDraft,
  normalizeSubscriptionPlanDraft,
  simulateSubscriptionInternal,
  type SubscriptionEligibleReceiver,
} from '@/lib/subscriptions-internal-core'

const eligibleReceivers: SubscriptionEligibleReceiver[] = [
  {
    id: 'recv_1',
    name: 'Recebedor Principal',
    document: '12345678901',
    type: 'pf',
    status: 'active',
    kycStatus: 'approved',
    internalStatus: 'internally_approved',
  },
]

test.describe('Assinaturas Internas', () => {
  test('simula recorrencia limitada com calendario e receita prevista', async () => {
    const plan = normalizeSubscriptionPlanDraft({
      receiverId: 'recv_1',
      name: 'Plano Premium',
      amountCents: 19990,
      cycle: 'monthly',
      trialDays: 0,
      billingCyclesLimit: 3,
      isInfinite: false,
      status: 'active',
    })

    const simulation = simulateSubscriptionInternal({
      planDraft: plan,
      joinedAt: '2026-07-01',
      horizonCycles: 12,
    })

    expect(simulation.summary.recurrenceCount).toBe(3)
    expect(simulation.summary.estimatedRevenueCents).toBe(19990 * 3)
    expect(simulation.recurrences).toHaveLength(3)
    expect(simulation.calendar.length).toBeGreaterThan(0)
  })

  test('respeita trial e projeta a primeira cobranca futura', async () => {
    const plan = normalizeSubscriptionPlanDraft({
      receiverId: 'recv_1',
      name: 'Plano Trial',
      amountCents: 8900,
      cycle: 'monthly',
      trialDays: 7,
      isInfinite: true,
      status: 'active',
    })

    const simulation = simulateSubscriptionInternal({
      planDraft: plan,
      joinedAt: '2026-07-01',
      horizonCycles: 2,
    })

    expect(simulation.summary.trialEndsAt?.startsWith('2026-07-08')).toBeTruthy()
    expect(simulation.summary.nextChargeAt.startsWith('2026-08-08')).toBeTruthy()
  })

  test('bloqueia plano limitado sem quantidade de cobrancas', async () => {
    const plan = normalizeSubscriptionPlanDraft({
      receiverId: 'recv_1',
      name: 'Plano Invalido',
      amountCents: 10000,
      cycle: 'monthly',
      trialDays: 0,
      billingCyclesLimit: null,
      isInfinite: false,
      status: 'draft',
    })

    const issues = getSubscriptionPlanIssues({ draft: plan, eligibleReceivers })
    expect(issues.some((issue) => issue.field === 'billingCyclesLimit')).toBeTruthy()
  })

  test('bloqueia recebedor fora da organizacao elegivel', async () => {
    const plan = normalizeSubscriptionPlanDraft({
      receiverId: 'recv_other_org',
      name: 'Plano outro tenant',
      amountCents: 10000,
      cycle: 'monthly',
      trialDays: 0,
      isInfinite: true,
      status: 'draft',
    })

    const issues = getSubscriptionPlanIssues({ draft: plan, eligibleReceivers })
    expect(issues.some((issue) => issue.field === 'receiverId')).toBeTruthy()
  })

  test('bloqueia provider_synced sem integracao real', async () => {
    const draft = normalizeSubscriptionInternalDraft({
      planId: 'plan_1',
      customer: { name: 'Cliente QA', email: 'qa@connekt.com' },
      joinedAt: '2026-07-13',
      status: 'provider_synced',
    })

    const issues = getSubscriptionInternalIssues({
      draft,
      plans: [
        {
          id: 'plan_1',
          receiverId: 'recv_1',
          status: 'active',
          cycle: 'monthly',
          trialDays: 0,
          billingCyclesLimit: null,
          isInfinite: true,
          startsAt: null,
          endsAt: null,
        },
      ],
      eligibleReceivers,
      providerEnabled: false,
    })

    expect(issues.some((issue) => issue.field === 'status')).toBeTruthy()
  })

  test('bloqueia assinatura sem cliente identificavel', async () => {
    const draft = normalizeSubscriptionInternalDraft({
      planId: 'plan_1',
      customer: { name: '', email: '', document: '' },
      joinedAt: '2026-07-13',
      status: 'draft',
    })

    const issues = getSubscriptionInternalIssues({
      draft,
      plans: [
        {
          id: 'plan_1',
          receiverId: 'recv_1',
          status: 'active',
          cycle: 'monthly',
          trialDays: 0,
          billingCyclesLimit: null,
          isInfinite: true,
          startsAt: null,
          endsAt: null,
        },
      ],
      eligibleReceivers,
      providerEnabled: false,
    })

    expect(issues.some((issue) => issue.field === 'customer.name')).toBeTruthy()
    expect(issues.some((issue) => issue.field === 'customer.email')).toBeTruthy()
  })

  test('rbac restringe a rota de assinaturas internas', async () => {
    expect(canAccessPath('owner', '/assinaturas-internas')).toBeTruthy()
    expect(canAccessPath('admin', '/assinaturas-internas')).toBeTruthy()
    expect(canAccessPath('financeiro', '/assinaturas-internas')).toBeTruthy()
    expect(canAccessPath('super_admin', '/assinaturas-internas')).toBeTruthy()
    expect(canAccessPath('operacional', '/assinaturas-internas')).toBeFalsy()
  })
})

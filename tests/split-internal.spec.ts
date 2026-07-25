import { expect, test } from '@playwright/test'

import { canAccessPath } from '@/lib/rbac'
import {
  areDateRangesOverlapping,
  getSplitInternalDraftIssues,
  normalizeSplitInternalDraft,
  simulateInternalSplit,
  type SplitEligibleReceiver,
} from '@/lib/split-internal-core'

const eligibleReceivers: SplitEligibleReceiver[] = [
  {
    id: 'recv_main',
    name: 'Recebedor Principal',
    document: '12345678901',
    type: 'pf',
    status: 'active',
    kycStatus: 'approved',
    internalStatus: 'internally_approved',
  },
  {
    id: 'recv_partner',
    name: 'Parceiro Marketplace',
    document: '10987654321',
    type: 'pf',
    status: 'active',
    kycStatus: 'approved',
    internalStatus: 'internally_approved',
  },
  {
    id: 'recv_fixed',
    name: 'Recebedor Fixo',
    document: '44556677889',
    type: 'pj',
    status: 'active',
    kycStatus: 'approved',
    internalStatus: 'internally_approved',
  },
]

test.describe('Split Interno', () => {
  test('normaliza draft e simula distribuicao com multiplos recebedores', async () => {
    const draft = normalizeSplitInternalDraft({
      name: 'Split marketplace',
      mainReceiverId: 'recv_main',
      status: 'active',
      rules: [
        { receiverId: 'recv_fixed', type: 'fixed', valueCents: 1000, priority: 100 },
        { receiverId: 'recv_main', type: 'percentage', percentageBps: 7000, priority: 90 },
        { receiverId: 'recv_partner', type: 'percentage', percentageBps: 3000, priority: 80 },
      ],
    })

    const result = simulateInternalSplit({
      saleAmountCents: 10000,
      taxConfig: { feeFixedAmount: 0n, feePercentageBps: 0, minFeeAmount: null, maxFeeAmount: null },
      draft,
      eligibleReceivers,
    })

    expect(result.summary.saleAmountCents).toBe(10000)
    expect(result.summary.receiverTotalAmount).toBe(10000)

    const byId = new Map(result.receivers.map((row) => [row.receiverId, row.amountCents]))
    expect(byId.get('recv_fixed')).toBe(1000)
    expect(byId.get('recv_main')).toBe(6300)
    expect(byId.get('recv_partner')).toBe(2700)
  })

  test('bloqueia percentual acima de 100%', async () => {
    const draft = normalizeSplitInternalDraft({
      name: 'Split invalido',
      mainReceiverId: 'recv_main',
      rules: [
        { receiverId: 'recv_main', type: 'percentage', percentageBps: 7000, priority: 100 },
        { receiverId: 'recv_partner', type: 'percentage', percentageBps: 4000, priority: 90 },
      ],
    })

    const issues = getSplitInternalDraftIssues({ draft, eligibleReceivers })
    expect(issues.some((issue) => issue.message.includes('100%'))).toBeTruthy()
  })

  test('bloqueia recebedor duplicado na mesma configuracao', async () => {
    const draft = normalizeSplitInternalDraft({
      name: 'Split duplicado',
      mainReceiverId: 'recv_main',
      rules: [
        { receiverId: 'recv_main', type: 'percentage', percentageBps: 5000, priority: 100 },
        { receiverId: 'recv_main', type: 'fixed', valueCents: 1500, priority: 80 },
      ],
    })

    const issues = getSplitInternalDraftIssues({ draft, eligibleReceivers })
    expect(issues.some((issue) => issue.message.includes('apenas uma vez'))).toBeTruthy()
  })

  test('bloqueia recebedor fora da organizacao elegivel', async () => {
    const draft = normalizeSplitInternalDraft({
      name: 'Split outro tenant',
      mainReceiverId: 'recv_main',
      rules: [
        { receiverId: 'recv_main', type: 'percentage', percentageBps: 5000, priority: 100 },
        { receiverId: 'recv_other_org', type: 'percentage', percentageBps: 5000, priority: 80 },
      ],
    })

    const issues = getSplitInternalDraftIssues({ draft, eligibleReceivers })
    expect(issues.some((issue) => issue.message.includes('não está disponível'))).toBeTruthy()
  })

  test('bloqueia conflito de vigencia ativa para o mesmo recebedor principal', async () => {
    const draft = normalizeSplitInternalDraft({
      name: 'Split com conflito',
      mainReceiverId: 'recv_main',
      status: 'active',
      validFrom: '2026-07-01',
      validUntil: '2026-07-31',
      rules: [{ receiverId: 'recv_main', type: 'percentage', percentageBps: 10000, priority: 100 }],
    })

    const issues = getSplitInternalDraftIssues({
      draft,
      eligibleReceivers,
      overlappingActiveConfig: true,
    })

    expect(issues.some((issue) => issue.message.includes('outra configuração ativa'))).toBeTruthy()
  })

  test('detecta sobreposicao de vigencia', async () => {
    expect(
      areDateRangesOverlapping({
        startA: '2026-07-01',
        endA: '2026-07-31',
        startB: '2026-07-15',
        endB: '2026-08-15',
      }),
    ).toBeTruthy()

    expect(
      areDateRangesOverlapping({
        startA: '2026-07-01',
        endA: '2026-07-10',
        startB: '2026-07-11',
        endB: '2026-07-20',
      }),
    ).toBeFalsy()
  })

  test('rbac restringe a rota de split interno', async () => {
    expect(canAccessPath('owner', '/split')).toBeTruthy()
    expect(canAccessPath('admin', '/split')).toBeTruthy()
    expect(canAccessPath('super_admin', '/split')).toBeTruthy()
    expect(canAccessPath('financeiro', '/split')).toBeFalsy()
    expect(canAccessPath('operacional', '/split')).toBeFalsy()
  })
})

import { expect, test } from '@playwright/test'

import { calculateSplit, createSplitPayloadForMyGateway, mapMyGatewayErrorToUserMessage } from '@/lib/split-core'

test.describe('Split (cálculo em centavos)', () => {
  test('split com taxa percentual (bps)', async () => {
    const split = calculateSplit({
      grossAmount: 10000,
      taxConfig: { feeFixedAmount: 0n, feePercentageBps: 200, minFeeAmount: null, maxFeeAmount: null },
      rules: [{ id: 'r1', receiverId: 'recv_a', type: 'percentage', percentageBps: 10000, valueCents: null, priority: 10 }],
      defaultReceiverId: null,
    })

    expect(split.grossAmount).toBe(10000n)
    expect(split.connektFeeAmount).toBe(200n)
    expect(split.receiverTotalAmount).toBe(9800n)
    expect(split.receivers).toHaveLength(1)
    expect(split.receivers[0].amount).toBe(9800n)
  })

  test('split com taxa fixa', async () => {
    const split = calculateSplit({
      grossAmount: 10000,
      taxConfig: { feeFixedAmount: 150n, feePercentageBps: 0, minFeeAmount: null, maxFeeAmount: null },
      rules: [{ id: 'r1', receiverId: 'recv_a', type: 'percentage', percentageBps: 10000, valueCents: null, priority: 10 }],
      defaultReceiverId: null,
    })

    expect(split.connektFeeAmount).toBe(150n)
    expect(split.receiverTotalAmount).toBe(9850n)
    expect(split.receivers[0].amount).toBe(9850n)
  })

  test('split com fixo + percentual (sem float)', async () => {
    const split = calculateSplit({
      grossAmount: 10000,
      taxConfig: { feeFixedAmount: 0n, feePercentageBps: 0, minFeeAmount: null, maxFeeAmount: null },
      rules: [
        { id: 'fixed', receiverId: 'recv_a', type: 'fixed', valueCents: 1000n, percentageBps: null, priority: 20 },
        { id: 'p60', receiverId: 'recv_b', type: 'percentage', percentageBps: 6000, valueCents: null, priority: 10 },
        { id: 'p40', receiverId: 'recv_c', type: 'percentage', percentageBps: 4000, valueCents: null, priority: 10 },
      ],
      defaultReceiverId: null,
    })

    expect(split.connektFeeAmount).toBe(0n)
    expect(split.receiverTotalAmount).toBe(10000n)

    const byId = new Map(split.receivers.map((r) => [r.receiverId, r.amount]))
    expect(byId.get('recv_a')).toBe(1000n)
    expect(byId.get('recv_b')).toBe(5400n)
    expect(byId.get('recv_c')).toBe(3600n)
  })

  test('arredondamento correto em centavos (remainder distribuído por prioridade/receiverId)', async () => {
    const split = calculateSplit({
      grossAmount: 10001,
      taxConfig: null,
      rules: [
        { id: 'p50a', receiverId: 'a', type: 'percentage', percentageBps: 5000, valueCents: null, priority: 0 },
        { id: 'p50b', receiverId: 'b', type: 'percentage', percentageBps: 5000, valueCents: null, priority: 0 },
      ],
      defaultReceiverId: null,
    })

    const byId = new Map(split.receivers.map((r) => [r.receiverId, r.amount]))
    expect(byId.get('a')).toBe(5001n)
    expect(byId.get('b')).toBe(5000n)
    expect(split.receivers.reduce((acc, r) => acc + r.amount, 0n)).toBe(10001n)
  })

  test('createSplitPayloadForMyGateway usa provider_reference e valida KYC/status', async () => {
    const split = calculateSplit({
      grossAmount: 10000,
      taxConfig: null,
      rules: [{ id: 'r1', receiverId: 'recv_a', type: 'percentage', percentageBps: 10000, valueCents: null, priority: 0 }],
      defaultReceiverId: null,
    })

    const payload = createSplitPayloadForMyGateway({
      split,
      providerId: 'mygateway',
      providerEnvironment: 'production',
      receivers: [
        {
          id: 'recv_a',
          provider: 'mygateway',
          providerEnvironment: 'production',
          providerReference: 'prov_recv_1',
          status: 'active',
          kycStatus: 'approved',
        },
      ],
    })

    expect(payload.receivers).toEqual([{ receiverId: 'prov_recv_1', amount: 10000 }])
  })

  test('erro da MyGateway gera mensagem amigável', async () => {
    expect(mapMyGatewayErrorToUserMessage(new Error('timeout'))).toContain('Timeout')
    expect(mapMyGatewayErrorToUserMessage(new Error('Unauthorized'))).toContain('Credenciais inválidas')
  })

  test('split idempotente (mesmo input, mesmo output)', async () => {
    const a = calculateSplit({
      grossAmount: 12345,
      taxConfig: { feeFixedAmount: 0n, feePercentageBps: 123, minFeeAmount: null, maxFeeAmount: null },
      rules: [
        { id: 'p70', receiverId: 'recv_a', type: 'percentage', percentageBps: 7000, valueCents: null, priority: 1 },
        { id: 'p30', receiverId: 'recv_b', type: 'percentage', percentageBps: 3000, valueCents: null, priority: 1 },
      ],
      defaultReceiverId: null,
    })
    const b = calculateSplit({
      grossAmount: 12345,
      taxConfig: { feeFixedAmount: 0n, feePercentageBps: 123, minFeeAmount: null, maxFeeAmount: null },
      rules: [
        { id: 'p70', receiverId: 'recv_a', type: 'percentage', percentageBps: 7000, valueCents: null, priority: 1 },
        { id: 'p30', receiverId: 'recv_b', type: 'percentage', percentageBps: 3000, valueCents: null, priority: 1 },
      ],
      defaultReceiverId: null,
    })

    expect(a).toEqual(b)
  })
})

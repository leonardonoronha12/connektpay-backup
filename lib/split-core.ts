export type PayTaxaConfig = {
  feeFixedAmount: bigint
  feePercentageBps: number
  minFeeAmount: bigint | null
  maxFeeAmount: bigint | null
}

export type SplitRuleConfig = {
  id: string
  receiverId: string
  type: 'fixed' | 'percentage'
  valueCents: bigint | null
  percentageBps: number | null
  priority: number
}

export type ReceiverConfig = {
  id: string
  provider: string | null
  providerEnvironment: string | null
  providerReference: string | null
  status: string
  kycStatus: string
}

export type CalculatedSplit = {
  grossAmount: bigint
  connektFeeAmount: bigint
  receiverTotalAmount: bigint
  receivers: Array<{
    receiverId: string
    ruleId: string | null
    priority: number
    amount: bigint
    percentageBps: number
  }>
}

export type MyGatewaySplitPayload = {
  connektFeeAmount: number
  receivers: Array<{ receiverId: string; amount: number }>
}

export function toBigintCents(input: unknown): bigint {
  if (typeof input === 'bigint') return input
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw new Error('Invalid amount')
    if (!Number.isInteger(input)) throw new Error('Amount must be an integer (cents)')
    return BigInt(input)
  }
  if (typeof input === 'string') {
    if (!/^-?\d+$/.test(input.trim())) throw new Error('Invalid amount')
    return BigInt(input.trim())
  }
  throw new Error('Invalid amount')
}

function clampBigint(value: bigint, min: bigint | null, max: bigint | null) {
  let out = value
  if (min !== null && out < min) out = min
  if (max !== null && out > max) out = max
  return out
}

function mulDivFloor(a: bigint, b: bigint, denom: bigint) {
  if (denom === 0n) throw new Error('Division by zero')
  return (a * b) / denom
}

export function percentageBpsRounded(amount: bigint, total: bigint): number {
  if (total <= 0n) return 0
  const num = amount * 10000n * 2n + total
  const den = total * 2n
  const bps = num / den
  return Number(bps)
}

export function calculateSplit(input: {
  grossAmount: bigint | number
  taxConfig: PayTaxaConfig | null
  rules: SplitRuleConfig[]
  defaultReceiverId?: string | null
}): CalculatedSplit {
  const gross = toBigintCents(input.grossAmount)
  if (gross <= 0n) throw new Error('Gross amount must be > 0')

  const feeFixed = input.taxConfig?.feeFixedAmount ?? 0n
  const feeBps = BigInt(input.taxConfig?.feePercentageBps ?? 0)
  const feePercent = mulDivFloor(gross, feeBps, 10000n)
  let fee = feeFixed + feePercent
  fee = clampBigint(fee, input.taxConfig?.minFeeAmount ?? null, input.taxConfig?.maxFeeAmount ?? null)
  if (fee < 0n) fee = 0n
  if (fee > gross) fee = gross

  const receiverBase = gross - fee

  let rules = input.rules.slice()
  if (!rules.length) {
    const fallback = input.defaultReceiverId ?? null
    if (!fallback) throw new Error('No split rules and no default receiver')
    rules = [
      {
        id: 'implicit',
        receiverId: fallback,
        type: 'percentage',
        valueCents: null,
        percentageBps: 10000,
        priority: 0,
      },
    ]
  }

  const fixedRules = rules.filter((r) => r.type === 'fixed')
  const percRules = rules.filter((r) => r.type === 'percentage')

  let fixedSum = 0n
  const fixedAmounts = new Map<string, bigint>()
  for (const r of fixedRules) {
    const v = r.valueCents
    if (v === null) throw new Error('Missing valueCents for fixed rule')
    if (v <= 0n) throw new Error('Fixed rule value must be > 0')
    fixedSum += v
    fixedAmounts.set(r.id, v)
  }
  if (fixedSum > receiverBase) throw new Error('Split fixed amounts exceed receiver total')

  const remaining = receiverBase - fixedSum

  const percAmounts = new Map<string, bigint>()
  let percSum = 0n
  for (const r of percRules) {
    const bps = r.percentageBps
    if (bps === null) throw new Error('Missing percentageBps for percentage rule')
    if (!Number.isInteger(bps) || bps <= 0 || bps > 10000) throw new Error('Invalid percentageBps')
    const a = mulDivFloor(remaining, BigInt(bps), 10000n)
    percSum += a
    percAmounts.set(r.id, a)
  }
  if (percSum > remaining) throw new Error('Split percentage amounts exceed receiver total')

  let remainder = remaining - percSum
  const percOrder = percRules
    .slice()
    .sort((a, b) => (b.priority !== a.priority ? b.priority - a.priority : a.receiverId.localeCompare(b.receiverId)))

  if (remainder > 0n) {
    if (percOrder.length) {
      let idx = 0
      while (remainder > 0n) {
        const r = percOrder[idx % percOrder.length]
        percAmounts.set(r.id, (percAmounts.get(r.id) ?? 0n) + 1n)
        remainder -= 1n
        idx += 1
      }
    } else {
      const anyOrder = rules
        .slice()
        .sort((a, b) => (b.priority !== a.priority ? b.priority - a.priority : a.receiverId.localeCompare(b.receiverId)))
      if (!anyOrder.length) throw new Error('No receivers to allocate remainder')
      const first = anyOrder[0]
      if (first.type === 'fixed') {
        fixedAmounts.set(first.id, (fixedAmounts.get(first.id) ?? 0n) + remainder)
      } else {
        percAmounts.set(first.id, (percAmounts.get(first.id) ?? 0n) + remainder)
      }
      remainder = 0n
    }
  }

  const receiverRows: CalculatedSplit['receivers'] = []
  for (const r of rules) {
    const amount = r.type === 'fixed' ? fixedAmounts.get(r.id) ?? 0n : percAmounts.get(r.id) ?? 0n
    if (amount <= 0n) continue
    receiverRows.push({
      receiverId: r.receiverId,
      ruleId: r.id === 'implicit' ? null : r.id,
      priority: r.priority,
      amount,
      percentageBps: percentageBpsRounded(amount, gross),
    })
  }

  let receiverTotal = 0n
  for (const r of receiverRows) receiverTotal += r.amount
  if (receiverTotal !== receiverBase) throw new Error('Split result mismatch')

  return {
    grossAmount: gross,
    connektFeeAmount: fee,
    receiverTotalAmount: receiverBase,
    receivers: receiverRows.sort((a, b) => (b.priority !== a.priority ? b.priority - a.priority : a.receiverId.localeCompare(b.receiverId))),
  }
}

export function createSplitPayloadForMyGateway(input: {
  split: CalculatedSplit
  receivers: ReceiverConfig[]
  providerId: string
  providerEnvironment: string
}): MyGatewaySplitPayload {
  const receiverMap = new Map<string, ReceiverConfig>()
  for (const r of input.receivers) receiverMap.set(r.id, r)

  const payloadReceivers: MyGatewaySplitPayload['receivers'] = []
  for (const row of input.split.receivers) {
    const rc = receiverMap.get(row.receiverId)
    if (!rc) throw new Error('Receiver not found')
    if (String(rc.status) !== 'active') throw new Error('Receiver is not active')
    if (String(rc.kycStatus) !== 'approved') throw new Error('Receiver KYC not approved')
    if (!rc.providerEnvironment) throw new Error('Receiver missing provider environment')
    if (!rc.provider) throw new Error('Receiver missing provider')
    if (rc.provider !== input.providerId) throw new Error('Receiver bound to another provider')
    if (rc.providerEnvironment !== input.providerEnvironment) throw new Error('Receiver bound to another provider environment')
    if (!rc.providerReference) throw new Error('Receiver missing provider reference')
    payloadReceivers.push({ receiverId: rc.providerReference, amount: Number(row.amount) })
  }

  return {
    connektFeeAmount: Number(input.split.connektFeeAmount),
    receivers: payloadReceivers,
  }
}

export function mapMyGatewayErrorToUserMessage(e: unknown) {
  const msg = e instanceof Error ? e.message : 'Erro'
  const lower = msg.toLowerCase()
  if (lower.includes('invalid') || lower.includes('unauthorized') || lower.includes('forbidden')) return 'Credenciais inválidas do provedor financeiro.'
  if (lower.includes('timeout') || lower.includes('abort')) return 'Timeout ao comunicar com o provedor financeiro.'
  if (lower.includes('unavailable') || lower.includes('502') || lower.includes('503') || lower.includes('504')) return 'Provedor financeiro indisponível no momento.'
  return 'Falha ao processar o split no provedor financeiro.'
}

export function mapSplitConfigErrorToUserMessage(e: unknown) {
  const msg = e instanceof Error ? e.message : 'Erro'
  const lower = msg.toLowerCase()
  if (lower.includes('no split rules') || lower.includes('default receiver')) {
    return 'Split não configurado. Cadastre um recebedor aprovado e/ou regras de split.'
  }
  if (lower.includes('kyc')) return 'Recebedor com KYC não aprovado. Aprove o KYC antes de habilitar split.'
  if (lower.includes('another provider environment')) return 'Recebedor pertence a outro ambiente financeiro.'
  if (lower.includes('another provider')) return 'Recebedor pertence a outro provedor financeiro.'
  if (lower.includes('provider environment')) return 'Recebedor sem ambiente financeiro definido. Revise o cadastro antes de habilitar split.'
  if (lower.includes('provider reference')) return 'Recebedor sem vínculo com o provedor. Sincronize o recebedor antes de habilitar split.'
  if (lower.includes('exceed') || lower.includes('mismatch')) return 'Regras de split inválidas. Revise valores e percentuais.'
  return 'Não foi possível calcular o split.'
}

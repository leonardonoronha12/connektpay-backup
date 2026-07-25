import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

import { createClient } from '@supabase/supabase-js'

function loadEnv(filePath) {
  const out = {}
  const text = fs.readFileSync(filePath, 'utf8')
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const index = line.indexOf('=')
    if (index <= 0) continue
    const key = line.slice(0, index).trim()
    const value = line.slice(index + 1).trim()
    out[key] = value
  }
  return out
}

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex')
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function expectJson(response) {
  const text = await response.text()
  try {
    return text ? JSON.parse(text) : null
  } catch {
    throw new Error(`Resposta inválida (${response.status}): ${text}`)
  }
}

const env = loadEnv(path.join(process.cwd(), '.env.local'))
const previewUrl = process.argv[2]

if (!previewUrl) throw new Error('Preview URL ausente.')
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  throw new Error('Supabase não está configurado em .env.local para a validação.')
}

const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })

const now = Date.now()
const suffix = `${now}-${crypto.randomBytes(4).toString('hex')}`
const temp = {
  slugs: [],
  paymentLinkIds: [],
  transactionIds: [],
  providerSettingsBackups: new Map(),
  providerSettingsCreated: new Set(),
}

async function ensureApiKey(organizationId) {
  const rawKey = `ck_test_${crypto.randomBytes(24).toString('hex')}`
  const entry = {
    id: crypto.randomUUID(),
    name: `Phase2 Preview ${suffix}`,
    env: 'sandbox',
    prefix: rawKey.slice(0, 10),
    hash: sha256(rawKey),
    created_at: new Date().toISOString(),
    revoked_at: null,
  }

  const { data: owner, error: ownerError } = await service
    .from('profiles')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('role', 'owner')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (ownerError) throw ownerError
  assert(owner?.id, `Owner não encontrado para a organização ${organizationId}.`)

  const { data: row, error: rowError } = await service
    .from('provider_settings')
    .select('organization_id, api_keys')
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (rowError) throw rowError

  if (!temp.providerSettingsBackups.has(organizationId)) {
    temp.providerSettingsBackups.set(organizationId, row ? row.api_keys ?? [] : null)
  }

  if (!row) {
    const { error: insertError } = await service.from('provider_settings').insert({ organization_id: organizationId, api_keys: [entry] })
    if (insertError) throw insertError
    temp.providerSettingsCreated.add(organizationId)
  } else {
    const next = Array.isArray(row.api_keys) ? [...row.api_keys, entry] : [entry]
    const { error: updateError } = await service
      .from('provider_settings')
      .update({ api_keys: next })
      .eq('organization_id', organizationId)
    if (updateError) throw updateError
  }

  return {
    rawKey,
    actorProfileId: owner.id,
    headers: {
      'x-organization-id': organizationId,
      'x-api-key': rawKey,
    },
  }
}

async function cleanup() {
  if (temp.transactionIds.length) {
    await service.from('pay_split').delete().in('transaction_id', temp.transactionIds)
    await service.from('pay_transacao').delete().in('transaction_id', temp.transactionIds)
    await service.from('transactions').delete().in('id', temp.transactionIds)
  }

  if (temp.paymentLinkIds.length) {
    await service.from('payment_links').delete().in('id', temp.paymentLinkIds)
  }

  for (const [organizationId, backup] of temp.providerSettingsBackups.entries()) {
    if (temp.providerSettingsCreated.has(organizationId) && backup === null) {
      await service.from('provider_settings').delete().eq('organization_id', organizationId)
      continue
    }

    await service
      .from('provider_settings')
      .update({ api_keys: backup ?? [] })
      .eq('organization_id', organizationId)
  }
}

let summary = null

try {
  const { data: receivers, error: receiversError } = await service
    .from('receivers')
    .select('id, organization_id, status, kyc_status, created_at')
    .eq('status', 'active')
    .eq('kyc_status', 'approved')
    .order('created_at', { ascending: true })
    .limit(10)
  if (receiversError) throw receiversError

  const orgIds = [...new Set((receivers ?? []).map((row) => row.organization_id).filter(Boolean))]
  assert(orgIds.length >= 2, 'Menos de duas organizações com recebedor ativo/KYC aprovado.')

  const [orgA, orgB] = orgIds
  const apiKeyA = await ensureApiKey(orgA)
  const apiKeyB = await ensureApiKey(orgB)

  const slugA = `phase2-${suffix}-a`
  const slugB = `phase2-${suffix}-b`

  const { data: linkA, error: linkAError } = await service
    .from('payment_links')
    .insert({
      organization_id: orgA,
      name: `Phase 2 Preview ${suffix} A`,
      description: 'Validação temporária da Fase 2',
      amount: 12345,
      currency: 'BRL',
      type: 'one_time',
      methods: { pix: true, card: true },
      max_installments: 1,
      status: 'active',
      slug: slugA,
      metadata: { provider_id: 'pagarme', checkout_mode: 'internal', phase2_preview_validation: true },
    })
    .select('id, organization_id, slug')
    .single()
  if (linkAError) throw linkAError

  const { data: linkB, error: linkBError } = await service
    .from('payment_links')
    .insert({
      organization_id: orgB,
      name: `Phase 2 Preview ${suffix} B`,
      description: 'Validação temporária da Fase 2',
      amount: 22222,
      currency: 'BRL',
      type: 'one_time',
      methods: { pix: true, card: true },
      max_installments: 1,
      status: 'active',
      slug: slugB,
      metadata: { provider_id: 'pagarme', checkout_mode: 'internal', phase2_preview_validation: true },
    })
    .select('id, organization_id, slug')
    .single()
  if (linkBError) throw linkBError

  temp.paymentLinkIds.push(linkA.id, linkB.id)
  temp.slugs.push(slugA, slugB)

  const previewHealth = await fetch(`${previewUrl}/api/payment-links?slug=${encodeURIComponent(slugA)}`)
  const previewHealthJson = await expectJson(previewHealth)
  assert(previewHealth.status === 200, `Preview não conseguiu carregar o payment link temporário (${previewHealth.status}).`)
  assert(previewHealthJson?.paymentLink?.slug === slugA, 'Preview retornou payment link inesperado.')

  const attemptId = `attempt-${suffix}`
  const idemKey = `idem-${suffix}`
  const paymentBody = {
    paymentLinkSlug: slugA,
    idempotencyKey: idemKey,
    method: 'pix',
    customer: {
      name: 'Phase 2 Preview',
      email: `phase2-${suffix}@connektpay.test`,
      document: '52998224725',
    },
    metadata: {
      attempt_id: attemptId,
      source: 'phase2_preview_validation',
    },
  }

  const createResponse = await fetch(`${previewUrl}/api/payments`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-request-id': `req-${suffix}`,
      ...apiKeyA.headers,
    },
    body: JSON.stringify(paymentBody),
  })
  const createJson = await expectJson(createResponse)
  assert(
    createResponse.status === 503,
    `Status inesperado na criação interna: ${createResponse.status}. body=${JSON.stringify(createJson)}`,
  )
  assert(createJson?.code === 'provider_phase_pending', 'A criação interna não retornou provider_phase_pending.')
  assert(typeof createJson?.transactionId === 'string', 'transactionId ausente na criação interna.')
  const transactionId = createJson.transactionId
  temp.transactionIds.push(transactionId)

  const retryResponse = await fetch(`${previewUrl}/api/payments`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-request-id': `req-${suffix}`,
      ...apiKeyA.headers,
    },
    body: JSON.stringify(paymentBody),
  })
  const retryJson = await expectJson(retryResponse)
  assert(
    retryResponse.status === 503,
    `Retry retornou status inesperado: ${retryResponse.status}. body=${JSON.stringify(retryJson)}`,
  )
  assert(retryJson?.transactionId === transactionId, 'Retry não retornou a mesma transação interna.')

  const { data: txRows, error: txError } = await service
    .from('transactions')
    .select('id, organization_id, payment_link_id, status, amount, currency, method, provider, provider_reference, provider_order_id, provider_charge_id, idempotency_key, metadata, provider_error_code, provider_error_message')
    .eq('idempotency_key', createJson.idempotencyKey)
    .eq('organization_id', orgA)
  if (txError) throw txError
  assert((txRows ?? []).length === 1, 'Idempotência falhou em transactions.')
  const txRow = txRows[0]

  const { data: payTxRows, error: payTxError } = await service
    .from('pay_transacao')
    .select('transaction_id, organization_id, payment_link_id, status, provider_reference, provider_order_id, provider_charge_id, idempotency_key, split_snapshot, provider_error_code, provider_error_message')
    .eq('transaction_id', transactionId)
  if (payTxError) throw payTxError
  assert((payTxRows ?? []).length === 1, 'Idempotência falhou em pay_transacao.')
  const payTxRow = payTxRows[0]

  const { data: paySplitRows, error: paySplitError } = await service
    .from('pay_split')
    .select('id, transaction_id, organization_id, receiver_id, kind, amount, percentage_bps, rule_id')
    .eq('transaction_id', transactionId)
    .order('kind', { ascending: true })
  if (paySplitError) throw paySplitError
  const paySplitCountAfterRetry = (paySplitRows ?? []).length
  assert(paySplitCountAfterRetry > 0, 'Snapshot de split não gerou pay_split.')

  const publicTxOk = await fetch(`${previewUrl}/api/public/transactions/${transactionId}`, {
    headers: apiKeyA.headers,
  })
  const publicTxOkJson = await expectJson(publicTxOk)
  assert(publicTxOk.status === 200, `Leitura pública do tenant correto falhou (${publicTxOk.status}).`)
  assert(publicTxOkJson?.transaction?.id === transactionId, 'Leitura pública do tenant correto retornou transação inválida.')

  const publicTxForeign = await fetch(`${previewUrl}/api/public/transactions/${transactionId}`, {
    headers: apiKeyB.headers,
  })
  assert(publicTxForeign.status === 404, `Tenant estrangeiro não foi bloqueado ao ler transaction (${publicTxForeign.status}).`)

  const foreignLinkRead = await fetch(`${previewUrl}/api/public/payment-links?slug=${encodeURIComponent(slugA)}`, {
    headers: apiKeyB.headers,
  })
  assert(foreignLinkRead.status === 404, `Tenant estrangeiro não foi bloqueado ao ler payment_link (${foreignLinkRead.status}).`)

  const foreignPaymentAttempt = await fetch(`${previewUrl}/api/payments`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...apiKeyB.headers,
    },
    body: JSON.stringify({
      paymentLinkSlug: slugA,
      idempotencyKey: `foreign-${suffix}`,
      method: 'pix',
      customer: {
        name: 'Foreign Tenant',
        email: `foreign-${suffix}@connektpay.test`,
        document: '52998224725',
      },
    }),
  })
  assert(foreignPaymentAttempt.status === 404, `Tenant estrangeiro não foi bloqueado no checkout (${foreignPaymentAttempt.status}).`)

  const rpcTransactionId = crypto.randomUUID()
  const rpcIdempotency = `rpc-${suffix}`
  const rpcPayload = {
    p_transaction_id: rpcTransactionId,
    p_organization_id: orgA,
    p_customer_id: null,
    p_payment_link_id: linkA.id,
    p_amount: 777,
    p_currency: 'BRL',
    p_method: 'pix',
    p_status: 'created',
    p_provider: 'pagarme',
    p_idempotency_key: rpcIdempotency,
    p_transaction_metadata: {
      internal_transaction_id: rpcTransactionId,
      source: 'phase2_preview_validation_rpc',
    },
    p_split_summary: {
      gross_amount: 777,
      connekt_fee_amount: 0,
      receiver_total_amount: 777,
      validated_total_amount: 777,
      applied_receivers: [],
      rules: [],
      receivers: [],
    },
    p_split_rows: [
      {
        receiver_id: null,
        kind: 'connekt_fee',
        amount: 0,
        percentage_bps: 0,
        rule_id: null,
      },
    ],
  }

  const { data: rpcServiceData, error: rpcServiceError } = await service.rpc('create_internal_checkout_transaction', rpcPayload)
  if (rpcServiceError) throw rpcServiceError
  assert(Array.isArray(rpcServiceData) && rpcServiceData[0]?.transaction_id === rpcTransactionId, 'RPC não retornou a transação criada.')
  temp.transactionIds.push(rpcTransactionId)

  const { error: rpcAnonError } = await anon.rpc('create_internal_checkout_transaction', rpcPayload)
  assert(Boolean(rpcAnonError), 'RPC ficou exposta indevidamente para anon.')

  summary = {
    previewUrl,
    organizationA: orgA,
    organizationB: orgB,
    paymentLinkId: linkA.id,
    transactionId,
    rpcTransactionId,
    createStatus: createResponse.status,
    retryStatus: retryResponse.status,
    foreignReadStatus: publicTxForeign.status,
    foreignPaymentStatus: foreignPaymentAttempt.status,
    rpcAnonDenied: Boolean(rpcAnonError),
    checks: {
      previewRouteAccessible: true,
      internalTransactionCreated: txRow.id === transactionId,
      organizationIdCorrect: txRow.organization_id === orgA,
      paymentLinkIdCorrect: txRow.payment_link_id === linkA.id,
      internalTransactionIdStable: txRow.metadata?.internal_transaction_id === transactionId,
      providerPendingStatus: txRow.status === 'provider_error' && payTxRow.status === 'provider_error',
      providerReferencesNull: txRow.provider_reference === null && txRow.provider_order_id === null && txRow.provider_charge_id === null,
      providerRecordedAsPagarme: txRow.provider === 'pagarme',
      splitSnapshotPersisted: Boolean(payTxRow.split_snapshot?.validated_total_amount),
      idempotencyPersisted: txRow.idempotency_key === createJson.idempotencyKey && payTxRow.idempotency_key === createJson.idempotencyKey,
      idempotencyNoDuplicateTransaction: (txRows ?? []).length === 1,
      idempotencyNoDuplicatePayTransacao: (payTxRows ?? []).length === 1,
      idempotencyNoDuplicatePaySplit: paySplitCountAfterRetry === (paySplitRows ?? []).length,
      rpcServiceRoleWorks: true,
      rpcAnonDenied: Boolean(rpcAnonError),
      multiTenantReadBlocked: publicTxForeign.status === 404,
      multiTenantLinkBlocked: foreignLinkRead.status === 404,
      multiTenantPaymentBlocked: foreignPaymentAttempt.status === 404,
      controlledFailurePrepared:
        txRow.provider_error_code === 'provider_phase_pending' &&
        typeof txRow.provider_error_message === 'string' &&
        payTxRow.provider_error_code === 'provider_phase_pending',
      noProviderReferenceCreated: payTxRow.provider_reference === null && payTxRow.provider_order_id === null && payTxRow.provider_charge_id === null,
    },
  }

  console.log(JSON.stringify(summary, null, 2))
} finally {
  await cleanup()
}

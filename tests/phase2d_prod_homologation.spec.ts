import { expect, test, type Page } from '@playwright/test'
import fs from 'node:fs'

function parseEnvFile(content: string) {
  const out: Record<string, string> = {}
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const idx = line.indexOf('=')
    if (idx < 0) continue
    const key = line.slice(0, idx).trim()
    let value = line.slice(idx + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }
  return out
}

function getCreds() {
  const env = fs.existsSync('.env.local') ? parseEnvFile(fs.readFileSync('.env.local', 'utf8')) : {}
  const email = process.env.E2E_EMAIL || env.E2E_EMAIL
  const password = process.env.E2E_PASSWORD || env.E2E_PASSWORD
  if (!email || !password) throw new Error('Missing E2E_EMAIL/E2E_PASSWORD in env or .env.local')
  return { email, password }
}

async function login(page: Page, baseURL: string) {
  const { email, password } = getCreds()
  await page.goto(`${baseURL}/login`, { waitUntil: 'load' })
  await page.locator('input[type=email], input[autocomplete=email]').first().fill(email)
  await page.locator('input[type=password], input[autocomplete=current-password], input[name=password]').first().fill(password)
  await page.getByRole('button', { name: 'Entrar na conta' }).click()
  await page.getByRole('heading', { level: 1, name: 'Dashboard' }).waitFor({ state: 'visible', timeout: 90_000 })
}

test('Fase 2D em producao', async ({ page, baseURL }) => {
  test.setTimeout(240_000)

  const base = (baseURL || process.env.BASE_URL || '').replace(/\/$/, '')
  test.skip(base !== 'https://connektpay.vercel.app', `Teste restrito à produção homologada; BASE_URL atual: "${base}"`)

  await login(page, base)

  const bootstrap = await page.request.get(`${base}/api/payouts-internal`)
  expect(bootstrap.status()).toBe(200)
  const bootstrapJson = await bootstrap.json()
  expect(bootstrapJson.providerEnabled).toBe(false)
  expect(Array.isArray(bootstrapJson.eligibleReceivers)).toBeTruthy()
  expect(Array.isArray(bootstrapJson.payouts)).toBeTruthy()
  expect(typeof bootstrapJson.availableBalanceCents).toBe('number')
  expect(bootstrapJson.availableBalanceCents).toBeGreaterThan(500)

  const receiver = Array.isArray(bootstrapJson.eligibleReceivers) ? bootstrapJson.eligibleReceivers[0] : null
  expect(receiver?.id).toBeTruthy()

  const suffix = Date.now().toString()
  const availableBalanceCents = Number(bootstrapJson.availableBalanceCents ?? 0)
  const flowAmount = Math.min(1000, Math.max(500, availableBalanceCents - 200))
  const draftAmount = Math.max(300, flowAmount - 100)
  const rejectAmount = Math.max(200, flowAmount - 200)

  const simulate = await page.request.post(`${base}/api/payouts-internal/simulate`, {
    data: {
      receiverId: receiver.id,
      grossAmountCents: flowAmount,
      status: 'requested',
    },
  })
  expect(simulate.status()).toBe(200)
  const simulateJson = await simulate.json()
  expect(simulateJson.ok).toBe(true)
  expect(simulateJson.simulation.netAmountCents).toBeGreaterThan(0)

  const createDraft = await page.request.post(`${base}/api/payouts-internal`, {
    data: {
      receiverId: receiver.id,
      grossAmountCents: draftAmount,
      status: 'draft',
      internalNotes: `QA draft ${suffix}`,
    },
  })
  expect(createDraft.status()).toBe(201)
  const createDraftJson = await createDraft.json()
  const draftId = createDraftJson?.payout?.id
  expect(draftId).toBeTruthy()
  expect(createDraftJson?.payout?.providerReference ?? null).toBeNull()

  const updateDraft = await page.request.patch(`${base}/api/payouts-internal/${draftId}`, {
    data: {
      receiverId: receiver.id,
      grossAmountCents: draftAmount + 50,
      status: 'draft',
      internalNotes: `QA draft atualizado ${suffix}`,
    },
  })
  expect(updateDraft.status()).toBe(200)

  const deleteDraft = await page.request.delete(`${base}/api/payouts-internal/${draftId}`)
  expect(deleteDraft.status()).toBe(200)

  const createFlow = await page.request.post(`${base}/api/payouts-internal`, {
    data: {
      receiverId: receiver.id,
      grossAmountCents: flowAmount,
      status: 'requested',
      internalNotes: `QA fluxo ${suffix}`,
    },
  })
  expect(createFlow.status()).toBe(201)
  const createFlowJson = await createFlow.json()
  const flowId = createFlowJson?.payout?.id
  expect(flowId).toBeTruthy()
  expect(createFlowJson?.payout?.providerReference ?? null).toBeNull()

  const sendReview = await page.request.patch(`${base}/api/payouts-internal/${flowId}`, {
    data: {
      receiverId: receiver.id,
      grossAmountCents: flowAmount,
      status: 'under_review',
      internalNotes: `QA fluxo em analise ${suffix}`,
    },
  })
  expect(sendReview.status()).toBe(200)

  const approve = await page.request.patch(`${base}/api/payouts-internal/${flowId}`, {
    data: {
      receiverId: receiver.id,
      grossAmountCents: flowAmount,
      status: 'approved',
      internalNotes: `QA fluxo aprovado ${suffix}`,
    },
  })
  expect(approve.status()).toBe(200)

  const schedule = await page.request.patch(`${base}/api/payouts-internal/${flowId}`, {
    data: {
      receiverId: receiver.id,
      grossAmountCents: flowAmount,
      status: 'scheduled',
      scheduledFor: '2026-07-20',
      internalNotes: `QA fluxo agendado ${suffix}`,
    },
  })
  expect(schedule.status()).toBe(200)

  const detail = await page.request.get(`${base}/api/payouts-internal/${flowId}`)
  expect(detail.status()).toBe(200)
  const detailJson = await detail.json()
  expect(Array.isArray(detailJson.events)).toBeTruthy()
  expect(detailJson.events.length).toBeGreaterThan(0)

  const cancel = await page.request.patch(`${base}/api/payouts-internal/${flowId}`, {
    data: {
      receiverId: receiver.id,
      grossAmountCents: flowAmount,
      status: 'cancelled',
      scheduledFor: '2026-07-20',
      internalNotes: `QA fluxo cancelado ${suffix}`,
    },
  })
  expect(cancel.status()).toBe(200)

  const deleteCancelled = await page.request.delete(`${base}/api/payouts-internal/${flowId}`)
  expect(deleteCancelled.status()).toBe(200)

  const createReject = await page.request.post(`${base}/api/payouts-internal`, {
    data: {
      receiverId: receiver.id,
      grossAmountCents: rejectAmount,
      status: 'requested',
      internalNotes: `QA rejeicao ${suffix}`,
    },
  })
  expect(createReject.status()).toBe(201)
  const createRejectJson = await createReject.json()
  const rejectId = createRejectJson?.payout?.id
  expect(rejectId).toBeTruthy()

  const reviewReject = await page.request.patch(`${base}/api/payouts-internal/${rejectId}`, {
    data: {
      receiverId: receiver.id,
      grossAmountCents: rejectAmount,
      status: 'under_review',
      internalNotes: `QA rejeicao em analise ${suffix}`,
    },
  })
  expect(reviewReject.status()).toBe(200)

  const reject = await page.request.patch(`${base}/api/payouts-internal/${rejectId}`, {
    data: {
      receiverId: receiver.id,
      grossAmountCents: rejectAmount,
      status: 'rejected',
      rejectionReason: 'Conta em divergencia para homologacao.',
      internalNotes: `QA rejeicao concluida ${suffix}`,
    },
  })
  expect(reject.status()).toBe(200)

  const deleteRejected = await page.request.delete(`${base}/api/payouts-internal/${rejectId}`)
  expect(deleteRejected.status()).toBe(200)

  const auditLogs = await page.request.get(`${base}/api/audit-logs?q=payout_internal`)
  expect(auditLogs.status()).toBe(200)
  const auditLogsJson = await auditLogs.json()
  const auditRows = Array.isArray(auditLogsJson.auditLogs) ? auditLogsJson.auditLogs : []
  const actions = auditRows.map((item: any) => String(item.action ?? ''))
  const entities = auditRows.map((item: any) => String(item.entity ?? ''))

  expect(entities.includes('payout_internal')).toBeTruthy()
  expect(actions.includes('CREATE')).toBeTruthy()
  expect(actions.includes('REQUEST')).toBeTruthy()
  expect(actions.includes('UPDATE')).toBeTruthy()
  expect(actions.includes('APPROVE')).toBeTruthy()
  expect(actions.includes('REJECT')).toBeTruthy()
  expect(actions.includes('SCHEDULE')).toBeTruthy()
  expect(actions.includes('CANCEL')).toBeTruthy()
  expect(actions.includes('DELETE')).toBeTruthy()
})

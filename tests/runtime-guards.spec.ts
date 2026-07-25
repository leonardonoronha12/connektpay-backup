import { expect, test } from '@playwright/test'

import {
  buildStableRequestKey,
  checkRuntimeRateLimit,
  claimRuntimeReplayWindow,
  claimRuntimeSingleFlight,
  getRequestClientIp,
  isAuthorizedCronRequest,
  releaseRuntimeSingleFlight,
  resetRuntimeGuardsForTest,
} from '@/lib/runtime-guards'

test.describe('runtime guards', () => {
  test.beforeEach(() => {
    resetRuntimeGuardsForTest()
  })

  test('rate limit em memoria bloqueia excesso dentro da janela', async () => {
    const first = checkRuntimeRateLimit({ key: 'login:127.0.0.1', limit: 2, windowMs: 60_000, now: 1_000 })
    const second = checkRuntimeRateLimit({ key: 'login:127.0.0.1', limit: 2, windowMs: 60_000, now: 2_000 })
    const third = checkRuntimeRateLimit({ key: 'login:127.0.0.1', limit: 2, windowMs: 60_000, now: 3_000 })

    expect(first.allowed).toBeTruthy()
    expect(second.allowed).toBeTruthy()
    expect(third.allowed).toBeFalsy()
    expect(third.retryAfterMs).toBeGreaterThan(0)
  })

  test('replay window bloqueia reenvio identico dentro do TTL', async () => {
    const requestKey = buildStableRequestKey(['payment-link', 'pl_1', 'pix', 'cliente@acme.test'])
    const first = claimRuntimeReplayWindow({ key: requestKey, ttlMs: 30_000, now: 10_000 })
    const second = claimRuntimeReplayWindow({ key: requestKey, ttlMs: 30_000, now: 20_000 })
    const third = claimRuntimeReplayWindow({ key: requestKey, ttlMs: 30_000, now: 50_001 })

    expect(first.claimed).toBeTruthy()
    expect(second.claimed).toBeFalsy()
    expect(third.claimed).toBeTruthy()
  })

  test('single flight impede execucao concorrente do worker', async () => {
    const first = claimRuntimeSingleFlight({ key: 'events:process-pending', ttlMs: 120_000, now: 500 })
    const second = claimRuntimeSingleFlight({ key: 'events:process-pending', ttlMs: 120_000, now: 900 })

    expect(first.claimed).toBeTruthy()
    expect(second.claimed).toBeFalsy()

    releaseRuntimeSingleFlight('events:process-pending')

    const third = claimRuntimeSingleFlight({ key: 'events:process-pending', ttlMs: 120_000, now: 1_000 })
    expect(third.claimed).toBeTruthy()
  })

  test('cron auth aceita apenas Bearer com CRON_SECRET', async () => {
    const ok = new Request('https://connektpay.test/api/events/process-pending', {
      headers: { authorization: 'Bearer cron-secret-123' },
    })
    const invalid = new Request('https://connektpay.test/api/events/process-pending', {
      headers: { authorization: 'cron-secret-123' },
    })

    expect(isAuthorizedCronRequest(ok, 'cron-secret-123')).toBeTruthy()
    expect(isAuthorizedCronRequest(invalid, 'cron-secret-123')).toBeFalsy()
  })

  test('client ip usa x-forwarded-for quando disponivel', async () => {
    const request = new Request('https://connektpay.test/api/payments', {
      headers: { 'x-forwarded-for': '203.0.113.10, 10.0.0.1' },
    })
    expect(getRequestClientIp(request)).toBe('203.0.113.10')
  })
})

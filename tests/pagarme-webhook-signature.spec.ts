import { expect, test } from '@playwright/test'

import {
  createBasicAuthorizationHeader,
  getPagarmeWebhookBasicAuthConfig,
  isPagarmeWebhookBasicAuthConfigured,
  verifyPagarmeWebhookBasicAuth,
} from '@/lib/webhook-basic-auth'
import { buildWebhookProviderEventId } from '@/lib/webhook-signature'

test.describe('Pagar.me webhook basic auth helpers', () => {
  test('considera o webhook configurado somente com usuario e senha', async () => {
    const config = {
      username: 'webhook-user',
      password: 'webhook-pass',
    }

    expect(isPagarmeWebhookBasicAuthConfigured(config)).toBeTruthy()
    expect(isPagarmeWebhookBasicAuthConfigured({ username: 'webhook-user', password: null })).toBeFalsy()
  })

  test('aceita credenciais Basic Auth corretas', async () => {
    const headerValue = createBasicAuthorizationHeader({
      username: 'webhook-user',
      password: 's3nh@-forte',
    })

    expect(
      verifyPagarmeWebhookBasicAuth(headerValue, {
        username: 'webhook-user',
        password: 's3nh@-forte',
      })
    ).toEqual({ ok: true, username: 'webhook-user' })
  })

  test('rejeita Authorization ausente, Bearer e Base64 inválido', async () => {
    expect(
      verifyPagarmeWebhookBasicAuth(null, {
        username: 'webhook-user',
        password: 'webhook-pass',
      })
    ).toEqual({ ok: false, reason: 'missing_authorization' })

    expect(
      verifyPagarmeWebhookBasicAuth('Bearer token', {
        username: 'webhook-user',
        password: 'webhook-pass',
      })
    ).toEqual({ ok: false, reason: 'invalid_scheme' })

    expect(
      verifyPagarmeWebhookBasicAuth('Basic ###', {
        username: 'webhook-user',
        password: 'webhook-pass',
      })
    ).toEqual({ ok: false, reason: 'invalid_base64' })
  })

  test('rejeita usuario incorreto e senha incorreta', async () => {
    const wrongUserHeader = createBasicAuthorizationHeader({
      username: 'wrong-user',
      password: 'webhook-pass',
    })
    const wrongPasswordHeader = createBasicAuthorizationHeader({
      username: 'webhook-user',
      password: 'wrong-pass',
    })

    expect(
      verifyPagarmeWebhookBasicAuth(wrongUserHeader, {
        username: 'webhook-user',
        password: 'webhook-pass',
      })
    ).toEqual({ ok: false, reason: 'invalid_username' })

    expect(
      verifyPagarmeWebhookBasicAuth(wrongPasswordHeader, {
        username: 'webhook-user',
        password: 'webhook-pass',
      })
    ).toEqual({ ok: false, reason: 'invalid_password' })
  })

  test('aceita senha com caracteres especiais e dois-pontos', async () => {
    const password = 'P@s$w0rd:segmento/final?ok='
    const headerValue = createBasicAuthorizationHeader({
      username: 'webhook-user',
      password,
    })

    expect(
      verifyPagarmeWebhookBasicAuth(headerValue, {
        username: 'webhook-user',
        password,
      })
    ).toEqual({ ok: true, username: 'webhook-user' })
  })

  test('nao escreve credenciais em logs durante a validacao', async () => {
    const originalLog = console.log
    const originalWarn = console.warn
    const originalError = console.error
    const calls: string[] = []

    console.log = (...args: unknown[]) => {
      calls.push(args.map(String).join(' '))
    }
    console.warn = (...args: unknown[]) => {
      calls.push(args.map(String).join(' '))
    }
    console.error = (...args: unknown[]) => {
      calls.push(args.map(String).join(' '))
    }

    try {
      const headerValue = createBasicAuthorizationHeader({
        username: 'webhook-user',
        password: 'sup3r-secret',
      })

      verifyPagarmeWebhookBasicAuth(headerValue, {
        username: 'webhook-user',
        password: 'wrong-password',
      })
    } finally {
      console.log = originalLog
      console.warn = originalWarn
      console.error = originalError
    }

    expect(calls).toEqual([])
  })

  test('expoe a configuracao do ambiente sem usar webhook secret', async () => {
    const originalUsername = process.env.PAGARME_WEBHOOK_USERNAME
    const originalPassword = process.env.PAGARME_WEBHOOK_PASSWORD
    process.env.PAGARME_WEBHOOK_USERNAME = 'webhook-user'
    process.env.PAGARME_WEBHOOK_PASSWORD = 'webhook-pass'

    try {
      expect(getPagarmeWebhookBasicAuthConfig()).toEqual({
        username: 'webhook-user',
        password: 'webhook-pass',
      })
    } finally {
      process.env.PAGARME_WEBHOOK_USERNAME = originalUsername
      process.env.PAGARME_WEBHOOK_PASSWORD = originalPassword
    }
  })

  test('mantem idempotencia usando o id top-level do evento', async () => {
    const event = {
      id: 'hook_fixed_id',
      type: 'order.paid',
      data: { id: 'or_provider_1', event_id: 'evt_internal_should_not_win' },
    }
    const rawBody = JSON.stringify(event)

    expect(buildWebhookProviderEventId(event, rawBody)).toBe('hook_fixed_id')
    expect(buildWebhookProviderEventId(event, rawBody)).toBe('hook_fixed_id')
  })
})

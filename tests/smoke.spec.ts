import { test, expect } from '@playwright/test'

test('redirect de telas protegidas sem sessão', async ({ request, baseURL }) => {
  const r1 = await request.get(`${baseURL}/dashboard`, { maxRedirects: 0 })
  expect([302, 303, 307, 308]).toContain(r1.status())
  expect(r1.headers()['location']).toContain('/login')

  const r2 = await request.get(`${baseURL}/admin/painel`, { maxRedirects: 0 })
  expect([302, 303, 307, 308]).toContain(r2.status())
  expect(r2.headers()['location']).toContain('/login')
})

test('API pública sem API key e com API key inválida', async ({ request, baseURL }) => {
  const r1 = await request.get(`${baseURL}/api/public/payment-links`)
  expect(r1.status()).toBe(401)

  const r2 = await request.get(`${baseURL}/api/public/payment-links`, {
    headers: {
      'x-organization-id': '00000000-0000-0000-0000-000000000000',
      'x-api-key': 'ck_test_invalid',
    },
  })
  expect(r2.status()).toBe(401)
})

test('webhook sem autorizacao e com autorizacao inválida', async ({ request, baseURL }) => {
  const payload = { type: 'payment.paid', data: { id: 'evt_test' } }

  const r1 = await request.post(`${baseURL}/api/webhooks`, { data: payload })
  expect([200, 401, 503]).toContain(r1.status())

  const r2 = await request.post(`${baseURL}/api/webhooks`, {
    data: payload,
    headers: { authorization: 'Basic ###' },
  })
  expect([200, 401, 503]).toContain(r2.status())
})

test('MyGateway sem credenciais retorna erro controlado', async ({ request, baseURL }) => {
  const r1 = await request.post(`${baseURL}/api/payments`, { data: { method: 'pix', amount: 100 } })
  expect([401, 501, 503]).toContain(r1.status())

  const r2 = await request.post(`${baseURL}/api/public/payments`, {
    data: { method: 'pix', amount: 100 },
    headers: {
      'x-organization-id': '00000000-0000-0000-0000-000000000000',
      'x-api-key': 'ck_test_invalid',
    },
  })
  expect([401, 501, 503]).toContain(r2.status())
})

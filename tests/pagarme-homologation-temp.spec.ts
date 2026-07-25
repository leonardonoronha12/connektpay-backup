import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test } from '@playwright/test'

import { closeAssistantIfVisible, getBrowserCreds, loginViaUi } from '@/tests/helpers/e2e-auth'

test('cria link interno da Connekt Pay na Preview sem provider_url novo da Pagar.me', async ({ page, baseURL }) => {
  test.skip(!baseURL, 'BASE_URL não configurado.')

  const creds = await getBrowserCreds(baseURL!, 'owner')

  const artifactPath = path.join(os.tmpdir(), 'pagarme-homologation-create-link.json')

  try {
    await loginViaUi(page, baseURL!, creds, 120_000, { allowDashboardFallback: true })
    await closeAssistantIfVisible(page, { waitForAutoOpen: true })

    const createResponse = await page.request.post(new URL('/api/payment-links', baseURL!).toString(), {
      data: {
        name: `Webhook Sandbox ${Date.now()}`,
        description: 'Homologacao real do webhook Pagar.me Sandbox.',
        amountBRL: '120,00',
        pix: false,
        card: true,
        maxInstallments: 2,
        type: 'one_time',
      },
    })
    const createJson = await createResponse.json().catch(() => null)
    expect(createResponse.ok(), `Falha ao criar link: ${createResponse.status()} ${String(createJson?.error ?? '')}`).toBeTruthy()

    const slug = String(createJson?.paymentLink?.slug ?? '').trim()
    expect(slug).toBeTruthy()

    const detailsResponse = await page.request.get(new URL(`/api/payment-links?slug=${encodeURIComponent(slug)}`, baseURL!).toString())
    const detailsJson = await detailsResponse.json().catch(() => null)
    expect(detailsResponse.ok(), `Falha ao consultar link: ${detailsResponse.status()} ${String(detailsJson?.error ?? '')}`).toBeTruthy()

    const providerUrl = String(detailsJson?.paymentLink?.provider_url ?? '').trim()
    const providerStatus = String(detailsJson?.paymentLink?.provider_status ?? '').trim()
    const providerSyncOk = Boolean(createJson?.providerSync?.ok)
    const providerSyncMessage = String(createJson?.providerSync?.message ?? '').trim()
    fs.writeFileSync(
      artifactPath,
      JSON.stringify({ artifactPath, createStatus: createResponse.status(), createJson, detailsStatus: detailsResponse.status(), detailsJson }, null, 2),
      'utf8'
    )
    expect(providerUrl).toBe('')
    expect(providerSyncOk).toBeFalsy()
    expect(providerSyncMessage).toMatch(/checkout white-label da Connekt Pay|checkout hospedado/i)
  } finally {
    // Preserva o estado para inspeção do banco e troubleshooting do provider.
  }
})

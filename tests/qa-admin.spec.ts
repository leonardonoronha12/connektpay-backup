import { expect, test } from '@playwright/test'
import { closeAssistantIfVisible } from './helpers/e2e-auth'
import {
  createQaSession,
  generateValidCNPJ,
  gotoAndExpectHeading,
  isMobileProject,
  loginWithQaSession,
  startQaCapture,
  uniqueName,
} from './helpers/qa-suite'

test.describe('QA Admin And Ops', () => {
  test('admin valida paginas criticas e cria dados proprios sem depender de outra execucao', async ({ page, baseURL }, testInfo) => {
    test.skip(isMobileProject(testInfo), 'Fluxos mobile ficam isolados em qa-mobile.spec.ts.')
    const session = await createQaSession(baseURL, 'owner', { preferStaticCreds: true })
    const capture = startQaCapture(page, baseURL)
    try {
      const openSection = async (path: string, heading: string | RegExp) => {
        await gotoAndExpectHeading(page, path, heading)
        await closeAssistantIfVisible(page)
        await page.waitForTimeout(150)
        capture.reset()
        await page.waitForTimeout(250)
        await capture.assertNoUnexpected()
      }

      await loginWithQaSession(page, session)

      await openSection('/recebedores', 'Recebedores')

      const receiverName = uniqueName('Recebedor Demo')
      const receiverDocument = generateValidCNPJ()
      const createReceiverResponse = await page.request.post(new URL('/api/receivers', session.baseURL).toString(), {
        data: {
          name: receiverName,
          document: receiverDocument,
        },
      })
      const createReceiverPayload = await createReceiverResponse.json().catch(() => null)
      expect(
        createReceiverResponse.status(),
        `POST /api/receivers: ${String(createReceiverPayload?.error ?? '')}`.trim(),
      ).toBe(201)

      await openSection('/recebedores', 'Recebedores')

      const receiverCard = page.locator(`text=${receiverName}`).first()
      await receiverCard.waitFor({ timeout: 30_000 })
      await receiverCard.click()
      const receiverDialog = page.getByRole('dialog', { name: /Recebedor e KYC interno/i })
      await expect(receiverDialog).toBeVisible()
      await receiverDialog.getByRole('button', { name: 'Fechar' }).click()
      await capture.assertNoUnexpected()

      await openSection('/admin/aprovacao-kyc', 'Aprovação KYC')
      await expect(page.getByRole('button', { name: /Exportar CSV/i }).first()).toBeVisible()
      const docsButton = page.getByRole('button', { name: /Docs/i }).first()
      if (await docsButton.isVisible().catch(() => false)) {
        await docsButton.click()
        await expect(page.getByText('Documentos KYC')).toBeVisible()
        await page.getByRole('button', { name: 'Fechar' }).click()
        await capture.assertNoUnexpected()
      }

      await openSection('/admin/conciliacao', 'Conciliação Financeira')
      await expect(page.getByRole('button', { name: /Exportar CSV/i }).first()).toBeVisible()

      await openSection('/admin/anticipation', /Antecipações/i)
      await expect(page.getByRole('button', { name: /Exportar/i }).first()).toBeVisible()

      await openSection('/split', 'Split Interno')
      await expect(page.getByRole('button', { name: /Exportar CSV/i }).first()).toBeVisible()

      await openSection('/assinaturas-internas', 'Assinaturas Internas')
      await expect(page.getByRole('button', { name: /Exportar CSV/i }).first()).toBeVisible({ timeout: 30_000 })

    } finally {
      capture.stop()
      await session.cleanup()
    }
  })
})

import 'server-only'

import { getAcquirerProvider } from '@/lib/acquirer'
import { ProviderError, mapProviderErrorToUserMessage } from '@/lib/acquirer/provider-error'
import type { CreatePaymentRequest, PaymentResponse } from '@/lib/acquirer/types'

export type ProviderPaymentSyncResult =
  | { ok: true; payment: PaymentResponse }
  | { ok: false; code: string; message: string; status: number }

export async function createProviderPayment(input: {
  request: CreatePaymentRequest
  fallbackMessage?: string
}): Promise<ProviderPaymentSyncResult> {
  const provider = getAcquirerProvider()
  try {
    const payment = await provider.createPayment(input.request)
    return { ok: true, payment }
  } catch (error) {
    return {
      ok: false,
      code: error instanceof ProviderError ? error.code : 'provider_error',
      message: mapProviderErrorToUserMessage(error, input.fallbackMessage ?? 'Falha ao processar o pagamento no provedor financeiro.'),
      status: error instanceof ProviderError ? error.status : 502,
    }
  }
}

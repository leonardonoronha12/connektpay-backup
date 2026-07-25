import { isStandalonePaymentsEnabled } from '@/lib/env'

export const STANDALONE_PAYMENTS_DISABLED_MESSAGE =
  'Pagamento avulso via PIX/cartao sem Payment Link ainda nao esta habilitado neste ambiente. Use um Payment Link ativo ou habilite STANDALONE_PAYMENTS_ENABLED=true apos a homologacao do contrato.'

export function isStandalonePaymentRequest(paymentLinkSlug?: string | null) {
  return !(typeof paymentLinkSlug === 'string' && paymentLinkSlug.trim().length > 0)
}

export function getStandalonePaymentsBlockMessage(paymentLinkSlug?: string | null) {
  if (!isStandalonePaymentRequest(paymentLinkSlug)) return null
  if (isStandalonePaymentsEnabled()) return null
  return STANDALONE_PAYMENTS_DISABLED_MESSAGE
}

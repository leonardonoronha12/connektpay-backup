import type { CreatePaymentLinkRequest, PaymentLinkResponse } from '@/lib/acquirer/types'
import { ProviderError } from '@/lib/acquirer/provider-error'

type AcceptedPaymentMethod = 'pix' | 'credit_card' | 'boleto'

type PagarMePaymentLinkItem = {
  name: string
  description?: string
  amount: number
  default_quantity: number
}

export type PagarMePaymentLinkPayload = {
  type: 'order'
  is_building: boolean
  name: string
  order_code?: string
  payment_settings: {
    accepted_payment_methods: AcceptedPaymentMethod[]
    credit_card_settings?: {
      operation_type: 'auth_and_capture'
      installments: Array<{
        number: number
        total: number
      }>
    }
    pix_settings?: {
      expires_in: number
    }
  }
  cart_settings: {
    items: PagarMePaymentLinkItem[]
  }
  expires_at?: string
  max_paid_sessions?: number
}

function sanitizeText(value: string | null | undefined) {
  return String(value ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function toIsoDate(value: string | null | undefined) {
  const input = sanitizeText(value)
  if (!input) return null

  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(input)) {
    const [date, time] = input.split(' ')
    const iso = new Date(`${date}T${time}:00`).toISOString()
    return Number.isNaN(Date.parse(iso)) ? null : iso
  }

  const parsed = Date.parse(input)
  if (!Number.isFinite(parsed)) return null
  return new Date(parsed).toISOString()
}

function mapAcceptedPaymentMethods(input: CreatePaymentLinkRequest['methods']) {
  const methods: AcceptedPaymentMethod[] = []
  if (input?.pix !== false) methods.push('pix')
  if (input?.card !== false) methods.push('credit_card')
  return methods
}

function normalizeAmount(amount: number) {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new ProviderError({
      provider: 'pagarme',
      code: 'bad_request',
      status: 400,
      retryable: false,
      message: 'Invalid amount for Pagar.me payment link.',
    })
  }
  return amount
}

function normalizeInstallments(input: CreatePaymentLinkRequest, amount: number) {
  const rawMax = typeof input.maximumQuantityOfInstallments === 'number' ? Math.round(input.maximumQuantityOfInstallments) : 1
  const maxInstallments = Math.max(1, Math.min(12, rawMax))
  return Array.from({ length: maxInstallments }, (_, index) => ({
    number: index + 1,
    total: amount,
  }))
}

export function createPagarMePaymentLinkPayload(input: CreatePaymentLinkRequest): PagarMePaymentLinkPayload {
  const name = sanitizeText(input.name)
  if (!name) {
    throw new ProviderError({
      provider: 'pagarme',
      code: 'bad_request',
      status: 400,
      retryable: false,
      message: 'Missing payment link name.',
    })
  }
  if (name.length > 64) {
    throw new ProviderError({
      provider: 'pagarme',
      code: 'bad_request',
      status: 400,
      retryable: false,
      message: 'Payment link name exceeds Pagar.me limit.',
    })
  }

  const description = sanitizeText(input.description)
  const amount = normalizeAmount(input.amount.amount)
  const acceptedPaymentMethods = mapAcceptedPaymentMethods(input.methods)
  if (!acceptedPaymentMethods.length) {
    throw new ProviderError({
      provider: 'pagarme',
      code: 'bad_request',
      status: 400,
      retryable: false,
      message: 'At least one accepted payment method is required.',
    })
  }

  const payload: PagarMePaymentLinkPayload = {
    type: 'order',
    is_building: false,
    name,
    payment_settings: {
      accepted_payment_methods: acceptedPaymentMethods,
      ...(acceptedPaymentMethods.includes('credit_card')
        ? {
            credit_card_settings: {
              operation_type: 'auth_and_capture',
              installments: normalizeInstallments(input, amount),
            },
          }
        : null),
      ...(acceptedPaymentMethods.includes('pix')
        ? {
            pix_settings: {
              expires_in: 60,
            },
          }
        : null),
    },
    cart_settings: {
      items: [
        {
          name,
          ...(description ? { description } : null),
          amount,
          default_quantity: 1,
        },
      ],
    },
  }

  const orderCode = sanitizeText(input.metadata?.payment_link_id ?? input.metadata?.slug ?? '')
  if (orderCode) payload.order_code = orderCode.slice(0, 52)

  const expiresAt = toIsoDate(input.validity ?? null)
  if (input.validity && !expiresAt) {
    throw new ProviderError({
      provider: 'pagarme',
      code: 'bad_request',
      status: 400,
      retryable: false,
      message: 'Invalid payment link expiration.',
    })
  }
  if (expiresAt) payload.expires_at = expiresAt

  if (typeof input.numberOfAllowedSales === 'number') {
    const maxPaidSessions = Math.round(input.numberOfAllowedSales)
    if (maxPaidSessions <= 0) {
      throw new ProviderError({
        provider: 'pagarme',
        code: 'bad_request',
        status: 400,
        retryable: false,
        message: 'Invalid max paid sessions value.',
      })
    }
    payload.max_paid_sessions = maxPaidSessions
  }

  return payload
}

export function sanitizePagarMePaymentLinkResponse(payload: Record<string, unknown>) {
  return {
    id: typeof payload.id === 'string' ? payload.id : null,
    status: typeof payload.status === 'string' ? payload.status : null,
    url: typeof payload.url === 'string' ? payload.url : null,
    name: typeof payload.name === 'string' ? payload.name : null,
    type: typeof payload.type === 'string' ? payload.type : null,
    created_at: typeof payload.created_at === 'string' ? payload.created_at : null,
    updated_at: typeof payload.updated_at === 'string' ? payload.updated_at : null,
    expires_at: typeof payload.expires_at === 'string' ? payload.expires_at : null,
  }
}

export function normalizePagarMePaymentLinkStatus(value: unknown) {
  const raw = String(value ?? '').trim().toLowerCase()
  if (!raw) return 'pending'
  if (raw === 'active') return 'active'
  if (raw === 'inactive' || raw === 'disabled') return 'inactive'
  if (raw === 'expired' || raw === 'closed') return 'expired'
  if (raw === 'building') return 'building'
  return raw
}

export function normalizePagarMePaymentLinkResponse(payload: Record<string, unknown>): PaymentLinkResponse {
  const id = typeof payload.id === 'string' ? payload.id.trim() : ''
  if (!id) {
    throw new ProviderError({
      provider: 'pagarme',
      code: 'unexpected_response',
      status: 502,
      retryable: false,
      message: 'Pagar.me returned an invalid payment link response.',
      details: sanitizePagarMePaymentLinkResponse(payload),
    })
  }

  return {
    id,
    status: normalizePagarMePaymentLinkStatus(payload.status),
    url: typeof payload.url === 'string' ? payload.url.trim() : null,
    metadata: {
      raw: sanitizePagarMePaymentLinkResponse(payload),
    },
  }
}

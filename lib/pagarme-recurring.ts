import 'server-only'

import { ProviderError } from '@/lib/acquirer/provider-error'

function safeTrim(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function pickFirstString(...values: unknown[]) {
  for (const value of values) {
    const trimmed = safeTrim(value)
    if (trimmed) return trimmed
  }
  return null
}

function buildBasicAuthorization(secretKey: string) {
  return `Basic ${Buffer.from(`${secretKey}:`, 'utf8').toString('base64')}`
}

function parseJsonSafely(text: string) {
  if (!text) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

function mapStatusToProviderCode(status: number) {
  if (status === 400) return 'bad_request' as const
  if (status === 401 || status === 403) return 'invalid_credentials' as const
  if (status === 404) return 'not_found' as const
  if (status === 409) return 'conflict' as const
  if (status === 412 || status === 422) return 'unprocessable' as const
  if (status === 429) return 'rate_limited' as const
  if (status >= 500) return 'unavailable' as const
  return 'unexpected_response' as const
}

function getPagarMeRecurringConfig() {
  const baseUrl = safeTrim(process.env.PAGARME_BASE_URL).replace(/\/+$/, '')
  const secretKey = safeTrim(process.env.PAGARME_SECRET_KEY)
  if (!baseUrl || !secretKey) {
    throw new ProviderError({
      provider: 'pagarme',
      code: 'invalid_config',
      status: 503,
      retryable: false,
      message: 'Pagar.me recurring config is missing.',
    })
  }
  return { baseUrl, secretKey }
}

async function requestPagarMeRecurring<T>(input: {
  path: string
  method?: 'GET' | 'POST'
  body?: Record<string, unknown>
}) {
  const config = getPagarMeRecurringConfig()
  let response: Response
  try {
    response = await fetch(`${config.baseUrl}${input.path}`, {
      method: input.method ?? 'POST',
      headers: {
        accept: 'application/json',
        authorization: buildBasicAuthorization(config.secretKey),
        'content-type': 'application/json',
        'user-agent': 'connektpay/1.0',
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
      cache: 'no-store',
    })
  } catch (error) {
    throw new ProviderError({
      provider: 'pagarme',
      code: 'network_error',
      status: 502,
      retryable: true,
      message: error instanceof Error ? error.message : 'Network error',
    })
  }

  const text = await response.text().catch(() => '')
  const payload = parseJsonSafely(text)
  if (!response.ok) {
    throw new ProviderError({
      provider: 'pagarme',
      code: mapStatusToProviderCode(response.status),
      status: response.status || 502,
      retryable: response.status >= 500 || response.status === 429,
      message:
        pickFirstString(
          (payload as any)?.message,
          (payload as any)?.error,
          typeof payload === 'string' ? payload : null,
        ) ?? `Pagar.me request failed with status ${response.status}.`,
      details: payload ?? text.slice(0, 500),
    })
  }
  return payload as T
}

function normalizePhone(phone: string | null | undefined) {
  const digits = String(phone ?? '').replace(/\D/g, '')
  if (digits.length < 10) return null
  const base = digits.length >= 12 && digits.startsWith('55') ? digits.slice(2) : digits
  const areaCode = base.slice(0, 2)
  const number = base.slice(2)
  if (areaCode.length !== 2 || number.length < 8) return null
  return {
    country_code: '55',
    area_code: areaCode,
    number,
  }
}

function normalizeDocumentType(document: string | null | undefined) {
  const digits = String(document ?? '').replace(/\D/g, '')
  if (!digits) return null
  return digits.length > 11 ? 'CNPJ' : 'CPF'
}

function normalizeCustomerType(document: string | null | undefined) {
  const digits = String(document ?? '').replace(/\D/g, '')
  if (!digits) return undefined
  return digits.length > 11 ? 'company' : 'individual'
}

function normalizeExpMonth(expMonth: string) {
  const month = Number(String(expMonth).replace(/\D/g, ''))
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new ProviderError({
      provider: 'pagarme',
      code: 'bad_request',
      status: 400,
      retryable: false,
      message: 'Invalid card expiration month.',
    })
  }
  return month
}

function normalizeExpYear(expYear: string) {
  const digits = String(expYear).replace(/\D/g, '')
  if (!digits) {
    throw new ProviderError({
      provider: 'pagarme',
      code: 'bad_request',
      status: 400,
      retryable: false,
      message: 'Invalid card expiration year.',
    })
  }
  if (digits.length === 2) return Number(`20${digits}`)
  return Number(digits)
}

export async function ensurePagarMeRecurringCustomerCard(input: {
  payerId: string
  organizationId: string
  payer: {
    name: string
    email?: string | null
    document?: string | null
    phone?: string | null
  }
  card: {
    token: string
    holderName: string
    expMonth: string
    expYear: string
    brand?: string
    label?: string
  }
}) {
  const email = safeTrim(input.payer.email)
  const document = String(input.payer.document ?? '').replace(/\D/g, '')
  const customerPayload: Record<string, unknown> = {
    name: input.payer.name,
    email: email || undefined,
    code: input.payerId,
    document: document || undefined,
    document_type: document ? normalizeDocumentType(document) : undefined,
    type: normalizeCustomerType(document),
    metadata: {
      organization_id: input.organizationId,
      pay_pagador_id: input.payerId,
      payment_origin: 'subscription',
    },
  }

  const phone = normalizePhone(input.payer.phone)
  if (phone) {
    customerPayload.phones = {
      mobile_phone: phone,
      home_phone: phone,
    }
  }

  const customer = await requestPagarMeRecurring<Record<string, unknown>>({
    path: '/customers',
    method: 'POST',
    body: customerPayload,
  })

  const customerId = pickFirstString(customer?.id)
  if (!customerId) {
    throw new ProviderError({
      provider: 'pagarme',
      code: 'unexpected_response',
      status: 502,
      retryable: false,
      message: 'Pagar.me customer response is missing id.',
      details: customer,
    })
  }

  const card = await requestPagarMeRecurring<Record<string, unknown>>({
    path: `/customers/${encodeURIComponent(customerId)}/cards`,
    method: 'POST',
    body: {
      token: input.card.token,
      holder_name: input.card.holderName,
      holder_document: document || undefined,
      exp_month: normalizeExpMonth(input.card.expMonth),
      exp_year: normalizeExpYear(input.card.expYear),
      brand: safeTrim(input.card.brand) || undefined,
      label: safeTrim(input.card.label) || undefined,
      metadata: {
        organization_id: input.organizationId,
        pay_pagador_id: input.payerId,
      },
    },
  })

  const cardId = pickFirstString(card?.id)
  if (!cardId) {
    throw new ProviderError({
      provider: 'pagarme',
      code: 'unexpected_response',
      status: 502,
      retryable: false,
      message: 'Pagar.me card response is missing id.',
      details: card,
    })
  }

  const cardBrand =
    pickFirstString(card?.brand, (card as any)?.payment_method, (card as any)?.payment_method?.name) ?? null
  const cardLast4 = pickFirstString(
    (card as any)?.last_four_digits,
    (card as any)?.last4,
    (card as any)?.first_six_last_four?.slice(-4),
  )

  return {
    customerId,
    cardId,
    cardBrand,
    cardLast4,
    raw: {
      customer,
      card,
    },
  }
}

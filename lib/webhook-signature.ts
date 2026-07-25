import crypto from 'crypto'

export type IncomingWebhook = {
  id?: string
  type: string
  data?: any
}

type WebhookSignatureConfig = {
  providerId: 'mygateway'
  secret: string | null
  signatureHeaderNames: string[]
  requireSha256Prefix: boolean
}

function parseSha256Signature(headerValue: string, requireSha256Prefix: boolean) {
  const trimmed = headerValue.trim()
  if (!trimmed) return null

  let hex = trimmed
  if (trimmed.includes('=')) {
    const [prefix, ...rest] = trimmed.split('=')
    if (requireSha256Prefix && prefix.trim().toLowerCase() !== 'sha256') return null
    hex = rest.join('=').trim()
  } else if (requireSha256Prefix) {
    return null
  }

  if (!/^[a-f0-9]{64}$/i.test(hex)) return null
  return Buffer.from(hex.toLowerCase(), 'hex')
}

export function getWebhookSignatureConfig(): WebhookSignatureConfig {
  return {
    providerId: 'mygateway',
    secret: process.env.MYGATEWAY_WEBHOOK_SECRET ?? null,
    signatureHeaderNames: ['x-mygateway-signature', 'x-signature'],
    requireSha256Prefix: false,
  }
}

export function getWebhookSignatureHeader(headers: Headers, config: WebhookSignatureConfig) {
  for (const headerName of config.signatureHeaderNames) {
    const value = headers.get(headerName)
    if (value) return { headerName, value }
  }
  return null
}

export function verifyWebhookSignature(input: {
  rawBody: string
  headerValue: string
  secret: string
  requireSha256Prefix: boolean
}) {
  const provided = parseSha256Signature(input.headerValue, input.requireSha256Prefix)
  if (!provided) return false

  const expected = crypto.createHmac('sha256', input.secret).update(input.rawBody).digest()
  if (provided.length !== expected.length) return false
  return crypto.timingSafeEqual(expected, provided)
}

export function createWebhookSignatureHeader(input: {
  rawBody: string
  secret: string
}) {
  return crypto.createHmac('sha256', input.secret).update(input.rawBody).digest('hex')
}

export function buildWebhookProviderEventId(body: IncomingWebhook, rawBody: string) {
  const payload = body.data ?? {}
  return (
    (typeof body.id === 'string' && body.id) ||
    (typeof payload?.event_id === 'string' && payload.event_id) ||
    (typeof payload?.id === 'string' && payload.id ? `${body.type}:${payload.id}` : null) ||
    crypto.createHash('sha256').update(`${body.type}:${rawBody}`).digest('hex')
  )
}

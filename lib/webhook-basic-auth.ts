import crypto from 'crypto'

export type PagarmeWebhookBasicAuthConfig = {
  username: string | null
  password: string | null
}

export type PagarmeWebhookBasicAuthResult =
  | { ok: true; username: string }
  | {
      ok: false
      reason:
        | 'missing_authorization'
        | 'invalid_scheme'
        | 'invalid_base64'
        | 'invalid_format'
        | 'invalid_username'
        | 'invalid_password'
    }

export type PagarmeWebhookBasicAuthDiagnostic = {
  authorizationPresent: boolean
  scheme: 'Basic' | 'Bearer' | 'outro' | 'ausente'
  headerLength: number
  base64Decodable: boolean
  decodedLength: number
  hasSeparator: boolean
  firstSeparatorIndex: number
  hasMultipleSeparators: boolean
  receivedUsernameLength: number
  receivedPasswordLength: number
  receivedUsernameHash: string | null
  receivedPasswordHash: string | null
  expectedUsernameHash: string | null
  expectedPasswordHash: string | null
  expectedUsernamePresent: boolean
  expectedPasswordPresent: boolean
  usernameMatches: boolean
  passwordMatches: boolean
}

function hasNonBlankValue(value: string | null | undefined) {
  return Boolean(value && value.trim())
}

function secureCompareText(expected: string, received: string) {
  const expectedBuffer = Buffer.from(expected, 'utf8')
  const receivedBuffer = Buffer.from(received, 'utf8')
  const size = Math.max(expectedBuffer.length, receivedBuffer.length, 1)
  const paddedExpected = Buffer.alloc(size)
  const paddedReceived = Buffer.alloc(size)

  expectedBuffer.copy(paddedExpected)
  receivedBuffer.copy(paddedReceived)

  const equal = crypto.timingSafeEqual(paddedExpected, paddedReceived)
  return equal && expectedBuffer.length === receivedBuffer.length
}

function truncateSha256(value: string | null | undefined) {
  if (typeof value !== 'string') return null
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex').slice(0, 12)
}

function decodeBasicCredentials(encodedValue: string) {
  const trimmed = encodedValue.trim()
  if (!trimmed) return null
  if (/\s/.test(trimmed)) return null
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(trimmed)) return null
  if (trimmed.length % 4 !== 0) return null

  try {
    const decoded = Buffer.from(trimmed, 'base64')
    if (decoded.length === 0) return null
    if (decoded.toString('base64') !== trimmed) return null
    return decoded.toString('utf8')
  } catch {
    return null
  }
}

function parseBasicAuthorizationHeader(headerValue: string) {
  const match = /^Basic\s+(.+)$/i.exec(headerValue.trim())
  if (!match) return { ok: false as const, reason: 'invalid_scheme' as const }

  const decoded = decodeBasicCredentials(match[1])
  if (!decoded) return { ok: false as const, reason: 'invalid_base64' as const }

  const separatorIndex = decoded.indexOf(':')
  if (separatorIndex < 0) return { ok: false as const, reason: 'invalid_format' as const }

  return {
    ok: true as const,
    username: decoded.slice(0, separatorIndex),
    password: decoded.slice(separatorIndex + 1),
  }
}

export function getPagarmeWebhookBasicAuthDiagnostic(
  authorizationHeader: string | null,
  config = getPagarmeWebhookBasicAuthConfig()
): PagarmeWebhookBasicAuthDiagnostic {
  const rawHeader = typeof authorizationHeader === 'string' ? authorizationHeader : ''
  const trimmedHeader = rawHeader.trim()
  const schemeToken = /^(\S+)/.exec(trimmedHeader)?.[1]?.toLowerCase() ?? null
  const scheme: PagarmeWebhookBasicAuthDiagnostic['scheme'] =
    !trimmedHeader ? 'ausente' : schemeToken === 'basic' ? 'Basic' : schemeToken === 'bearer' ? 'Bearer' : 'outro'

  const basicMatch = /^Basic\s+(.+)$/i.exec(trimmedHeader)
  const encodedValue = basicMatch?.[1] ?? null
  const decoded = encodedValue ? decodeBasicCredentials(encodedValue) : null
  const firstSeparatorIndex = decoded?.indexOf(':') ?? -1
  const hasSeparator = firstSeparatorIndex >= 0
  const receivedUsername = hasSeparator ? decoded!.slice(0, firstSeparatorIndex) : null
  const receivedPassword = hasSeparator ? decoded!.slice(firstSeparatorIndex + 1) : null
  const expectedUsername = config.username
  const expectedPassword = config.password

  return {
    authorizationPresent: Boolean(trimmedHeader),
    scheme,
    headerLength: rawHeader.length,
    base64Decodable: decoded !== null,
    decodedLength: decoded ? Buffer.byteLength(decoded, 'utf8') : 0,
    hasSeparator,
    firstSeparatorIndex,
    hasMultipleSeparators: hasSeparator ? decoded!.indexOf(':', firstSeparatorIndex + 1) >= 0 : false,
    receivedUsernameLength: receivedUsername ? Buffer.byteLength(receivedUsername, 'utf8') : 0,
    receivedPasswordLength: receivedPassword ? Buffer.byteLength(receivedPassword, 'utf8') : 0,
    receivedUsernameHash: truncateSha256(receivedUsername),
    receivedPasswordHash: truncateSha256(receivedPassword),
    expectedUsernameHash: truncateSha256(expectedUsername),
    expectedPasswordHash: truncateSha256(expectedPassword),
    expectedUsernamePresent: hasNonBlankValue(expectedUsername),
    expectedPasswordPresent: hasNonBlankValue(expectedPassword),
    usernameMatches: receivedUsername !== null && expectedUsername !== null ? secureCompareText(expectedUsername, receivedUsername) : false,
    passwordMatches: receivedPassword !== null && expectedPassword !== null ? secureCompareText(expectedPassword, receivedPassword) : false,
  }
}

export function getPagarmeWebhookBasicAuthConfig(): PagarmeWebhookBasicAuthConfig {
  return {
    username: process.env.PAGARME_WEBHOOK_USERNAME ?? null,
    password: process.env.PAGARME_WEBHOOK_PASSWORD ?? null,
  }
}

export function isPagarmeWebhookBasicAuthConfigured(config = getPagarmeWebhookBasicAuthConfig()) {
  return hasNonBlankValue(config.username) && hasNonBlankValue(config.password)
}

export function verifyPagarmeWebhookBasicAuth(
  authorizationHeader: string | null,
  config = getPagarmeWebhookBasicAuthConfig()
): PagarmeWebhookBasicAuthResult {
  if (!authorizationHeader) {
    return { ok: false, reason: 'missing_authorization' }
  }

  const parsed = parseBasicAuthorizationHeader(authorizationHeader)
  if (!parsed.ok) return parsed

  const expectedUsername = config.username ?? ''
  const expectedPassword = config.password ?? ''
  const usernameMatches = secureCompareText(expectedUsername, parsed.username)
  const passwordMatches = secureCompareText(expectedPassword, parsed.password)

  if (!usernameMatches) return { ok: false, reason: 'invalid_username' }
  if (!passwordMatches) return { ok: false, reason: 'invalid_password' }

  return { ok: true, username: parsed.username }
}

export function createBasicAuthorizationHeader(input: { username: string; password: string }) {
  const encoded = Buffer.from(`${input.username}:${input.password}`, 'utf8').toString('base64')
  return `Basic ${encoded}`
}

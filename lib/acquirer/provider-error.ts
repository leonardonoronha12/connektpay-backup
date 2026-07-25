export type ProviderErrorCode =
  | 'invalid_config'
  | 'invalid_credentials'
  | 'timeout'
  | 'rate_limited'
  | 'unavailable'
  | 'unexpected_response'
  | 'network_error'
  | 'bad_request'
  | 'not_found'
  | 'conflict'
  | 'unprocessable'
  | 'NOT_IMPLEMENTED'

const SENSITIVE_KEY_PATTERN = /(authorization|auth|secret|api[_-]?key|token|password|card|cvv|number)/i

function sanitizeString(value: string) {
  if (!value) return value
  if (/basic\s+[a-z0-9+/=]+/i.test(value)) return '[redacted]'
  if (value.length > 500) return `${value.slice(0, 497)}...`
  return value
}

function sanitizeDetailsValue(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[truncated]'
  if (value == null) return value
  if (typeof value === 'string') return sanitizeString(value)
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeDetailsValue(item, depth + 1))
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEY_PATTERN.test(key) ? '[redacted]' : sanitizeDetailsValue(entry, depth + 1)
    }
    return out
  }
  return String(value)
}

export function sanitizeProviderErrorDetails(details: unknown) {
  return sanitizeDetailsValue(details)
}

export class ProviderError extends Error {
  readonly provider: string
  readonly code: ProviderErrorCode
  readonly status: number
  readonly retryable: boolean
  readonly details?: unknown

  constructor(input: {
    provider: string
    code: ProviderErrorCode
    status: number
    message: string
    retryable: boolean
    details?: unknown
  }) {
    super(input.message)
    this.provider = input.provider
    this.code = input.code
    this.status = input.status
    this.retryable = input.retryable
    this.details = typeof input.details === 'undefined' ? undefined : sanitizeProviderErrorDetails(input.details)
  }
}

export function isProviderError(error: unknown): error is ProviderError {
  return error instanceof ProviderError
}

export function mapProviderErrorToUserMessage(
  error: unknown,
  fallback = 'Falha ao comunicar com o provedor financeiro.',
) {
  if (error instanceof ProviderError) {
    if (error.code === 'invalid_credentials') return 'Credenciais inválidas do provedor financeiro.'
    if (error.code === 'invalid_config') return 'Configuração inválida do provedor financeiro.'
    if (error.code === 'timeout') return 'Timeout ao comunicar com o provedor financeiro.'
    if (error.code === 'rate_limited') return 'Muitas solicitações ao provedor financeiro. Tente novamente em instantes.'
    if (error.code === 'unavailable' || error.code === 'network_error') return 'Provedor financeiro indisponível no momento.'
    if (error.code === 'not_found') return 'Recurso não encontrado no provedor financeiro.'
    if (error.code === 'conflict') return 'O provedor financeiro rejeitou a operação por conflito de estado.'
    if (error.code === 'unprocessable' || error.code === 'bad_request') return 'Dados inválidos para o provedor financeiro.'
    if (error.code === 'NOT_IMPLEMENTED') return 'Esta operação ainda não está disponível para o provedor ativo.'
    return fallback
  }

  const message = error instanceof Error ? error.message : String(error ?? '')
  const lower = message.toLowerCase()
  if (lower.includes('timeout') || lower.includes('abort')) return 'Timeout ao comunicar com o provedor financeiro.'
  if (lower.includes('unauthorized') || lower.includes('forbidden') || lower.includes('invalid credential')) {
    return 'Credenciais inválidas do provedor financeiro.'
  }
  if (lower.includes('unavailable') || lower.includes('network')) return 'Provedor financeiro indisponível no momento.'
  return fallback
}

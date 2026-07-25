import 'server-only'
import crypto from 'crypto'

export type ApiErrorShape = { status: 401 | 403 | 500; message: string }
export type ApiErrorDiagnostic = {
  name: string
  code: string | null
  status: number | null
  messageHash: string | null
  messageLength: number
}

function normalizeMessage(e: unknown) {
  if (e instanceof Error) return e.message || 'Error'
  if (typeof e === 'string') return e
  return 'Error'
}

function hashMessage(message: string) {
  const normalized = message.trim()
  if (!normalized) return null
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex').slice(0, 12)
}

export function buildApiErrorDiagnostic(e: unknown): ApiErrorDiagnostic {
  const message = normalizeMessage(e)
  const anyError = e as any
  const rawStatus = anyError?.status
  const status = typeof rawStatus === 'number' && Number.isFinite(rawStatus) ? Math.round(rawStatus) : null
  const code = typeof anyError?.code === 'string' && anyError.code.trim() ? anyError.code.trim() : null
  const name =
    typeof anyError?.name === 'string' && anyError.name.trim()
      ? anyError.name.trim()
      : e instanceof Error
        ? e.name || 'Error'
        : 'Error'

  return {
    name,
    code,
    status,
    messageHash: hashMessage(message),
    messageLength: message.length,
  }
}

export function logApiError(route: string, e: unknown, extra?: Record<string, unknown>) {
  const diagnostic = buildApiErrorDiagnostic(e)
  console.error(route, {
    ...diagnostic,
    ...(extra ?? {}),
  })
}

export function classifyInternalApiError(e: unknown): ApiErrorShape {
  const message = normalizeMessage(e)
  const m = message.trim()
  const lower = m.toLowerCase()

  const authMissing =
    m === 'Unauthorized' ||
    lower.includes('auth session missing') ||
    lower.includes('jwt expired') ||
    lower.includes('invalid jwt') ||
    lower.includes('invalid token') ||
    lower.includes('missing jwt') ||
    lower.includes('not authenticated')

  if (authMissing) return { status: 401, message: 'Sessão expirada. Entre novamente.' }
  if (m === 'Forbidden') return { status: 403, message: 'Você não tem permissão para acessar este recurso.' }

  return { status: 500, message: 'Não foi possível concluir sua solicitação. Tente novamente.' }
}


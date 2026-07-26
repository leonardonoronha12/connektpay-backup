import fs from 'node:fs'
import path from 'node:path'
import { getBrowserCreds } from '../tests/helpers/e2e-auth'

function loadEnvLocal() {
  const file = path.resolve(process.cwd(), '.env.local')
  if (!fs.existsSync(file)) return
  const raw = fs.readFileSync(file, 'utf8')
  for (const lineRaw of raw.split(/\r?\n/)) {
    const line = lineRaw.trim()
    if (!line || line.startsWith('#')) continue
    const idx = line.indexOf('=')
    if (idx < 0) continue
    const key = line.slice(0, idx).trim()
    let value = line.slice(idx + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (key && !process.env[key]) process.env[key] = value
  }
}

function sanitizeBody(body: unknown) {
  if (!body || typeof body !== 'object') return body
  if (Array.isArray(body)) return body
  const clone = { ...(body as Record<string, unknown>) }
  delete clone.access_token
  delete clone.refresh_token
  delete clone.token
  delete clone.session
  delete clone.cookies
  return clone
}

async function main() {
  loadEnvLocal()
  const url = String(process.env.TARGET_URL || '').trim()
  if (!url) throw new Error('TARGET_URL ausente.')

  const baseURL = new URL(url).origin
  const creds = await getBrowserCreds(baseURL, 'owner')

  try {
    const loginResponse = await fetch(`${baseURL}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: creds.email,
        password: creds.password,
      }),
    })

    const setCookies = typeof loginResponse.headers.getSetCookie === 'function' ? loginResponse.headers.getSetCookie() : []
    const cookieHeader = setCookies
      .map((entry) => entry.split(';')[0]?.trim())
      .filter((entry): entry is string => Boolean(entry))
      .join('; ')

    const response = await fetch(url, {
      headers: {
        ...(cookieHeader ? { cookie: cookieHeader } : {}),
        'cache-control': 'no-store',
      },
    })

    const rawText = await response.text()
    let body: unknown
    try {
      body = JSON.parse(rawText)
    } catch {
      body = { nonJson: true, preview: rawText.slice(0, 300) }
    }

    const sanitizedBody = sanitizeBody(body)
    const hasProviderId =
      Boolean(sanitizedBody) &&
      typeof sanitizedBody === 'object' &&
      Object.prototype.hasOwnProperty.call(sanitizedBody, 'providerId')
    const hasRequiresClientCardTokenization =
      Boolean(sanitizedBody) &&
      typeof sanitizedBody === 'object' &&
      Object.prototype.hasOwnProperty.call(sanitizedBody, 'requiresClientCardTokenization')

    console.log(
      JSON.stringify(
        {
          url,
          status: response.status,
          headers: {
            'x-vercel-id': response.headers.get('x-vercel-id'),
            age: response.headers.get('age'),
            'cache-control': response.headers.get('cache-control'),
            'x-vercel-cache': response.headers.get('x-vercel-cache'),
            'content-type': response.headers.get('content-type'),
          },
          body: sanitizedBody,
          hasProviderId,
          hasRequiresClientCardTokenization,
        },
        null,
        2,
      ),
    )
  } finally {
    await creds.cleanup().catch(() => null)
  }
}

void main()

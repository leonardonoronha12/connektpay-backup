function safeTrim(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function onlyDigits(value: string) {
  return value.replace(/\D+/g, '')
}

function inferCardBrand(cardNumber: string) {
  const digits = onlyDigits(cardNumber)
  if (/^4\d{12}(\d{3})?(\d{3})?$/.test(digits)) return 'Visa'
  if (/^(5[1-5]\d{14}|2(2[2-9]\d{12}|[3-6]\d{13}|7([01]\d{12}|20\d{12})))$/.test(digits)) return 'Mastercard'
  if (/^3[47]\d{13}$/.test(digits)) return 'Amex'
  if (/^(4011(78|79)|431274|438935|451416|457393|457631|457632|504175|627780|636297|636368)\d*$/.test(digits)) return 'Elo'
  if (/^606282\d*$/.test(digits)) return 'Hipercard'
  return undefined
}

function readTokenFromResponse(payload: any) {
  const candidates = [
    payload?.id,
    payload?.token,
    payload?.data?.id,
    payload?.data?.token,
    payload?.card?.id,
    payload?.card?.token,
  ]
  for (const candidate of candidates) {
    const value = safeTrim(candidate)
    if (value) return value
  }
  return ''
}

export type PagarMeBrowserCardToken = {
  token: string
  brand?: string
  last4?: string
  expMonth: string
  expYear: string
}

export async function tokenizePagarMeCardInBrowser(input: {
  number: string
  holderName: string
  holderDocument: string
  expMonth: string
  expYear: string
  cvv: string
  label?: string
}) {
  const baseUrl = safeTrim(process.env.NEXT_PUBLIC_PAGARME_BASE_URL).replace(/\/+$/, '')
  const appId = safeTrim(process.env.NEXT_PUBLIC_PAGARME_APP_ID)
  if (!baseUrl || !appId) {
    throw new Error('Tokenização de cartão indisponível no momento.')
  }

  const number = onlyDigits(input.number)
  const holderName = safeTrim(input.holderName)
  const holderDocument = onlyDigits(input.holderDocument)
  const expMonth = onlyDigits(input.expMonth).slice(0, 2)
  const expYear = onlyDigits(input.expYear).slice(-2)
  const cvv = onlyDigits(input.cvv).slice(0, 4)

  if (!holderName || !holderDocument || number.length < 13 || number.length > 19 || !expMonth || !expYear || cvv.length < 3) {
    throw new Error('Dados do cartão inválidos para tokenização.')
  }

  const monthNumber = Number(expMonth)
  if (!Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12) {
    throw new Error('Validade do cartão inválida.')
  }

  const brand = inferCardBrand(number)
  const response = await fetch(`${baseUrl}/tokens?appId=${encodeURIComponent(appId)}`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      type: 'card',
      card: {
        number,
        holder_name: holderName,
        holder_document: holderDocument,
        exp_month: expMonth,
        exp_year: expYear,
        cvv,
        ...(brand ? { brand } : null),
        ...(safeTrim(input.label) ? { label: safeTrim(input.label) } : null),
      },
    }),
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const message = safeTrim(payload?.message) || safeTrim(payload?.error) || 'Falha ao tokenizar o cartão.'
    throw new Error(message)
  }

  const token = readTokenFromResponse(payload)
  if (!token) {
    throw new Error('O provedor não retornou um token de cartão válido.')
  }

  return {
    token,
    brand,
    last4: number.slice(-4) || undefined,
    expMonth,
    expYear,
  } satisfies PagarMeBrowserCardToken
}

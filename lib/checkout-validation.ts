import { validateDocument } from '@/lib/kyc-core'
import { normalizePhone } from '@/lib/receiver-kyc'
import { validateEmail } from '@/lib/receiver-kyc'

export type CheckoutCustomerInput = {
  name?: unknown
  email?: unknown
  document?: unknown
  phone?: unknown
}

export type CheckoutCustomerValidationResult =
  | {
      ok: true
      customer: {
        name: string
        email: string
        document: string
        phone: string | null
      }
    }
  | {
      ok: false
      message: string
    }

function normalizeText(input: unknown) {
  return typeof input === 'string' ? input.trim() : ''
}

export function validateCheckoutCustomer(
  input: CheckoutCustomerInput | null | undefined,
  options?: { requirePhone?: boolean },
): CheckoutCustomerValidationResult {
  const name = normalizeText(input?.name)
  const email = normalizeText(input?.email).toLowerCase()
  const document = normalizeText(input?.document)
  const phone = normalizePhone(input?.phone)

  if (!name) return { ok: false, message: 'Informe seu nome para continuar.' }
  if (!email) return { ok: false, message: 'Informe seu e-mail para continuar.' }
  if (!validateEmail(email)) return { ok: false, message: 'Informe um e-mail válido para continuar.' }
  if (!document) return { ok: false, message: 'Informe seu CPF ou CNPJ para continuar.' }
  if (!validateDocument(document)) return { ok: false, message: 'Informe um CPF ou CNPJ válido para continuar.' }
  if (options?.requirePhone && !phone) return { ok: false, message: 'Informe seu telefone para continuar.' }

  return {
    ok: true,
    customer: {
      name,
      email,
      document,
      phone,
    },
  }
}

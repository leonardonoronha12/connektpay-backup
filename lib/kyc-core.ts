export function onlyDigits(input: unknown) {
  return typeof input === 'string' ? input.replace(/\D+/g, '') : ''
}

export function isValidCPF(input: unknown) {
  const cpf = onlyDigits(input)
  if (cpf.length !== 11) return false
  if (/^(\d)\1+$/.test(cpf)) return false

  const calc = (len: number) => {
    let sum = 0
    for (let i = 0; i < len; i += 1) sum += Number(cpf[i]) * (len + 1 - i)
    const mod = sum % 11
    return mod < 2 ? 0 : 11 - mod
  }

  const d1 = calc(9)
  const d2 = calc(10)
  return d1 === Number(cpf[9]) && d2 === Number(cpf[10])
}

export function isValidCNPJ(input: unknown) {
  const cnpj = onlyDigits(input)
  if (cnpj.length !== 14) return false
  if (/^(\d)\1+$/.test(cnpj)) return false

  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]

  const calc = (weights: number[]) => {
    let sum = 0
    for (let i = 0; i < weights.length; i += 1) sum += Number(cnpj[i]) * weights[i]
    const mod = sum % 11
    return mod < 2 ? 0 : 11 - mod
  }

  const d1 = calc(weights1)
  const d2 = calc(weights2)
  return d1 === Number(cnpj[12]) && d2 === Number(cnpj[13])
}

export function inferPersonTypeFromDocument(input: unknown) {
  const d = onlyDigits(input)
  if (d.length === 11) return 'pf'
  if (d.length === 14) return 'pj'
  return null
}

export function validateDocument(input: unknown) {
  const d = onlyDigits(input)
  if (d.length === 11) return isValidCPF(d)
  if (d.length === 14) return isValidCNPJ(d)
  return false
}


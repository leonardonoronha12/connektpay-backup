import { expect, test } from '@playwright/test'

import { getFinancialProvider } from '@/lib/env'

function withFinancialProviderEnv(value: string | null | undefined, fn: () => void) {
  const previous = process.env.FINANCIAL_PROVIDER
  if (typeof value === 'string') process.env.FINANCIAL_PROVIDER = value
  else delete process.env.FINANCIAL_PROVIDER

  try {
    fn()
  } finally {
    if (typeof previous === 'string') process.env.FINANCIAL_PROVIDER = previous
    else delete process.env.FINANCIAL_PROVIDER
  }
}

test.describe('financial provider env contract', () => {
  test('aceita pagarme valido', () => {
    withFinancialProviderEnv('pagarme', () => {
      expect(getFinancialProvider()).toBe('pagarme')
    })
  })

  test('aceita mygateway valido como rollback explicito', () => {
    withFinancialProviderEnv('mygateway', () => {
      expect(getFinancialProvider()).toBe('mygateway')
    })
  })

  test('normaliza espacos e capitalizacao conforme contrato atual', () => {
    withFinancialProviderEnv('  PaGaRMe  ', () => {
      expect(getFinancialProvider()).toBe('pagarme')
    })
  })

  test('falha com mensagem clara quando FINANCIAL_PROVIDER esta ausente', () => {
    withFinancialProviderEnv(undefined, () => {
      expect(() => getFinancialProvider()).toThrow(
        'FINANCIAL_PROVIDER must be explicitly set to one of: mygateway, pagarme',
      )
    })
  })

  test('falha com mensagem clara quando FINANCIAL_PROVIDER e invalido', () => {
    withFinancialProviderEnv('stripe', () => {
      expect(() => getFinancialProvider()).toThrow(
        'Unsupported FINANCIAL_PROVIDER: stripe. Supported values: mygateway, pagarme',
      )
    })
  })
})

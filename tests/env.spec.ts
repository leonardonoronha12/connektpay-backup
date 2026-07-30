import { expect, test } from '@playwright/test'

import { getFinancialEnvironment, getFinancialProvider } from '@/lib/env'

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

function withEnvPatch(
  updates: Record<string, string | null | undefined>,
  fn: () => void,
) {
  const previous = new Map<string, string | undefined>()
  for (const [key, value] of Object.entries(updates)) {
    previous.set(key, process.env[key])
    if (typeof value === 'string') process.env[key] = value
    else delete process.env[key]
  }

  try {
    fn()
  } finally {
    for (const [key, value] of previous.entries()) {
      if (typeof value === 'string') process.env[key] = value
      else delete process.env[key]
    }
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

  test('retorna runtime sandbox quando PAGARME_ENVIRONMENT=sandbox', () => {
    withEnvPatch(
      {
        FINANCIAL_PROVIDER: 'pagarme',
        PAGARME_ENVIRONMENT: 'sandbox',
        PAGARME_BASE_URL: 'https://api.pagar.me/core/v5',
        NEXT_PUBLIC_PAGARME_BASE_URL: 'https://api.pagar.me/core/v5',
        PAGARME_SECRET_KEY: 'sk_test_123',
      },
      () => {
        expect(getFinancialEnvironment('pagarme').environment).toBe('sandbox')
      },
    )
  })

  test('retorna runtime production quando PAGARME_ENVIRONMENT=production', () => {
    withEnvPatch(
      {
        FINANCIAL_PROVIDER: 'pagarme',
        PAGARME_ENVIRONMENT: 'production',
        PAGARME_BASE_URL: 'https://api.pagar.me/core/v5',
        NEXT_PUBLIC_PAGARME_BASE_URL: 'https://api.pagar.me/core/v5',
        PAGARME_SECRET_KEY: 'sk_live_123',
      },
      () => {
        expect(getFinancialEnvironment('pagarme').environment).toBe('production')
      },
    )
  })

  test('falha cedo quando PAGARME_ENVIRONMENT esta ausente', () => {
    withEnvPatch(
      {
        FINANCIAL_PROVIDER: 'pagarme',
        PAGARME_ENVIRONMENT: undefined,
      },
      () => {
        expect(() => getFinancialEnvironment('pagarme')).toThrow(
          'PAGARME_ENVIRONMENT must be explicitly set to one of: sandbox, production',
        )
      },
    )
  })

  test('falha cedo quando PAGARME_ENVIRONMENT e invalido', () => {
    withEnvPatch(
      {
        FINANCIAL_PROVIDER: 'pagarme',
        PAGARME_ENVIRONMENT: 'staging',
      },
      () => {
        expect(() => getFinancialEnvironment('pagarme')).toThrow(
          'Unsupported PAGARME_ENVIRONMENT: staging. Supported values: sandbox, production',
        )
      },
    )
  })

  test('preview explicito sandbox preserva provider_environment sandbox', () => {
    withEnvPatch(
      {
        FINANCIAL_PROVIDER: 'pagarme',
        PAGARME_ENVIRONMENT: 'sandbox',
        VERCEL_URL: 'preview-connektpay.vercel.app',
      },
      () => {
        expect(getFinancialEnvironment('pagarme').environment).toBe('sandbox')
      },
    )
  })

  test('production explicito production preserva provider_environment production', () => {
    withEnvPatch(
      {
        FINANCIAL_PROVIDER: 'pagarme',
        PAGARME_ENVIRONMENT: 'production',
        VERCEL_PROJECT_PRODUCTION_URL: 'connektpay.com',
      },
      () => {
        expect(getFinancialEnvironment('pagarme').environment).toBe('production')
      },
    )
  })
})

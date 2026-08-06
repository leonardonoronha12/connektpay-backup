import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { expect, test } from '@playwright/test'

import { assertPlaywrightRunResult, resolveRunEnvironment } from '../scripts/run-playwright-layer.mjs'

function resolveEnvForTest(
  label: string,
  args: string[],
  opts?: {
    extraEnv?: Record<string, string>
    baseEnv?: Record<string, string>
  },
) {
  return resolveRunEnvironment(label, args, opts?.extraEnv ?? {}, opts?.baseEnv ?? {})
}

function createReportFixture(runId: string, report: unknown) {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-runner-report-'))
  const reportDir = path.join(baseDir, runId)
  fs.mkdirSync(reportDir, { recursive: true })
  const reportPath = path.join(reportDir, 'report.json')
  fs.writeFileSync(reportPath, JSON.stringify(report), 'utf8')
  return { baseDir, reportPath }
}

function assertRunResultForTest(
  label: string,
  result: { code: number | null; signal: NodeJS.Signals | null },
  opts?: {
    runId?: string
    report?: unknown
    env?: Record<string, string>
  },
) {
  const runId = opts?.runId ?? 'runner-contract'
  const fixture = opts?.report === undefined ? null : createReportFixture(runId, opts.report)
  const env = {
    PW_SUITE: 'local-regression',
    PW_RUN_ID: runId,
    BASE_URL: 'http://localhost:3001',
    FINANCIAL_PROVIDER: 'pagarme',
    PAGARME_ENVIRONMENT: 'sandbox',
    TEMP: fixture?.baseDir ?? path.join(os.tmpdir(), 'cp-runner-missing-report'),
    ...opts?.env,
  }
  return () => assertPlaywrightRunResult(label, result, env)
}

test.describe('run-playwright-layer env contract', () => {
  test('camada RC local injeta pagarme/sandbox quando shell nao informa provider', () => {
    const env = resolveEnvForTest(
      'full',
      ['test', '--workers=1', '--retries=0'],
      { extraEnv: { PW_SUITE: 'local-regression', PW_RUN_ID: 'full-contract' } },
    )

    expect(env.FINANCIAL_PROVIDER).toBe('pagarme')
    expect(env.PAGARME_ENVIRONMENT).toBe('sandbox')
    expect(env.BASE_URL).toBe('http://localhost:3001')
  })

  test('provider explicito do comando e preservado na camada RC', () => {
    const env = resolveEnvForTest(
      'critical-desktop',
      ['test', 'tests/qa-checkout.spec.ts', '--project=Desktop Chrome'],
      {
        extraEnv: { PW_SUITE: 'local-regression', PW_RUN_ID: 'critical-contract' },
        baseEnv: { FINANCIAL_PROVIDER: 'pagarme' },
      },
    )

    expect(env.FINANCIAL_PROVIDER).toBe('pagarme')
    expect(env.PAGARME_ENVIRONMENT).toBe('sandbox')
  })

  test('suite legada mygateway recebe provider explicito por configuracao da camada local', () => {
    const env = resolveEnvForTest(
      'changed-desktop',
      ['test', 'tests/mygateway.spec.ts', '--project=Desktop Chrome'],
      { extraEnv: { PW_SUITE: 'local-regression', PW_RUN_ID: 'changed-legacy-contract' } },
    )

    expect(env.FINANCIAL_PROVIDER).toBe('mygateway')
    expect(env.PAGARME_ENVIRONMENT).toBeUndefined()
  })

  test('provider mygateway explicito do comando e preservado somente nessa execucao', () => {
    const env = resolveEnvForTest(
      'changed-desktop',
      ['test', 'tests/mygateway.spec.ts', '--project=Desktop Chrome'],
      {
        extraEnv: { PW_SUITE: 'local-regression', PW_RUN_ID: 'changed-legacy-explicit-contract' },
        baseEnv: { FINANCIAL_PROVIDER: 'mygateway' },
      },
    )

    expect(env.FINANCIAL_PROVIDER).toBe('mygateway')
    expect(env.PAGARME_ENVIRONMENT).toBeUndefined()
  })

  test('valor invalido falha cedo', () => {
    expect(() =>
      resolveEnvForTest(
        'full',
        ['test', '--workers=1', '--retries=0'],
        {
          extraEnv: { PW_SUITE: 'local-regression', PW_RUN_ID: 'invalid-provider-contract' },
          baseEnv: { FINANCIAL_PROVIDER: 'stripe' },
        },
      ),
    ).toThrow('Unsupported FINANCIAL_PROVIDER: stripe. Supported values: mygateway, pagarme')
  })

  test('PAGARME_ENVIRONMENT invalido falha cedo', () => {
    expect(() =>
      resolveEnvForTest(
        'full',
        ['test', '--workers=1', '--retries=0'],
        {
          extraEnv: { PW_SUITE: 'local-regression', PW_RUN_ID: 'invalid-env-contract' },
          baseEnv: {
            FINANCIAL_PROVIDER: 'pagarme',
            PAGARME_ENVIRONMENT: 'staging',
          },
        },
      ),
    ).toThrow('Unsupported PAGARME_ENVIRONMENT: staging. Supported values: sandbox, production')
  })

  test('preview/homologation nao recebe default local e exige config explicita', () => {
    expect(() =>
      resolveEnvForTest(
        'homologation',
        ['test', '--workers=1', '--retries=0'],
        {
          extraEnv: {
            PW_SUITE: 'homologation',
            PW_RUN_ID: 'homologation-contract',
            BASE_URL: 'https://preview-connektpay.vercel.app',
          },
        },
      ),
    ).toThrow('FINANCIAL_PROVIDER must be explicitly set to one of: mygateway, pagarme')
  })

  test('homologation preserva provider e ambiente explicitamente informados', () => {
    const env = resolveEnvForTest(
      'homologation',
      ['test', '--workers=1', '--retries=0'],
      {
        extraEnv: {
          PW_SUITE: 'homologation',
          PW_RUN_ID: 'homologation-explicit-contract',
          BASE_URL: 'https://preview-connektpay.vercel.app',
        },
        baseEnv: {
          FINANCIAL_PROVIDER: 'pagarme',
          PAGARME_ENVIRONMENT: 'sandbox',
        },
      },
    )

    expect(env.BASE_URL).toBe('https://preview-connektpay.vercel.app')
    expect(env.FINANCIAL_PROVIDER).toBe('pagarme')
    expect(env.PAGARME_ENVIRONMENT).toBe('sandbox')
  })
})

test.describe('run-playwright-layer exit contract', () => {
  test('0 falhas retorna exit 0', () => {
    expect(
      assertRunResultForTest(
        'full',
        { code: 0, signal: null },
        {
          runId: 'zero-failures',
          report: {
            suites: [
              {
                specs: [{ tests: [{ status: 'expected' }, { status: 'skipped' }] }],
              },
            ],
          },
        },
      ),
    ).not.toThrow()
  })

  test('1 falha retorna exit diferente de 0', () => {
    expect(
      assertRunResultForTest(
        'full',
        { code: 0, signal: null },
        {
          runId: 'one-failure',
          report: {
            suites: [
              {
                specs: [{ tests: [{ status: 'expected' }, { status: 'unexpected' }] }],
              },
            ],
          },
        },
      ),
    ).toThrow(/concluiu com falhas no report\.json/)
  })

  test('relatorio com 35 falhas retorna exit diferente de 0', () => {
    expect(
      assertRunResultForTest(
        'full',
        { code: 0, signal: null },
        {
          runId: 'thirty-five-failures',
          report: {
            suites: [
              {
                specs: [{ tests: Array.from({ length: 35 }, () => ({ status: 'unexpected' })) }],
              },
            ],
          },
        },
      ),
    ).toThrow(/failed=35/)
  })

  test('processo Playwright encerrado abruptamente retorna exit diferente de 0', () => {
    expect(
      assertRunResultForTest(
        'full',
        { code: null, signal: 'SIGTERM' },
        {
          runId: 'abrupt-exit',
          report: {
            suites: [{ specs: [{ tests: [{ status: 'expected' }] }] }],
          },
        },
      ),
    ).toThrow('full interrompido por sinal SIGTERM.')
  })

  test('report.json ausente retorna exit diferente de 0', () => {
    expect(
      assertRunResultForTest('full', { code: 0, signal: null }, { runId: 'missing-report' }),
    ).toThrow(/report\.json ausente/)
  })
})

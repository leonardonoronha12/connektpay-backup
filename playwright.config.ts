import os from 'node:os'
import path from 'node:path'
import { defineConfig, devices } from '@playwright/test'

export const HOMOLOGATION_BASE_URL_ERROR =
  'BASE_URL deve ser definida explicitamente para homologação/Release Candidate. Ex.: BASE_URL=https://preview.exemplo.vercel.app'
export const LOCALHOST_HOMOLOGATION_ERROR =
  'BASE_URL apontando para localhost/127.0.0.1 não é permitida nas suítes de homologação/Release Candidate.'

function normalizeLoopbackBaseURL(input: string) {
  if (!input.trim()) return ''
  try {
    const url = new URL(input)
    if (url.hostname === '127.0.0.1') {
      url.hostname = 'localhost'
    }
    return url.toString().replace(/\/$/, '')
  } catch {
    return input.replace(/\/$/, '')
  }
}

function isLoopbackBaseURL(input: string) {
  try {
    const url = new URL(input)
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  } catch {
    return input.includes('localhost') || input.includes('127.0.0.1')
  }
}

export function resolveConfiguredBaseURL(input: string | undefined, currentSuite: string) {
  const normalized = normalizeLoopbackBaseURL(String(input ?? '').trim())
  const requiresExplicitBaseURL = currentSuite === 'homologation' || currentSuite === 'production-smoke'
  if (!normalized) {
    if (requiresExplicitBaseURL) {
      throw new Error(HOMOLOGATION_BASE_URL_ERROR)
    }
    return undefined
  }
  if (requiresExplicitBaseURL && isLoopbackBaseURL(normalized)) {
    throw new Error(LOCALHOST_HOMOLOGATION_ERROR)
  }
  return normalized
}

const devtools = process.env.E2E_DEVTOOLS === '1'
const suite = (process.env.PW_SUITE || 'local-regression').trim()
const runId = (process.env.PW_RUN_ID || '').trim()
const baseURL = resolveConfiguredBaseURL(process.env.BASE_URL, suite)

function shouldWriteArtifactsOutsideRepo(currentBaseURL?: string) {
  if (!currentBaseURL) return false
  if (process.env.PW_ARTIFACTS_IN_REPO === '1') return false
  try {
    const parsed = new URL(currentBaseURL)
    return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'
  } catch {
    return currentBaseURL.includes('localhost') || currentBaseURL.includes('127.0.0.1')
  }
}

const artifactBaseDir = (() => {
  const fromEnv = String(process.env.PW_ARTIFACTS_BASE || '').trim()
  if (fromEnv) return fromEnv
  if (!shouldWriteArtifactsOutsideRepo(baseURL)) return ''
  return path.join(process.env.TEMP || os.tmpdir(), 'connektpay-playwright')
})()

const outputRoot = artifactBaseDir ? path.join(artifactBaseDir, runId || 'default-run') : runId ? path.join('artifacts', runId) : undefined
const outputDir = outputRoot ? path.join(outputRoot, 'test-results') : 'test-results'
const htmlOutputFolder = outputRoot ? path.join(outputRoot, 'playwright-report') : 'playwright-report'
const jsonOutputFile = outputRoot ? path.join(outputRoot, 'report.json') : path.join('playwright-report', 'report.json')

const suiteSettings = {
  'local-regression': {
    testIgnore: [
      '**/homologacao-*.spec.ts',
      '**/producao-*.spec.ts',
      '**/phase2d_prod_homologation.spec.ts',
      '**/qa-e2e-audit.spec.ts',
      '**/financial-environment-isolation.spec.ts',
    ],
    projects: [
      { name: 'Desktop Chrome', use: { browserName: 'chromium', launchOptions: devtools ? ({ devtools: true } as any) : undefined } },
      { name: 'Desktop Firefox', use: { browserName: 'firefox' } },
      { name: 'Mobile Android', use: { ...devices['Pixel 7'], browserName: 'chromium', launchOptions: devtools ? ({ devtools: true } as any) : undefined } },
    ],
  },
  integration: {
    testIgnore: ['**/homologacao-*.spec.ts', '**/producao-*.spec.ts', '**/phase2d_prod_homologation.spec.ts'],
    projects: [
      { name: 'Desktop Chrome', use: { browserName: 'chromium', launchOptions: devtools ? ({ devtools: true } as any) : undefined } },
      { name: 'Mobile Android', use: { ...devices['Pixel 7'], browserName: 'chromium', launchOptions: devtools ? ({ devtools: true } as any) : undefined } },
    ],
  },
  homologation: {
    testMatch: ['**/homologacao-*.spec.ts'],
    projects: [{ name: 'Desktop Chrome', use: { browserName: 'chromium', launchOptions: devtools ? ({ devtools: true } as any) : undefined } }],
  },
  'production-smoke': {
    testMatch: ['**/producao-*.spec.ts', '**/phase2d_prod_homologation.spec.ts'],
    projects: [{ name: 'Desktop Chrome', use: { browserName: 'chromium', launchOptions: devtools ? ({ devtools: true } as any) : undefined } }],
  },
} as const

const selectedSuite = suiteSettings[suite as keyof typeof suiteSettings] ?? suiteSettings['local-regression']
const selectedTestIgnore = 'testIgnore' in selectedSuite ? [...selectedSuite.testIgnore] : undefined
const selectedTestMatch = 'testMatch' in selectedSuite ? [...selectedSuite.testMatch] : undefined

export default defineConfig({
  testDir: './tests',
  timeout: 120_000,
  retries: 0,
  workers: 1,
  outputDir,
  reporter: [
    ['line'],
    ['json', { outputFile: jsonOutputFile }],
    ['html', { outputFolder: htmlOutputFolder, open: 'never' }],
  ],
  ...(selectedTestIgnore ? { testIgnore: selectedTestIgnore } : {}),
  ...(selectedTestMatch ? { testMatch: selectedTestMatch } : {}),
  use: {
    ...(baseURL ? { baseURL } : {}),
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    headless: devtools ? false : true,
  },
  projects: selectedSuite.projects as any,
})

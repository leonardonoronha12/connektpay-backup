import { expect, test } from '@playwright/test'

import {
  HOMOLOGATION_BASE_URL_ERROR,
  LOCALHOST_HOMOLOGATION_ERROR,
  resolveConfiguredBaseURL,
} from '../playwright.config'
import { normalizeBaseURL, QA_BASE_URL_ERROR } from './helpers/qa-suite'

test.describe('playwright/baseURL harness', () => {
  test('homologação sem BASE_URL falha cedo', () => {
    expect(() => resolveConfiguredBaseURL(undefined, 'homologation')).toThrow(HOMOLOGATION_BASE_URL_ERROR)
  })

  test('homologação aceita URL Preview explícita exatamente como configurada', () => {
    expect(resolveConfiguredBaseURL('https://preview-connektpay.vercel.app/', 'homologation')).toBe(
      'https://preview-connektpay.vercel.app',
    )
  })

  test('homologação rejeita localhost mesmo quando informado explicitamente', () => {
    expect(() => resolveConfiguredBaseURL('http://localhost:3001', 'homologation')).toThrow(LOCALHOST_HOMOLOGATION_ERROR)
  })

  test('execução local explícita continua possível quando BASE_URL aponta para localhost', () => {
    expect(normalizeBaseURL('http://127.0.0.1:3001/')).toBe('http://localhost:3001')
  })

  test('helpers QA não aceitam BASE_URL ausente', () => {
    const previous = process.env.BASE_URL
    delete process.env.BASE_URL
    try {
      expect(() => normalizeBaseURL()).toThrow(QA_BASE_URL_ERROR)
    } finally {
      if (typeof previous === 'string') process.env.BASE_URL = previous
      else delete process.env.BASE_URL
    }
  })
})

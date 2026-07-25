import { expect, test } from '@playwright/test'

import path from 'path'

import { isAllowedDocsAssetPath } from '@/lib/docs/assets'

test.describe('docs assets guard', () => {
  test('bloqueia artefatos de testes fora da whitelist de docs', async () => {
    const denied = path.resolve(process.cwd(), 'test-results', 'index.html')
    const allowed = path.resolve(process.cwd(), 'docs', 'sample.txt')

    expect(isAllowedDocsAssetPath(denied)).toBeFalsy()
    expect(isAllowedDocsAssetPath(allowed)).toBeTruthy()
  })
})

import { expect, test } from '@playwright/test'

import { canAccessPath } from '@/lib/rbac'

test.describe('RBAC', () => {
  test('configuracoes fica restrita a owner e super_admin', async () => {
    expect(canAccessPath('owner', '/configuracoes')).toBeTruthy()
    expect(canAccessPath('super_admin', '/configuracoes')).toBeTruthy()
    expect(canAccessPath('admin', '/configuracoes')).toBeFalsy()
    expect(canAccessPath('financeiro', '/configuracoes')).toBeFalsy()
    expect(canAccessPath('operacional', '/configuracoes')).toBeFalsy()
  })

  test('rotas internas administrativas respeitam perfis esperados', async () => {
    expect(canAccessPath('owner', '/recebedores')).toBeTruthy()
    expect(canAccessPath('admin', '/recebedores')).toBeTruthy()
    expect(canAccessPath('financeiro', '/recebedores')).toBeFalsy()

    expect(canAccessPath('owner', '/split')).toBeTruthy()
    expect(canAccessPath('admin', '/split')).toBeTruthy()
    expect(canAccessPath('financeiro', '/split')).toBeFalsy()

    expect(canAccessPath('owner', '/assinaturas-internas')).toBeTruthy()
    expect(canAccessPath('admin', '/assinaturas-internas')).toBeTruthy()
    expect(canAccessPath('financeiro', '/assinaturas-internas')).toBeTruthy()

    expect(canAccessPath('owner', '/repasses-internos')).toBeTruthy()
    expect(canAccessPath('admin', '/repasses-internos')).toBeTruthy()
    expect(canAccessPath('financeiro', '/repasses-internos')).toBeTruthy()

    expect(canAccessPath('owner', '/admin/aprovacao-kyc')).toBeTruthy()
    expect(canAccessPath('admin', '/admin/aprovacao-kyc')).toBeTruthy()
    expect(canAccessPath('financeiro', '/admin/aprovacao-kyc')).toBeFalsy()

    expect(canAccessPath('owner', '/admin/conciliacao')).toBeTruthy()
    expect(canAccessPath('admin', '/admin/conciliacao')).toBeTruthy()
    expect(canAccessPath('financeiro', '/admin/conciliacao')).toBeTruthy()

    expect(canAccessPath('owner', '/admin/anticipation')).toBeTruthy()
    expect(canAccessPath('admin', '/admin/anticipation')).toBeTruthy()
    expect(canAccessPath('financeiro', '/admin/anticipation')).toBeFalsy()
  })
})

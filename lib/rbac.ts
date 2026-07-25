export type AppRole = 'owner' | 'admin' | 'financeiro' | 'operacional' | 'super_admin'

export function normalizeRole(role: unknown): AppRole | null {
  if (typeof role !== 'string') return null
  const r = role.trim().toLowerCase()
  if (r === 'owner' || r === 'admin' || r === 'financeiro' || r === 'operacional' || r === 'super_admin') return r
  return null
}

export function isAllowed(role: AppRole | null, allowed: readonly AppRole[]) {
  if (!role) return false
  return allowed.includes(role)
}

type PageRule = { kind: 'exact' | 'prefix'; path: string; allowed: readonly AppRole[] }

const PAGE_RULES: readonly PageRule[] = [
  { kind: 'exact', path: '/dashboard', allowed: ['owner', 'admin', 'financeiro', 'super_admin'] },
  { kind: 'exact', path: '/', allowed: ['owner', 'admin', 'financeiro', 'super_admin'] },

  { kind: 'prefix', path: '/transacoes', allowed: ['owner', 'admin', 'financeiro', 'super_admin'] },

  { kind: 'prefix', path: '/links-pagamento', allowed: ['owner', 'admin', 'super_admin'] },
  { kind: 'prefix', path: '/split', allowed: ['owner', 'admin', 'super_admin'] },

  { kind: 'exact', path: '/assinaturas', allowed: ['owner', 'admin', 'financeiro', 'super_admin'] },
  { kind: 'prefix', path: '/assinaturas-internas', allowed: ['owner', 'admin', 'financeiro', 'super_admin'] },
  { kind: 'prefix', path: '/subscriptions/plans', allowed: ['owner', 'admin', 'super_admin'] },
  { kind: 'prefix', path: '/subscriptions/new', allowed: ['owner', 'admin', 'super_admin'] },
  { kind: 'prefix', path: '/subscriptions', allowed: ['owner', 'admin', 'financeiro', 'super_admin'] },

  { kind: 'prefix', path: '/recebedores', allowed: ['owner', 'admin', 'super_admin'] },

  { kind: 'prefix', path: '/ledger', allowed: ['owner', 'financeiro', 'super_admin'] },
  { kind: 'prefix', path: '/antecipacao', allowed: ['owner', 'financeiro', 'super_admin'] },
  { kind: 'prefix', path: '/repasses', allowed: ['owner', 'financeiro', 'super_admin'] },
  { kind: 'prefix', path: '/repasses-internos', allowed: ['owner', 'admin', 'financeiro', 'super_admin'] },

  { kind: 'prefix', path: '/configuracoes/integracoes', allowed: ['owner', 'super_admin'] },
  { kind: 'prefix', path: '/configuracoes/provedor', allowed: ['owner', 'super_admin'] },
  { kind: 'exact', path: '/configuracoes', allowed: ['owner', 'super_admin'] },

  { kind: 'prefix', path: '/admin/provedor-financeiro', allowed: ['owner', 'super_admin'] },
  { kind: 'prefix', path: '/admin/conciliacao', allowed: ['owner', 'admin', 'financeiro', 'super_admin'] },
  { kind: 'prefix', path: '/admin/auditoria', allowed: ['owner', 'admin', 'super_admin'] },
  { kind: 'prefix', path: '/admin/aprovacao-kyc', allowed: ['owner', 'admin', 'super_admin'] },
  { kind: 'prefix', path: '/admin/eventos', allowed: ['owner', 'admin', 'super_admin'] },
  { kind: 'prefix', path: '/admin/anticipation', allowed: ['owner', 'admin', 'super_admin'] },
  { kind: 'prefix', path: '/admin/painel', allowed: ['owner', 'admin', 'super_admin'] },
  { kind: 'prefix', path: '/admin', allowed: ['owner', 'admin', 'super_admin'] },
]

export function allowedRolesForPath(pathname: string): readonly AppRole[] | null {
  const path = pathname || '/'
  for (const rule of PAGE_RULES) {
    if (rule.kind === 'exact') {
      if (path === rule.path) return rule.allowed
      continue
    }
    if (path === rule.path || path.startsWith(`${rule.path}/`)) return rule.allowed
  }
  return null
}

export function canAccessPath(role: AppRole | null, pathname: string) {
  const allowed = allowedRolesForPath(pathname)
  if (!allowed) return role === 'owner' || role === 'super_admin'
  return isAllowed(role, allowed)
}

'use client'

import { WordMark } from '@/components/brand/Logo'
import Link from 'next/link'
import { F, MINT, NAVY } from '@/lib/design-tokens'
import {
  Activity,
  ArrowRightLeft,
  ArrowUpDown,
  BadgeCheck,
  BookOpen,
  Database,
  LayoutDashboard,
  ListChecks,
  LogOut,
  RefreshCw,
  Server,
  Settings,
  Shield,
  UserCheck,
  Zap,
  Link2,
} from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'
import { useSession } from '@/hooks/useSession'
import { useMe } from '@/hooks/me'
import { signOut } from '@/services/auth'
import { initials } from '@/utils/format'
import { normalizeRole } from '@/lib/rbac'
import { useEffect, useMemo, useState } from 'react'
import { prefetchRouteData } from '@/lib/route-data-prefetch'

const NAV_GROUPS = [
  { label: null, items: [{ path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['owner', 'admin', 'financeiro', 'super_admin'] }] },
  {
    label: 'COMERCIAL',
    items: [
      { path: '/transacoes', label: 'Transações', icon: ArrowUpDown, roles: ['owner', 'admin', 'financeiro', 'super_admin'] },
      { path: '/links-pagamento', label: 'Links de Pagamento', icon: Link2, roles: ['owner', 'admin', 'super_admin'] },
      { path: '/assinaturas', label: 'Assinaturas', icon: RefreshCw, roles: ['owner', 'admin', 'financeiro', 'super_admin'] },
      { path: '/assinaturas-internas', label: 'Assinaturas Internas', icon: RefreshCw, roles: ['owner', 'admin', 'financeiro', 'super_admin'] },
      { path: '/recebedores', label: 'Recebedores', icon: UserCheck, roles: ['owner', 'admin', 'super_admin'] },
      { path: '/split', label: 'Split', icon: BadgeCheck, roles: ['owner', 'admin', 'super_admin'] },
    ],
  },
  {
    label: 'FINANCEIRO',
    items: [
      { path: '/ledger', label: 'Ledger', icon: BookOpen, roles: ['owner', 'financeiro', 'super_admin'] },
      { path: '/antecipacao', label: 'Antecipação', icon: Zap, roles: ['owner', 'financeiro', 'super_admin'] },
      { path: '/repasses', label: 'Repasses', icon: ArrowRightLeft, roles: ['owner', 'financeiro', 'super_admin'] },
      { path: '/repasses-internos', label: 'Repasses Internos', icon: ArrowRightLeft, roles: ['owner', 'admin', 'financeiro', 'super_admin'] },
    ],
  },
  {
    label: 'ADMINISTRAÇÃO',
    items: [
      { path: '/admin/painel', label: 'Painel', icon: Shield, roles: ['owner', 'admin', 'super_admin'] },
      { path: '/admin/aprovacao-kyc', label: 'Aprovação KYC', icon: BadgeCheck, roles: ['owner', 'admin', 'super_admin'] },
      { path: '/admin/eventos', label: 'Eventos', icon: Activity, roles: ['owner', 'admin', 'super_admin'] },
      { path: '/admin/anticipation', label: 'Antecipações', icon: Zap, roles: ['owner', 'admin', 'super_admin'] },
      { path: '/admin/conciliacao', label: 'Conciliação', icon: Database, roles: ['owner', 'admin', 'financeiro', 'super_admin'] },
      { path: '/admin/auditoria', label: 'Auditoria', icon: ListChecks, roles: ['owner', 'admin', 'super_admin'] },
      { path: '/admin/provedor-financeiro', label: 'Provedor Financeiro', icon: Server, roles: ['owner', 'super_admin'] },
    ],
  },
  {
    label: 'CONFIGURAÇÕES',
    items: [
      { path: '/configuracoes', label: 'Configurações', icon: Settings, roles: ['owner', 'super_admin'] },
      { path: '/configuracoes/integracoes', label: 'Integrações', icon: Server, roles: ['owner', 'super_admin'] },
    ],
  },
]

function getCookieValue(name: string) {
  if (typeof document === 'undefined') return null
  const parts = document.cookie.split(';').map((p) => p.trim())
  for (const p of parts) {
    if (!p) continue
    const eq = p.indexOf('=')
    if (eq === -1) continue
    const k = p.slice(0, eq)
    if (k !== name) continue
    return decodeURIComponent(p.slice(eq + 1))
  }
  return null
}

export function Sidebar({
  variant = 'desktop',
  onNavigate,
  initialRole,
}: {
  variant?: 'desktop' | 'mobile'
  onNavigate?: () => void
  initialRole?: string | null
}) {
  const pathname = usePathname()
  const router = useRouter()
  const { session } = useSession()
  const { me } = useMe()
  const [signingOut, setSigningOut] = useState(false)
  const [pendingPath, setPendingPath] = useState<string | null>(null)
  const [clientCookieRole, setClientCookieRole] = useState<string | null>(null)
  const role =
    clientCookieRole ??
    normalizeRole(initialRole ?? null) ??
    normalizeRole(me?.role) ??
    normalizeRole(session?.user?.app_metadata?.role ?? session?.user?.user_metadata?.role)

  const allowedPaths = useMemo(() => {
    const out: string[] = []
    for (const group of NAV_GROUPS) {
      for (const it of group.items as any[]) {
        if (!it.roles) {
          out.push(it.path)
          continue
        }
        if (!role) continue
        if ((it.roles as string[]).includes(role)) out.push(it.path)
      }
    }
    return out
  }, [role])

  useEffect(() => {
    const devRole = process.env.NODE_ENV === 'development' ? normalizeRole(getCookieValue('cp_dev_role')) : null
    const cookieRole = normalizeRole(getCookieValue('cp_role'))
    setClientCookieRole(devRole ?? cookieRole ?? null)
  }, [])

  useEffect(() => {
    setPendingPath(null)
  }, [pathname])

  const isActive = (path: string) => {
    if (path === '/dashboard') return pathname === '/dashboard' || pathname === '/'
    if (path === '/admin/painel') return pathname === '/admin/painel'
    if (path === '/configuracoes') return pathname === '/configuracoes'
    return pathname === path || pathname.startsWith(`${path}/`)
  }

  const handleSidebarLogout = async () => {
    if (signingOut) return
    if (pendingPath) return
    setSigningOut(true)
    try {
      await signOut()
      onNavigate?.()
      setPendingPath('/login')
      if (typeof window !== 'undefined') {
        window.location.assign('/login')
        return
      }
      router.replace('/login')
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <aside
      style={{
        background: 'linear-gradient(180deg, #021B5B 0%, #03164A 100%)',
        fontFamily: F,
        width: variant === 'mobile' ? 288 : 232,
        flexShrink: 0,
        boxShadow: variant === 'mobile' ? '0 18px 40px rgba(2,27,91,.34)' : '0 0 0 1px rgba(255,255,255,.02), 8px 0 32px rgba(2,27,91,.14)',
      }}
      className={variant === 'mobile' ? 'flex h-full flex-col select-none' : 'hidden md:flex fixed left-0 top-0 h-screen flex-col z-20 select-none'}
    >
      <div className="px-5 py-5" style={{ borderBottom: '1px solid rgba(255,255,255,.08)' }}>
        <Link
          href="/dashboard"
          prefetch
          onMouseEnter={() => {
            void prefetchRouteData('/dashboard')
          }}
          onClick={(e) => {
            if (pendingPath || pathname === '/dashboard' || pathname === '/') {
              e.preventDefault()
              return
            }
            if (variant !== 'mobile') onNavigate?.()
            setPendingPath('/dashboard')
            void prefetchRouteData('/dashboard')
          }}
          style={{ display: 'inline-flex', background: 'none', border: 'none', cursor: 'pointer', padding: 0, alignItems: 'center' }}
        >
          <WordMark dark />
        </Link>
        <p style={{ fontFamily: F, fontSize: 11, color: 'rgba(255,255,255,.45)', marginTop: 10 }}>Operação financeira com visão clara de cobrança, liquidação e risco.</p>
      </div>
      <nav className="flex-1 px-3 py-4 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter((it: any) => {
            if (!it.roles) return true
            if (!role) return false
            return (it.roles as string[]).includes(role)
          })
          if (items.length === 0) return null
          return (
            <div key={`${group.label ?? 'root'}`} style={{ marginBottom: 6 }}>
              {group.label && (
                <p
                  style={{
                    fontFamily: F,
                    fontWeight: 700,
                    fontSize: 10,
                    color: 'rgba(255,255,255,.28)',
                    letterSpacing: '0.12em',
                    padding: '14px 12px 8px',
                    textTransform: 'uppercase',
                  }}
                >
                  {group.label}
                </p>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {items.map(({ path, label, icon: Icon }) => {
                const active = isActive(path)
                return (
                  <Link
                    key={path}
                    href={path}
                    prefetch
                    onClick={(e) => {
                      if (pendingPath || active) {
                        e.preventDefault()
                        return
                      }
                      if (variant !== 'mobile') onNavigate?.()
                      setPendingPath(path)
                      void prefetchRouteData(path)
                    }}
                    onMouseDown={() => {
                      void prefetchRouteData(path)
                    }}
                    aria-current={active ? 'page' : undefined}
                    data-nav-path={path}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 12px',
                      borderRadius: 12,
                      border: 'none',
                      cursor: 'pointer',
                      fontFamily: F,
                      fontWeight: active ? 700 : 600,
                      fontSize: 13,
                      background: active ? 'linear-gradient(90deg, rgba(57,240,174,.18), rgba(57,240,174,.08))' : 'transparent',
                      color: active ? '#C7FFE8' : 'rgba(255,255,255,.66)',
                      transition: 'all .15s',
                      textAlign: 'left',
                      opacity: 1,
                      textDecoration: 'none',
                      borderLeft: active ? `3px solid ${MINT}` : '3px solid transparent',
                    }}
                    onMouseEnter={(e) => {
                      if (!active) {
                        void prefetchRouteData(path)
                        e.currentTarget.style.color = 'rgba(255,255,255,.92)'
                        e.currentTarget.style.background = 'rgba(255,255,255,.06)'
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = active ? '#C7FFE8' : 'rgba(255,255,255,.66)'
                      e.currentTarget.style.background = active ? 'linear-gradient(90deg, rgba(57,240,174,.18), rgba(57,240,174,.08))' : 'transparent'
                    }}
                  >
                    <Icon size={15} />
                    <span style={{ flex: 1 }}>{label}</span>
                    {active ? (
                      <div style={{ width: 7, height: 7, borderRadius: 999, background: MINT, boxShadow: '0 0 0 4px rgba(57,240,174,.12)', flexShrink: 0 }} />
                    ) : null}
                  </Link>
                )
              })}
            </div>
          </div>
          )
        })}
      </nav>
      <div className="px-3 py-4" style={{ borderTop: '1px solid rgba(255,255,255,.08)' }}>
        <div
          className="flex items-center gap-3 px-3 py-3 rounded-2xl"
          style={{ cursor: 'default', border: '1px solid rgba(255,255,255,.06)', background: 'rgba(255,255,255,.03)' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,.06)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,.03)')}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 12,
              background: MINT,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: 11.5,
              color: NAVY,
              fontFamily: F,
              flexShrink: 0,
            }}
          >
            {initials(me?.fullName ?? me?.email ?? session?.user?.email ?? '—')}
          </div>
          <div className="flex-1 min-w-0">
            <p style={{ color: 'white', fontSize: 12.5, fontWeight: 700, fontFamily: F }} className="truncate">
              {me?.fullName ?? '—'}
            </p>
            <p style={{ color: 'rgba(255,255,255,.42)', fontSize: 11, fontFamily: F }} className="truncate">
              {me?.email ?? session?.user?.email ?? '—'}
            </p>
          </div>
          <button
            aria-label="Sair"
            disabled={signingOut}
            onMouseDown={(e) => {
              e.preventDefault()
              e.stopPropagation()
              void handleSidebarLogout()
            }}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' && e.key !== ' ') return
              e.preventDefault()
              e.stopPropagation()
              void handleSidebarLogout()
            }}
            style={{ background: 'none', border: 'none', cursor: signingOut ? 'default' : 'pointer', opacity: signingOut ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            {signingOut ? <span className="inline-block w-4 h-4 rounded-full border-2 border-white/40 border-t-transparent animate-spin" /> : <LogOut size={14} style={{ color: 'rgba(255,255,255,.3)' }} />}
          </button>
        </div>
      </div>
    </aside>
  )
}

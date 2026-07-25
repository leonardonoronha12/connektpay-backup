'use client'

import { GuidedExperience } from '@/components/guidance/GuidedExperience'
import { AppToastViewport } from '@/components/guidance/AppToastViewport'
import { Sidebar } from '@/components/layout/Sidebar'
import { Header } from '@/components/layout/Header'
import { BG, F } from '@/lib/design-tokens'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

if (typeof window !== 'undefined') {
  const w = window as any
  if (!w.__cpFetchKeepalivePatched) {
    w.__cpFetchKeepalivePatched = true

    const orig = window.fetch.bind(window)
    window.fetch = ((input: any, init?: any) => {
      const url = typeof input === 'string' ? input : String(input?.url ?? input)
      const method = String(init?.method ?? input?.method ?? 'GET').toUpperCase()
      const shouldKeepalive =
        (url.startsWith('/api/') || url.startsWith(`${window.location.origin}/api/`)) &&
        method === 'GET' &&
        init?.keepalive == null &&
        init?.signal == null
      const nextInit = shouldKeepalive ? { ...init, keepalive: true } : init
      return orig(input, nextInit)
    }) as any
  }
}

const PAGE_META: Record<string, { title: string; subtitle?: string; section?: string }> = {
  '/dashboard': { title: 'Dashboard', subtitle: 'Visão executiva das operações e do desempenho recente', section: 'Visão geral' },
  '/transacoes': { title: 'Transações', subtitle: 'Acompanhe status, método de pagamento e liquidação', section: 'Comercial' },
  '/links-pagamento': { title: 'Links de Pagamento', subtitle: 'Gerencie links ativos e acompanhe conversão', section: 'Comercial' },
  '/links-pagamento/novo': { title: 'Criar Link de Pagamento', subtitle: 'Monte uma experiência de cobrança clara e pronta para compartilhar', section: 'Comercial' },
  '/assinaturas': { title: 'Assinaturas', subtitle: 'Acompanhe recorrência, planos e saúde da base', section: 'Comercial' },
  '/assinaturas-internas': {
    title: 'Assinaturas Internas',
    subtitle: 'Monte planos, adesoes e simulacoes de recorrencia sem provider',
    section: 'Comercial',
  },
  '/recebedores': { title: 'Recebedores', subtitle: 'Organize onboarding, KYC e dados de liquidação', section: 'Comercial' },
  '/split': { title: 'Split Interno', subtitle: 'Configure regras internas de distribuição e simule cenários sem provider', section: 'Comercial' },
  '/ledger': { title: 'Ledger', subtitle: 'Extrato financeiro consolidado', section: 'Financeiro' },
  '/antecipacao': { title: 'Antecipação de Recebíveis', subtitle: 'Simule valores e acompanhe solicitações', section: 'Financeiro' },
  '/repasses': { title: 'Repasses', subtitle: 'Controle agendamentos, status e histórico de liquidação', section: 'Financeiro' },
  '/repasses-internos': {
    title: 'Repasses Internos',
    subtitle: 'Solicite, revise e simule repasses sem acionar provider',
    section: 'Financeiro',
  },
  '/admin/painel': { title: 'Painel Administrativo', subtitle: 'Monitore a operação e os principais indicadores internos', section: 'Administração' },
  '/admin/aprovacao-kyc': { title: 'Aprovação KYC', subtitle: 'Gestão de documentos e verificação de identidade', section: 'Administração' },
  '/admin/eventos': { title: 'Eventos & Webhooks', subtitle: 'Log de eventos disparados pela plataforma', section: 'Administração' },
  '/admin/anticipation': { title: 'Admin · Antecipações', subtitle: 'Aprovação e acompanhamento de solicitações', section: 'Administração' },
  '/admin/conciliacao': { title: 'Conciliação Financeira', subtitle: 'Comparativo entre registros internos e provedor', section: 'Administração' },
  '/admin/auditoria': { title: 'Logs de Auditoria', subtitle: 'Rastreamento completo de ações do sistema', section: 'Administração' },
  '/admin/provedor-financeiro': {
    title: 'Provedor Financeiro',
    subtitle: 'Status e configurações da infraestrutura de processamento',
    section: 'Administração',
  },
  '/configuracoes': { title: 'Configurações', subtitle: 'Ajustes de conta, organização e preferências operacionais', section: 'Configurações' },
  '/configuracoes/integracoes': { title: 'Integrações', subtitle: 'Credenciais, chaves e conexões da plataforma', section: 'Configurações' },
}

function resolvePageMeta(pathname: string) {
  if (PAGE_META[pathname]) return PAGE_META[pathname]
  if (pathname.startsWith('/subscriptions/')) return { title: 'Assinatura', subtitle: 'Detalhes e acompanhamento da assinatura', section: 'Comercial' }
  if (pathname.startsWith('/subscriptions')) return { title: 'Assinaturas', subtitle: 'Acompanhe recorrência, planos e saúde da base', section: 'Comercial' }
  if (pathname.startsWith('/configuracoes/provedor')) return { title: 'Provedor Financeiro', subtitle: 'Acompanhe o status atual da infraestrutura financeira', section: 'Configurações' }
  return { title: 'Connekt Pay', section: 'Plataforma' }
}

export function AppShell({ children, initialRole }: { children: React.ReactNode; initialRole?: string | null }) {
  const pathname = usePathname()
  const meta = resolvePageMeta(pathname)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!mobileOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setMobileOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [mobileOpen])

  useEffect(() => {
    document.title = meta.title === 'Connekt Pay' ? 'Connekt Pay' : `${meta.title} | Connekt Pay`
  }, [meta.title])

  return (
    <div style={{ minHeight: '100vh', background: BG, display: 'flex', fontFamily: F }}>
      <Sidebar initialRole={initialRole} />
      <main className="flex-1 flex flex-col min-w-0 ml-0 md:ml-[232px]">
        <Header title={meta.title} subtitle={meta.subtitle} section={meta.section} onOpenMenu={() => setMobileOpen(true)} initialRole={initialRole} />
        <div
          className="flex-1 px-4 py-5 md:px-8 md:py-7 lg:px-10 lg:py-8"
          style={{ background: 'linear-gradient(180deg, rgba(255,255,255,.42) 0px, rgba(255,255,255,0) 240px)' }}
        >
          <GuidedExperience />
          {children}
        </div>
      </main>
      <AppToastViewport />
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-[90]"
          style={{ background: 'rgba(0,0,0,.45)' }}
          onClick={() => setMobileOpen(false)}
        >
          <div
            style={{ height: '100%', background: 'transparent', display: 'flex', alignItems: 'stretch' }}
            onClick={(e) => e.stopPropagation()}
          >
            <Sidebar variant="mobile" onNavigate={() => setMobileOpen(false)} initialRole={initialRole} />
            <div style={{ flex: 1 }} />
          </div>
        </div>
      )}
    </div>
  )
}

'use client'

import { F } from '@/lib/design-tokens'

export function Badge({ status }: { status: string }) {
  const normalized = String(status ?? '').trim()
  const key = normalized.toLowerCase()
  const S: Record<string, { bg: string; text: string; dot: string; label: string }> = {
    active: { bg: '#ECFDF5', text: '#059669', dot: '#10B981', label: 'Ativo' },
    approved: { bg: '#ECFDF5', text: '#059669', dot: '#10B981', label: 'Aprovado' },
    paid: { bg: '#ECFDF5', text: '#059669', dot: '#10B981', label: 'Pago' },
    delivered: { bg: '#ECFDF5', text: '#059669', dot: '#10B981', label: 'Entregue' },
    matched: { bg: '#ECFDF5', text: '#059669', dot: '#10B981', label: 'Conciliado' },
    resolved: { bg: '#ECFDF5', text: '#059669', dot: '#10B981', label: 'Resolvido' },
    draft: { bg: '#F8FAFC', text: '#64748B', dot: '#94A3B8', label: 'Rascunho' },
    created: { bg: '#FFFBEB', text: '#D97706', dot: '#F59E0B', label: 'Pendente' },
    pending: { bg: '#FFFBEB', text: '#D97706', dot: '#F59E0B', label: 'Pendente' },
    requested: { bg: '#FFFBEB', text: '#D97706', dot: '#F59E0B', label: 'Solicitado' },
    documents_pending: { bg: '#FFFBEB', text: '#D97706', dot: '#F59E0B', label: 'Documentos pendentes' },
    eligible: { bg: '#EFF6FF', text: '#2563EB', dot: '#3B82F6', label: 'Elegível' },
    under_review: { bg: '#EFF6FF', text: '#2563EB', dot: '#3B82F6', label: 'Em análise' },
    scheduled: { bg: '#EFF6FF', text: '#2563EB', dot: '#3B82F6', label: 'Agendado' },
    internally_approved: { bg: '#ECFDF5', text: '#059669', dot: '#10B981', label: 'Aprovado internamente' },
    provider_pending: { bg: '#FFF7ED', text: '#C2410C', dot: '#F97316', label: 'Aguardando integração' },
    provider_processing: { bg: '#EFF6FF', text: '#2563EB', dot: '#3B82F6', label: 'Processando no provider' },
    provider_synced: { bg: '#EFF6FF', text: '#2563EB', dot: '#3B82F6', label: 'Sincronizado com o provedor' },
    processing: { bg: '#EFF6FF', text: '#2563EB', dot: '#3B82F6', label: 'Processando' },
    rejected: { bg: '#FEF2F2', text: '#DC2626', dot: '#EF4444', label: 'Rejeitado' },
    internally_rejected: { bg: '#FEF2F2', text: '#DC2626', dot: '#EF4444', label: 'Reprovado internamente' },
    failed: { bg: '#FEF2F2', text: '#DC2626', dot: '#EF4444', label: 'Falhou' },
    canceled: { bg: '#F8FAFC', text: '#64748B', dot: '#94A3B8', label: 'Cancelado' },
    cancelled: { bg: '#F8FAFC', text: '#64748B', dot: '#94A3B8', label: 'Cancelado' },
    blocked: { bg: '#F8FAFC', text: '#64748B', dot: '#94A3B8', label: 'Bloqueado' },
    refunded: { bg: '#FFF7ED', text: '#C2410C', dot: '#F97316', label: 'Estornado' },
    inactive: { bg: '#F8FAFC', text: '#64748B', dot: '#94A3B8', label: 'Inativo' },
    paused: { bg: '#F8FAFC', text: '#64748B', dot: '#94A3B8', label: 'Pausado' },
    overdue: { bg: '#FEF2F2', text: '#DC2626', dot: '#EF4444', label: 'Inadimplente' },
    divergent: { bg: '#FFF7ED', text: '#C2410C', dot: '#F97316', label: 'Divergência' },
    upcoming: { bg: '#F8FAFC', text: '#64748B', dot: '#94A3B8', label: 'Pendente' },
  }

  const aliases: Record<string, string> = {
    pago: 'paid',
    rascunho: 'draft',
    elegivel: 'eligible',
    elegível: 'eligible',
    solicitado: 'requested',
    aprovado: 'approved',
    aprovada: 'approved',
    ativo: 'active',
    ativa: 'active',
    pendente: 'pending',
    'documentos pendentes': 'documents_pending',
    'em análise': 'under_review',
    em_analise: 'under_review',
    'aprovado internamente': 'internally_approved',
    'reprovado internamente': 'internally_rejected',
    'aguardando integração': 'provider_pending',
    aguardando_integracao: 'provider_pending',
    'processando no provider': 'provider_processing',
    processando_no_provider: 'provider_processing',
    bloqueado: 'blocked',
    processando: 'processing',
    recusado: 'rejected',
    recusada: 'rejected',
    rejeitado: 'rejected',
    falhou: 'failed',
    estornado: 'refunded',
    pausado: 'paused',
    cancelada: 'cancelled',
    cancelado: 'cancelled',
    cancelados: 'cancelled',
    canceled: 'cancelled',
    cancelada_interna: 'cancelled',
    agendado: 'scheduled',
    inadimplente: 'overdue',
    divergência: 'divergent',
    divergencia: 'divergent',
    conciliado: 'matched',
    entregue: 'delivered',
  }
  const mappedKey = aliases[key] ?? key
  const fallbackLabel = normalized
    ? normalized.charAt(0).toUpperCase() + normalized.slice(1).replaceAll('_', ' ')
    : 'Status'
  const s = S[mappedKey] ?? { bg: '#F8FAFC', text: '#64748B', dot: '#94A3B8', label: fallbackLabel }
  return (
    <span
      style={{ background: s.bg, color: s.text, fontFamily: F, border: `1px solid ${s.dot}22` }}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap"
    >
      <span style={{ background: s.dot, boxShadow: `0 0 0 3px ${s.dot}1F` }} className="w-1.5 h-1.5 rounded-full flex-shrink-0" />
      {s.label}
    </span>
  )
}

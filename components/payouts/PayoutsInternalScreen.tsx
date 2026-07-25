'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowRightLeft, CalendarClock, CheckCircle2, Download, Eraser, Eye, Plus, ShieldAlert, XCircle } from 'lucide-react'

import { emitAppToast, openGuide } from '@/lib/app-events'
import { BORDER, F, MONO, MUTED, NAVY, TEXT } from '@/lib/design-tokens'
import { Badge } from '@/components/ui/Badge'
import { DangerBtn, GhostBtn, PrimaryBtn } from '@/components/ui/Buttons'
import { EmptyState } from '@/components/ui/EmptyState'
import { KpiCard } from '@/components/ui/KpiCard'
import { Modal, ModalFieldLabel } from '@/components/ui/Modal'
import { TableSkeleton } from '@/components/ui/Skeleton'
import { TableCard, Td, Th } from '@/components/ui/Table'
import { fmtBRL } from '@/utils/format'

type ReceiverRecord = {
  id: string
  name: string
  document: string | null
  type: string | null
  status: string
  kycStatus: string
  internalStatus: string
  bankAccountMasked: {
    bank_code: string | null
    agency: string | null
    account: string | null
    account_digit: string | null
    account_type: string | null
    pix_key: string | null
  } | null
}

type PayoutRecord = {
  id: string
  receiverId: string
  grossAmountCents: number
  feeAmountCents: number
  netAmountCents: number
  status: string
  scheduledFor: string | null
  requestedAt: string | null
  approvedAt: string | null
  executedAt: string | null
  failedAt?: string | null
  cancelledAt?: string | null
  rejectedAt?: string | null
  rejectionReason: string | null
  internalNotes: string | null
  providerReference: string | null
  bankAccountMasked: ReceiverRecord['bankAccountMasked']
  receiver: ReceiverRecord | null
}

type HistoryEvent = {
  id: string
  eventType: string
  providerEventId: string | null
  createdAt: string
}

type PayoutForm = {
  id?: string | null
  receiverId: string
  grossAmountInput: string
  status: 'draft' | 'requested' | 'under_review' | 'approved' | 'rejected' | 'scheduled' | 'cancelled'
  scheduledFor: string
  rejectionReason: string
  internalNotes: string
}

function Notice({
  children,
  tone = 'info',
  style,
}: {
  children: React.ReactNode
  tone?: 'info' | 'warning' | 'success'
  style?: React.CSSProperties
}) {
  const palette =
    tone === 'warning'
      ? { bg: '#FFF7ED', border: '#FED7AA', text: '#9A3412' }
      : tone === 'success'
        ? { bg: '#ECFDF5', border: '#A7F3D0', text: '#047857' }
        : { bg: '#EFF6FF', border: '#BFDBFE', text: '#1D4ED8' }

  return (
    <div
      style={{
        background: palette.bg,
        border: `1px solid ${palette.border}`,
        borderRadius: 14,
        padding: '12px 14px',
        fontFamily: F,
        fontSize: 12.5,
        lineHeight: 1.6,
        color: palette.text,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

function parseMoneyToCents(input: string) {
  const normalized = input.replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, '')
  const value = Number(normalized)
  if (!Number.isFinite(value) || value <= 0) return 0
  return Math.round(value * 100)
}

function formatMoneyInput(valueCents: number | null | undefined) {
  if (!valueCents || valueCents <= 0) return ''
  return (valueCents / 100).toFixed(2).replace('.', ',')
}

function formatDate(value: string | null | undefined) {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('pt-BR', { timeZone: 'UTC' })
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: 'Rascunho',
    requested: 'Solicitado',
    under_review: 'Em análise',
    approved: 'Aprovado',
    rejected: 'Reprovado',
    scheduled: 'Agendado',
    provider_pending: 'Aguardando provider',
    provider_processing: 'Processando no provider',
    paid: 'Pago',
    failed: 'Falhou',
    cancelled: 'Cancelado',
  }
  return labels[status] ?? status
}

function bankLabel(bank: ReceiverRecord['bankAccountMasked'] | null | undefined) {
  if (!bank) return 'Conta bancaria nao configurada'
  return `${bank.bank_code ?? '---'} · ${bank.agency ?? '--'}/${bank.account ?? '---'}`
}

function createEmptyDraft(receivers: ReceiverRecord[]): PayoutForm {
  return {
    receiverId: receivers[0]?.id ?? '',
    grossAmountInput: '',
    status: 'draft',
    scheduledFor: '',
    rejectionReason: '',
    internalNotes: '',
  }
}

function payoutToDraft(payout: PayoutRecord): PayoutForm {
  return {
    id: payout.id,
    receiverId: payout.receiverId,
    grossAmountInput: formatMoneyInput(payout.grossAmountCents),
    status: ['draft', 'requested', 'under_review', 'approved', 'rejected', 'scheduled', 'cancelled'].includes(payout.status)
      ? (payout.status as PayoutForm['status'])
      : 'draft',
    scheduledFor: payout.scheduledFor ?? '',
    rejectionReason: payout.rejectionReason ?? '',
    internalNotes: payout.internalNotes ?? '',
  }
}

function toPayload(draft: PayoutForm) {
  return {
    receiverId: draft.receiverId,
    grossAmountCents: parseMoneyToCents(draft.grossAmountInput),
    status: draft.status,
    scheduledFor: draft.scheduledFor || null,
    rejectionReason: draft.rejectionReason || null,
    internalNotes: draft.internalNotes || null,
  }
}

function downloadCsv(filename: string, rows: Array<Record<string, unknown>>) {
  if (!rows.length) return
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))))
  const csv = [
    headers.join(','),
    ...rows.map((row) =>
      headers
        .map((header) => {
          const raw = row[header]
          const value = raw == null ? '' : String(raw)
          return `"${value.replaceAll('"', '""')}"`
        })
        .join(','),
    ),
  ].join('\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function PayoutsInternalScreen() {
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [simulating, setSimulating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [availableBalanceCents, setAvailableBalanceCents] = useState(0)
  const [providerEnabled, setProviderEnabled] = useState(false)
  const [receivers, setReceivers] = useState<ReceiverRecord[]>([])
  const [payouts, setPayouts] = useState<PayoutRecord[]>([])
  const [summary, setSummary] = useState({ total: 0, requested: 0, underReview: 0, approvedOrScheduled: 0, cancelledOrRejected: 0 })
  const [filter, setFilter] = useState<'all' | 'requested' | 'under_review' | 'approved' | 'scheduled' | 'rejected' | 'cancelled'>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyTitle, setHistoryTitle] = useState('Histórico do repasse')
  const [historyEvents, setHistoryEvents] = useState<HistoryEvent[]>([])
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [draft, setDraft] = useState<PayoutForm>(createEmptyDraft([]))
  const [simulation, setSimulation] = useState<null | {
    feeBps: number
    grossAmountCents: number
    feeAmountCents: number
    netAmountCents: number
    availableBalanceCents: number
    remainingBalanceCents: number
  }>(null)

  async function loadBootstrap() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/payouts-internal', { method: 'GET' })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setError(typeof json?.error === 'string' ? json.error : 'Nao foi possivel carregar os repasses internos.')
        setReceivers([])
        setPayouts([])
        return
      }
      const receiverRows = Array.isArray(json?.eligibleReceivers) ? json.eligibleReceivers : []
      setReceivers(receiverRows)
      setPayouts(Array.isArray(json?.payouts) ? json.payouts : [])
      setAvailableBalanceCents(Number(json?.availableBalanceCents ?? 0))
      setProviderEnabled(Boolean(json?.providerEnabled))
      setSummary(
        json?.summary ?? { total: 0, requested: 0, underReview: 0, approvedOrScheduled: 0, cancelledOrRejected: 0 },
      )
      setDraft((current) => (current.receiverId ? current : createEmptyDraft(receiverRows)))
    } catch {
      setError('Nao foi possivel carregar os repasses internos.')
      setReceivers([])
      setPayouts([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadBootstrap()
  }, [])

  const receiverMap = useMemo(() => new Map(receivers.map((receiver) => [receiver.id, receiver])), [receivers])
  const filteredPayouts = useMemo(
    () => (filter === 'all' ? payouts : payouts.filter((item) => item.status === filter)),
    [filter, payouts],
  )

  const currentReceiver = receiverMap.get(draft.receiverId) ?? null
  const finalStatus = useMemo(() => ['rejected', 'paid', 'failed', 'cancelled'], [])

  async function runSimulation(nextDraft: PayoutForm) {
    const payload = toPayload(nextDraft)
    if (!payload.receiverId || !payload.grossAmountCents) {
      setSimulation(null)
      return
    }
    setSimulating(true)
    try {
      const res = await fetch('/api/payouts-internal/simulate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json().catch(() => null)
      setSimulation(json?.simulation ?? null)
      if (!res.ok && Array.isArray(json?.issues) && json.issues[0]?.message) {
        setError(String(json.issues[0].message))
      }
    } finally {
      setSimulating(false)
    }
  }

  async function openCreateModal() {
    const next = createEmptyDraft(receivers)
    setDraft(next)
    setSimulation(null)
    setModalOpen(true)
    await runSimulation(next)
  }

  async function openEditModal(payout: PayoutRecord) {
    const next = payoutToDraft(payout)
    setDraft(next)
    setSimulation(null)
    setModalOpen(true)
    await runSimulation(next)
  }

  async function openHistory(payout: PayoutRecord) {
    setHistoryTitle(`Histórico · ${payout.receiver?.name ?? payout.id}`)
    setHistoryOpen(true)
    setHistoryEvents([])
    setHistoryError(null)
    try {
      const res = await fetch(`/api/payouts-internal/${payout.id}`, { method: 'GET' })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        const message = typeof json?.error === 'string' ? json.error : 'Nao foi possivel carregar o historico agora.'
        setHistoryError(message)
        emitAppToast({ tone: 'error', title: 'Historico indisponivel', message })
        return
      }
      setHistoryEvents(Array.isArray(json?.events) ? json.events : [])
    } catch {
      const message = 'Nao foi possivel carregar o historico agora.'
      setHistoryError(message)
      emitAppToast({ tone: 'error', title: 'Historico indisponivel', message })
      return
    }
  }

  async function saveDraft() {
    setSubmitting(true)
    setError(null)
    try {
      const payload = toPayload(draft)
      const isEdit = Boolean(draft.id)
      const res = await fetch(isEdit ? `/api/payouts-internal/${draft.id}` : '/api/payouts-internal', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setError(typeof json?.error === 'string' ? json.error : 'Nao foi possivel salvar a solicitacao interna.')
        return
      }
      emitAppToast({
        tone: 'success',
        title: isEdit ? 'Repasse atualizado' : 'Repasse criado',
        message: isEdit ? 'A solicitacao interna foi atualizada com sucesso.' : 'A solicitacao interna foi registrada sem acionar provider.',
      })
      setModalOpen(false)
      await loadBootstrap()
    } finally {
      setSubmitting(false)
    }
  }

  async function removeDraft(payout: PayoutRecord) {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/payouts-internal/${payout.id}`, { method: 'DELETE' })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setError(typeof json?.error === 'string' ? json.error : 'Nao foi possivel excluir o rascunho.')
        return
      }
      emitAppToast({ tone: 'success', title: 'Rascunho removido', message: 'O repasse interno em rascunho foi excluido.' })
      await loadBootstrap()
    } finally {
      setSubmitting(false)
    }
  }

  async function quickStatusUpdate(payout: PayoutRecord, status: PayoutForm['status']) {
    const baseDraft = payoutToDraft(payout)
    const payload = toPayload({
      ...baseDraft,
      status,
      scheduledFor: status === 'scheduled' ? baseDraft.scheduledFor || new Date().toISOString().slice(0, 10) : baseDraft.scheduledFor,
      rejectionReason: status === 'rejected' ? baseDraft.rejectionReason || 'Solicitacao reprovada internamente.' : '',
    })
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/payouts-internal/${payout.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setError(typeof json?.error === 'string' ? json.error : 'Nao foi possivel atualizar o status do repasse interno.')
        return
      }
      emitAppToast({
        tone: 'success',
        title: 'Status atualizado',
        message: `O repasse interno foi movido para ${statusLabel(status).toLowerCase()}.`,
      })
      await loadBootstrap()
    } finally {
      setSubmitting(false)
    }
  }

  const kpis = [
    { label: 'Saldo disponivel', value: fmtBRL(availableBalanceCents), sub: 'Baseado no ledger atual', icon: ArrowRightLeft, accent: true },
    { label: 'Solicitacoes internas', value: String(summary.total), sub: 'Historico da organizacao', icon: CalendarClock },
    { label: 'Em analise', value: String(summary.underReview), sub: 'Aguardando decisao interna', icon: ShieldAlert },
    { label: 'Aprovados ou agendados', value: String(summary.approvedOrScheduled), sub: 'Sem provider acionado', icon: CheckCircle2 },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Notice>
        <strong>Repasses Internos</strong> organizam solicitacoes, revisoes e previsoes de liquidacao somente dentro da Connekt Pay.{' '}
        <strong>O repasse real sera habilitado apos a configuracao e homologacao da Pagar.me.</strong>
      </Notice>

      <Notice tone={providerEnabled ? 'warning' : 'success'}>
        <strong>Flag do provider:</strong> `PAYOUT_PROVIDER_ENABLED=false`
      </Notice>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <GhostBtn onClick={() => openGuide('onboarding', { target: 'payouts-internal' })}>Abrir onboarding</GhostBtn>
        <GhostBtn onClick={() => openGuide('tour', { target: 'payouts-internal' })}>Ver ajuda contextual</GhostBtn>
        <PrimaryBtn onClick={() => void openCreateModal()}>
          <Plus size={15} />
          Nova solicitacao
        </PrimaryBtn>
      </div>

      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        {kpis.map((kpi, index) => (
          <KpiCard
            key={kpi.label}
            label={kpi.label}
            value={loading ? '—' : kpi.value}
            sub={kpi.sub}
            icon={kpi.icon}
            accent={Boolean(kpi.accent) || index === 0}
            loading={loading}
          />
        ))}
      </div>

      <Notice tone="info">
        <strong>Checklist desta fase:</strong> criar rascunho, solicitar, revisar, aprovar ou reprovar, agendar quando necessario, cancelar se preciso, exportar historico e simular valor liquido sem movimentacao real.
      </Notice>

      <div style={{ background: 'white', borderRadius: 16, border: `1px solid ${BORDER}`, padding: '14px 16px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        {[
          ['all', 'Todos'],
          ['requested', 'Solicitados'],
          ['under_review', 'Em analise'],
          ['approved', 'Aprovados'],
          ['scheduled', 'Agendados'],
          ['rejected', 'Reprovados'],
          ['cancelled', 'Cancelados'],
        ].map(([value, label]) => (
          <button
            key={value}
            onClick={() => setFilter(value as typeof filter)}
            style={{
              padding: '7px 12px',
              borderRadius: 10,
              border: filter === value ? 'none' : `1px solid ${BORDER}`,
              background: filter === value ? NAVY : 'white',
              color: filter === value ? 'white' : MUTED,
              fontFamily: F,
              fontWeight: 700,
              fontSize: 12.5,
              cursor: 'pointer',
            }}
          >
            {label}
          </button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <GhostBtn
            onClick={() =>
              downloadCsv(
                'payouts-internal.csv',
                filteredPayouts.map((item) => ({
                  payout_id: item.id,
                  receiver: item.receiver?.name ?? item.receiverId,
                  document: item.receiver?.document ?? '',
                  gross_amount_cents: item.grossAmountCents,
                  fee_amount_cents: item.feeAmountCents,
                  net_amount_cents: item.netAmountCents,
                  status: statusLabel(item.status),
                  requested_at: item.requestedAt,
                  approved_at: item.approvedAt,
                  scheduled_for: item.scheduledFor,
                  executed_at: item.executedAt,
                  internal_notes: item.internalNotes ?? '',
                })),
              )
            }
            disabled={!filteredPayouts.length}
          >
            <Download size={14} />
            Exportar
          </GhostBtn>
          <GhostBtn onClick={() => void loadBootstrap()} disabled={loading}>
            Atualizar
          </GhostBtn>
        </div>
      </div>

      {error ? <Notice tone="warning">{error}</Notice> : null}

      <TableCard>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#FAFBFD' }}>
              {['Solicitacao', 'Recebedor', 'Valor bruto', 'Valor liquido', 'Conta usada', 'Status', 'Proximo passo', 'Acoes'].map((header) => (
                <Th key={header}>{header}</Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredPayouts.map((item) => {
              const locked = finalStatus.includes(item.status)
              return (
                <tr key={item.id}>
                  <td style={{ padding: '13px 20px', borderBottom: `1px solid ${BORDER}`, fontFamily: MONO, fontSize: 12, color: MUTED }}>
                    <div>{item.id}</div>
                    <div style={{ marginTop: 4 }}>{formatDate(item.requestedAt)}</div>
                  </td>
                  <td style={{ padding: '13px 20px', borderBottom: `1px solid ${BORDER}` }}>
                    <div style={{ fontFamily: F, fontWeight: 700, fontSize: 13, color: TEXT }}>{item.receiver?.name ?? item.receiverId}</div>
                    <div style={{ fontFamily: MONO, fontSize: 11, color: MUTED }}>{item.receiver?.document ?? '-'}</div>
                  </td>
                  <Td>
                    <span style={{ fontFamily: MONO, fontWeight: 700 }}>{fmtBRL(item.grossAmountCents)}</span>
                  </Td>
                  <Td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ fontFamily: MONO, fontWeight: 800, color: '#059669' }}>{fmtBRL(item.netAmountCents)}</span>
                      <span style={{ fontFamily: MONO, fontSize: 11, color: MUTED }}>Taxas: {fmtBRL(item.feeAmountCents)}</span>
                    </div>
                  </Td>
                  <td style={{ padding: '13px 20px', borderBottom: `1px solid ${BORDER}`, fontFamily: F, fontSize: 12, color: MUTED }}>
                    {bankLabel(item.bankAccountMasked)}
                  </td>
                  <td style={{ padding: '13px 20px', borderBottom: `1px solid ${BORDER}` }}>
                    <Badge status={item.status} />
                  </td>
                  <td style={{ padding: '13px 20px', borderBottom: `1px solid ${BORDER}`, fontFamily: F, fontSize: 12, color: MUTED }}>
                    {item.status === 'requested' && 'Enviar para analise interna'}
                    {item.status === 'under_review' && 'Decidir aprovacao ou reprovacao'}
                    {item.status === 'approved' && 'Agendar ou manter aprovado'}
                    {item.status === 'scheduled' && `Previsto para ${formatDate(item.scheduledFor)}`}
                    {item.status === 'draft' && 'Completar dados e solicitar'}
                    {item.status === 'rejected' && (item.rejectionReason ?? 'Solicitacao encerrada')}
                    {item.status === 'cancelled' && 'Fluxo encerrado internamente'}
                    {locked && item.status !== 'rejected' && item.status !== 'cancelled' ? 'Aguardando integracao real com provider' : null}
                  </td>
                  <td style={{ padding: '13px 20px', borderBottom: `1px solid ${BORDER}` }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <GhostBtn onClick={() => void openHistory(item)}>
                        <Eye size={14} />
                        Historico
                      </GhostBtn>
                      {!locked ? (
                        <GhostBtn onClick={() => void openEditModal(item)}>Editar</GhostBtn>
                      ) : null}
                      {item.status === 'requested' ? <GhostBtn onClick={() => void quickStatusUpdate(item, 'under_review')}>Revisar</GhostBtn> : null}
                      {item.status === 'under_review' ? <GhostBtn onClick={() => void quickStatusUpdate(item, 'approved')}>Aprovar</GhostBtn> : null}
                      {item.status === 'under_review' ? (
                        <DangerBtn onClick={() => void quickStatusUpdate(item, 'rejected')}>
                          <XCircle size={14} />
                          Reprovar
                        </DangerBtn>
                      ) : null}
                      {item.status === 'approved' ? <GhostBtn onClick={() => void quickStatusUpdate(item, 'scheduled')}>Agendar</GhostBtn> : null}
                      {!locked && item.status !== 'cancelled' ? (
                        <DangerBtn onClick={() => void quickStatusUpdate(item, 'cancelled')}>
                          <Eraser size={14} />
                          Cancelar
                        </DangerBtn>
                      ) : null}
                      {item.status === 'draft' ? (
                        <DangerBtn onClick={() => void removeDraft(item)}>
                          <Eraser size={14} />
                          Excluir
                        </DangerBtn>
                      ) : null}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {loading ? <TableSkeleton rows={6} cols={8} /> : null}
        {!loading && filteredPayouts.length === 0 ? (
          <EmptyState
            icon={<ArrowRightLeft size={18} style={{ color: NAVY }} />}
            title="Nenhum repasse interno encontrado"
            description="Crie a primeira solicitacao para simular taxas, acompanhar analise e preparar a camada interna sem acionar provider."
          />
        ) : null}
      </TableCard>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={draft.id ? 'Editar repasse interno' : 'Nova solicitacao interna'}
        description="Revise valor, status, previsao e observacoes. Nenhuma transferencia real sera executada nesta fase."
        maxWidth={760}
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <GhostBtn onClick={() => setModalOpen(false)}>Fechar</GhostBtn>
            <PrimaryBtn onClick={() => void saveDraft()} loading={submitting}>
              Salvar solicitacao
            </PrimaryBtn>
          </div>
        }
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1.15fr .85fr', gap: 18 }}>
          <div style={{ display: 'grid', gap: 14 }}>
            <div>
              <ModalFieldLabel>Recebedor</ModalFieldLabel>
              <select
                value={draft.receiverId}
                onChange={(e) => {
                  const next = { ...draft, receiverId: e.target.value }
                  setDraft(next)
                  void runSimulation(next)
                }}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 12, border: `1px solid ${BORDER}`, fontFamily: F, fontSize: 13 }}
              >
                {receivers.map((receiver) => (
                  <option key={receiver.id} value={receiver.id}>
                    {receiver.name} · {receiver.document ?? 'sem documento'}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <ModalFieldLabel>Valor solicitado</ModalFieldLabel>
              <input
                value={draft.grossAmountInput}
                onChange={(e) => {
                  const next = { ...draft, grossAmountInput: e.target.value }
                  setDraft(next)
                  void runSimulation(next)
                }}
                placeholder="Ex.: 1500,00"
                style={{ width: '100%', padding: '10px 12px', borderRadius: 12, border: `1px solid ${BORDER}`, fontFamily: F, fontSize: 13 }}
              />
            </div>

            <div>
              <ModalFieldLabel>Status interno</ModalFieldLabel>
              <select
                value={draft.status}
                onChange={(e) => {
                  const next = { ...draft, status: e.target.value as PayoutForm['status'] }
                  setDraft(next)
                  void runSimulation(next)
                }}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 12, border: `1px solid ${BORDER}`, fontFamily: F, fontSize: 13 }}
              >
                {[
                  ['draft', 'Rascunho'],
                  ['requested', 'Solicitado'],
                  ['under_review', 'Em analise'],
                  ['approved', 'Aprovado'],
                  ['rejected', 'Reprovado'],
                  ['scheduled', 'Agendado'],
                  ['cancelled', 'Cancelado'],
                ].map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <ModalFieldLabel>Data prevista</ModalFieldLabel>
              <input
                type="date"
                value={draft.scheduledFor}
                onChange={(e) => {
                  const next = { ...draft, scheduledFor: e.target.value }
                  setDraft(next)
                  void runSimulation(next)
                }}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 12, border: `1px solid ${BORDER}`, fontFamily: F, fontSize: 13 }}
              />
            </div>

            <div>
              <ModalFieldLabel>Motivo da reprovacao</ModalFieldLabel>
              <textarea
                value={draft.rejectionReason}
                onChange={(e) => setDraft({ ...draft, rejectionReason: e.target.value })}
                rows={3}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 12, border: `1px solid ${BORDER}`, fontFamily: F, fontSize: 13, resize: 'vertical' }}
              />
            </div>

            <div>
              <ModalFieldLabel>Observacoes internas</ModalFieldLabel>
              <textarea
                value={draft.internalNotes}
                onChange={(e) => setDraft({ ...draft, internalNotes: e.target.value })}
                rows={4}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 12, border: `1px solid ${BORDER}`, fontFamily: F, fontSize: 13, resize: 'vertical' }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
            <Notice tone="info">
              <strong>Explicacao leiga:</strong> o repasse interno organiza a sua solicitacao e a analise operacional, mas nao transfere dinheiro nesta fase.
            </Notice>

            <div style={{ background: '#FAFBFD', border: `1px solid ${BORDER}`, borderRadius: 16, padding: 16 }}>
              <p style={{ fontFamily: F, fontWeight: 800, fontSize: 13, color: TEXT, marginBottom: 10 }}>Resumo da simulacao</p>
              <div style={{ display: 'grid', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ fontFamily: F, fontSize: 12, color: MUTED }}>Valor disponivel</span>
                  <strong style={{ fontFamily: MONO, fontSize: 12.5, color: TEXT }}>{fmtBRL(availableBalanceCents)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ fontFamily: F, fontSize: 12, color: MUTED }}>Valor solicitado</span>
                  <strong style={{ fontFamily: MONO, fontSize: 12.5, color: TEXT }}>{simulation ? fmtBRL(simulation.grossAmountCents) : '-'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ fontFamily: F, fontSize: 12, color: MUTED }}>Taxas internas</span>
                  <strong style={{ fontFamily: MONO, fontSize: 12.5, color: '#DC2626' }}>{simulation ? fmtBRL(simulation.feeAmountCents) : '-'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ fontFamily: F, fontSize: 12, color: MUTED }}>Valor liquido</span>
                  <strong style={{ fontFamily: MONO, fontSize: 12.5, color: '#059669' }}>{simulation ? fmtBRL(simulation.netAmountCents) : '-'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ fontFamily: F, fontSize: 12, color: MUTED }}>Saldo restante estimado</span>
                  <strong style={{ fontFamily: MONO, fontSize: 12.5, color: TEXT }}>{simulation ? fmtBRL(simulation.remainingBalanceCents) : '-'}</strong>
                </div>
              </div>
            </div>

            <div style={{ background: '#FAFBFD', border: `1px solid ${BORDER}`, borderRadius: 16, padding: 16 }}>
              <p style={{ fontFamily: F, fontWeight: 800, fontSize: 13, color: TEXT, marginBottom: 10 }}>Conta mascarada usada na solicitacao</p>
              <p style={{ fontFamily: F, fontSize: 12.5, color: MUTED, lineHeight: 1.6 }}>{bankLabel(currentReceiver?.bankAccountMasked)}</p>
            </div>

            <Notice tone="warning">
              <strong>Proximo passo:</strong> depois de solicitado, o repasse pode seguir para analise, aprovacao interna, agendamento ou cancelamento, sempre sem chamada ao provider enquanto a flag permanecer desabilitada.
            </Notice>

            {simulating ? <Notice tone="info">Atualizando simulacao...</Notice> : null}
          </div>
        </div>
      </Modal>

      <Modal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title={historyTitle}
        description="Consulte a trilha interna de eventos da solicitacao."
        maxWidth={640}
        footer={<GhostBtn onClick={() => setHistoryOpen(false)}>Fechar</GhostBtn>}
      >
        {historyError ? (
          <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, padding: '12px 14px', background: '#FFF7ED', fontFamily: F, fontSize: 12.5, color: '#9A3412' }}>
            {historyError}
          </div>
        ) : historyEvents.length ? (
          <div style={{ display: 'grid', gap: 10 }}>
            {historyEvents.map((event) => (
              <div key={event.id} style={{ border: `1px solid ${BORDER}`, borderRadius: 12, padding: '12px 14px', background: '#FAFBFD' }}>
                <div style={{ fontFamily: F, fontWeight: 700, fontSize: 13, color: TEXT }}>{event.eventType}</div>
                <div style={{ fontFamily: MONO, fontSize: 11, color: MUTED, marginTop: 6 }}>{new Date(event.createdAt).toLocaleString('pt-BR')}</div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={<Eye size={18} style={{ color: NAVY }} />} title="Sem eventos carregados" description="Abra o historico de uma solicitacao para consultar as movimentacoes internas registradas." />
        )}
      </Modal>
    </div>
  )
}

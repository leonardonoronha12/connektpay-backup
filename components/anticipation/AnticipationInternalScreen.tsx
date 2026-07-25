'use client'

import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, CheckCircle2, Clock3, Download, Eye, ShieldCheck, Wallet, XCircle } from 'lucide-react'

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

type AnticipationRecord = {
  id: string
  receiverId: string
  requestedAmountCents: number
  eligibleAmountCents: number
  estimatedFeeBps: number
  effectiveFeeBps: number
  estimatedFeeCents: number
  effectiveFeeCents: number
  netAmountCents: number
  expectedSettlementDays: number
  expectedSettlementDate: string | null
  status: string
  requestedAt: string | null
  approvedAt: string | null
  paidAt: string | null
  rejectedAt: string | null
  cancelledAt?: string | null
  rejectionReason: string | null
  internalNotes: string | null
  providerReference: string | null
  receiver: ReceiverRecord | null
}

type HistoryEvent = {
  id: string
  eventType: string
  providerEventId: string | null
  createdAt: string
}

type SimulationState = {
  requestedAmountCents: number
  availableAmountCents: number
  balanceCents: number
  reservedCents: number
  estimatedFeeBps: number
  estimatedFeeCents: number
  discountCents: number
  netAmountCents: number
  settlementDays: number
}

type RequestForm = {
  receiverId: string
  requestedAmountInput: string
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

function bankLabel(bank: ReceiverRecord['bankAccountMasked'] | null | undefined) {
  if (!bank) return 'Conta bancaria nao configurada'
  return `${bank.bank_code ?? '---'} · ${bank.agency ?? '--'}/${bank.account ?? '---'}`
}

function eventLabel(eventType: string) {
  const labels: Record<string, string> = {
    'anticipation.internal.created': 'Rascunho interno criado',
    'anticipation.internal.requested': 'Solicitação enviada',
    'anticipation.internal.under_review': 'Em análise',
    'anticipation.internal.approved': 'Aprovada',
    'anticipation.internal.rejected': 'Reprovada',
    'anticipation.internal.scheduled': 'Agendada',
    'anticipation.internal.cancelled': 'Cancelada',
    'anticipation.internal.deleted': 'Excluída',
  }
  return labels[eventType] ?? eventType
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

export function AnticipationInternalScreen() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [simulating, setSimulating] = useState(false)
  const [providerEnabled, setProviderEnabled] = useState(false)
  const [anticipations, setAnticipations] = useState<AnticipationRecord[]>([])
  const [receivers, setReceivers] = useState<ReceiverRecord[]>([])
  const [availableCents, setAvailableCents] = useState(0)
  const [balanceCents, setBalanceCents] = useState(0)
  const [reservedCents, setReservedCents] = useState(0)
  const [summary, setSummary] = useState({ total: 0, requested: 0, underReview: 0, approvedOrScheduled: 0, cancelledOrRejected: 0 })
  const [filter, setFilter] = useState<'all' | 'requested' | 'under_review' | 'approved' | 'scheduled' | 'rejected' | 'cancelled'>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyTitle, setHistoryTitle] = useState('Histórico da antecipação')
  const [historyEvents, setHistoryEvents] = useState<HistoryEvent[]>([])
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [simulation, setSimulation] = useState<SimulationState | null>(null)
  const [cancelingId, setCancelingId] = useState<string | null>(null)
  const [form, setForm] = useState<RequestForm>({ receiverId: '', requestedAmountInput: '', internalNotes: '' })

  async function loadBootstrap() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/anticipation', { method: 'GET' })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setError(typeof json?.error === 'string' ? json.error : 'Nao foi possivel carregar a antecipacao interna.')
        setAnticipations([])
        setReceivers([])
        return
      }
      const eligibleReceivers = Array.isArray(json?.eligibleReceivers) ? json.eligibleReceivers : []
      setAnticipations(Array.isArray(json?.anticipations) ? json.anticipations : [])
      setReceivers(eligibleReceivers)
      setAvailableCents(Number(json?.availableCents ?? 0))
      setBalanceCents(Number(json?.balanceCents ?? 0))
      setReservedCents(Number(json?.reservedCents ?? 0))
      setProviderEnabled(Boolean(json?.providerEnabled))
      setSummary(json?.summary ?? { total: 0, requested: 0, underReview: 0, approvedOrScheduled: 0, cancelledOrRejected: 0 })
      setForm((current) => ({ ...current, receiverId: current.receiverId || eligibleReceivers[0]?.id || '' }))
    } catch {
      setError('Nao foi possivel carregar a antecipacao interna.')
      setAnticipations([])
      setReceivers([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadBootstrap()
  }, [])

  const filteredItems = useMemo(
    () => (filter === 'all' ? anticipations : anticipations.filter((item) => item.status === filter)),
    [anticipations, filter],
  )
  const selectedReceiver = useMemo(() => receivers.find((item) => item.id === form.receiverId) ?? null, [form.receiverId, receivers])
  const requestedAmountCents = parseMoneyToCents(form.requestedAmountInput)

  async function runSimulation(nextForm: RequestForm) {
    if (!nextForm.receiverId || !parseMoneyToCents(nextForm.requestedAmountInput)) {
      setSimulation(null)
      return
    }
    setSimulating(true)
    try {
      const res = await fetch('/api/anticipation/simulate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          receiverId: nextForm.receiverId,
          requestedAmountCents: parseMoneyToCents(nextForm.requestedAmountInput),
        }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setSimulation(null)
        if (typeof json?.error === 'string') setError(json.error)
        return
      }
      setSimulation({
        requestedAmountCents: Number(json?.requestedAmountCents ?? 0),
        availableAmountCents: Number(json?.availableAmountCents ?? 0),
        balanceCents: Number(json?.balanceCents ?? 0),
        reservedCents: Number(json?.reservedCents ?? 0),
        estimatedFeeBps: Number(json?.feeBps ?? 0),
        estimatedFeeCents: Number(json?.feeCents ?? 0),
        discountCents: Number(json?.discountCents ?? json?.feeCents ?? 0),
        netAmountCents: Number(json?.netCents ?? 0),
        settlementDays: Number(json?.settlementDays ?? 2),
      })
      if (Array.isArray(json?.issues) && json.issues[0]?.message) {
        setError(String(json.issues[0].message))
      }
    } finally {
      setSimulating(false)
    }
  }

  async function openRequestModal() {
    setError(null)
    const nextForm = {
      receiverId: receivers[0]?.id ?? '',
      requestedAmountInput: formatMoneyInput(Math.min(availableCents, 100_000)),
      internalNotes: '',
    }
    setForm(nextForm)
    setSimulation(null)
    setModalOpen(true)
    await runSimulation(nextForm)
  }

  async function openHistory(item: AnticipationRecord) {
    setHistoryOpen(true)
    setHistoryTitle(`Histórico · ${item.receiver?.name ?? item.id}`)
    setHistoryEvents([])
    setHistoryError(null)
    try {
      const res = await fetch(`/api/anticipation/${item.id}`, { method: 'GET' })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        const message = typeof json?.error === 'string' ? json.error : 'Nao foi possivel carregar o historico agora.'
        setHistoryError(message)
        emitAppToast({ tone: 'error', title: 'Histórico indisponível', message })
        return
      }
      setHistoryEvents(Array.isArray(json?.events) ? json.events : [])
    } catch {
      const message = 'Nao foi possivel carregar o historico agora.'
      setHistoryError(message)
      emitAppToast({ tone: 'error', title: 'Histórico indisponível', message })
      return
    }
  }

  async function cancelRequest(item: AnticipationRecord) {
    if (cancelingId) return
    setCancelingId(item.id)
    setError(null)
    try {
      const res = await fetch(`/api/anticipation/${item.id}/cancel`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setError(typeof json?.error === 'string' ? json.error : 'Nao foi possivel cancelar a antecipacao.')
        return
      }
      emitAppToast({ tone: 'success', title: 'Solicitação cancelada', message: 'A antecipação foi cancelada sem movimentação financeira real.' })
      await loadBootstrap()
    } finally {
      setCancelingId(null)
    }
  }

  async function submitRequest() {
    if (!selectedReceiver || !requestedAmountCents) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/anticipation', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          recebedorId: selectedReceiver.id,
          requestedAmountCents,
          internalNotes: form.internalNotes || null,
        }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setError(typeof json?.error === 'string' ? json.error : 'Nao foi possivel registrar a solicitacao.')
        return
      }
      emitAppToast({ tone: 'success', title: 'Solicitação enviada', message: 'A antecipação entrou em fluxo interno de análise.' })
      setModalOpen(false)
      await loadBootstrap()
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit = Boolean(selectedReceiver && requestedAmountCents > 0 && requestedAmountCents <= availableCents && !submitting)

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          <KpiCard label="Saldo elegível" value={fmtBRL(availableCents)} sub={`Reservado: ${fmtBRL(reservedCents)}`} icon={Wallet} loading={loading} accent />
          <KpiCard label="Saldo consolidado" value={fmtBRL(balanceCents)} sub="Base lida do ledger interno" icon={ShieldCheck} loading={loading} />
          <KpiCard label="Solicitações abertas" value={String(summary.requested + summary.underReview + summary.approvedOrScheduled)} sub="Em análise, aprovadas ou agendadas" icon={Clock3} loading={loading} />
          <KpiCard label="Líquido estimado" value={simulation ? fmtBRL(simulation.netAmountCents) : '—'} sub={simulation ? `${simulation.settlementDays} dia(s) estimados` : 'Simule para ver o valor líquido'} icon={CheckCircle2} />
        </div>

        <Notice>
          <strong>Antecipação Interna</strong> ajuda a planejar adiantamentos de recebíveis sem movimentação financeira real nesta fase.{' '}
          <strong>A antecipação financeira será habilitada após a configuração e homologação da Pagar.me.</strong>
        </Notice>

        <Notice tone={providerEnabled ? 'warning' : 'success'}>
          <strong>Flag do provider:</strong> `ANTICIPATION_PROVIDER_ENABLED=false`
        </Notice>

        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
          <div style={{ background: 'white', borderRadius: 16, border: `1px solid ${BORDER}`, padding: 22 }}>
            <p style={{ fontFamily: F, fontWeight: 900, fontSize: 16, color: TEXT }}>Como funciona a antecipação interna</p>
            <div style={{ height: 10 }} />
            <div style={{ display: 'grid', gap: 10 }}>
              {['1. Escolha um recebedor elegível e simule o valor.', '2. Revise taxa, desconto, líquido e prazo estimado.', '3. Envie a solicitação para análise interna.', '4. Acompanhe status, próximos passos e histórico da operação.'].map((item) => (
                <div key={item} style={{ border: `1px solid ${BORDER}`, borderRadius: 12, padding: '10px 12px', fontFamily: F, fontSize: 12.5, color: TEXT, background: '#FAFBFD' }}>
                  {item}
                </div>
              ))}
            </div>
            <div style={{ height: 14 }} />
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <PrimaryBtn onClick={() => openGuide('onboarding', { target: 'antecipacao-interna' })}>Ver onboarding</PrimaryBtn>
              <GhostBtn onClick={() => openRequestModal()} disabled={loading || receivers.length === 0 || availableCents <= 0}>
                Simular e solicitar
              </GhostBtn>
            </div>
          </div>

          <div style={{ background: 'white', borderRadius: 16, border: `1px solid ${BORDER}`, padding: 22 }}>
            <p style={{ fontFamily: F, fontWeight: 900, fontSize: 16, color: TEXT }}>Elegibilidade</p>
            <div style={{ height: 10 }} />
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, padding: '10px 12px', background: '#FAFBFD', fontFamily: F, fontSize: 12.5, color: TEXT }}>
                Recebedores aptos: <strong>{receivers.length}</strong>
              </div>
              <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, padding: '10px 12px', background: '#FAFBFD', fontFamily: F, fontSize: 12.5, color: TEXT }}>
                Regras: saldo disponível, KYC aprovado, recebedor ativo e sem bloqueio.
              </div>
              <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, padding: '10px 12px', background: '#FAFBFD', fontFamily: F, fontSize: 12.5, color: TEXT }}>
                Duplicidades e conflitos simultâneos são bloqueados automaticamente.
              </div>
            </div>
          </div>
        </div>

        {error ? <Notice tone="warning">{error}</Notice> : null}

        <TableCard>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 20px', borderBottom: `1px solid ${BORDER}` }}>
            <div>
              <p style={{ fontFamily: F, fontWeight: 700, fontSize: 14, color: TEXT }}>Histórico de antecipações</p>
              <p style={{ fontFamily: F, fontSize: 12, color: MUTED }}>Consulte solicitações, acompanhe o próximo passo e exporte o histórico interno.</p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <select
                value={filter}
                onChange={(event) => setFilter(event.target.value as typeof filter)}
                style={{ borderRadius: 10, border: `1px solid ${BORDER}`, padding: '10px 12px', fontFamily: F, fontSize: 12.5 }}
              >
                <option value="all">Todos os status</option>
                <option value="requested">Solicitado</option>
                <option value="under_review">Em análise</option>
                <option value="approved">Aprovado</option>
                <option value="scheduled">Agendado</option>
                <option value="rejected">Rejeitado</option>
                <option value="cancelled">Cancelado</option>
              </select>
              <GhostBtn
                onClick={() =>
                  downloadCsv(
                    'anticipation-internal.csv',
                    filteredItems.map((item) => ({
                      anticipation_id: item.id,
                      receiver: item.receiver?.name ?? item.receiverId,
                      requested_amount_centavos: item.requestedAmountCents,
                      net_amount_centavos: item.netAmountCents,
                      estimated_fee_bps: item.estimatedFeeBps,
                      expected_settlement_date: item.expectedSettlementDate,
                      status: item.status,
                    })),
                  )
                }
              >
                <Download size={15} /> Exportar
              </GhostBtn>
            </div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#FAFBFD' }}>{['Recebedor', 'Solicitado', 'Líquido', 'Prazo', 'Status', 'Ações'].map((header) => <Th key={header}>{header}</Th>)}</tr>
            </thead>
            <tbody>
              {(!loading ? filteredItems : []).map((item) => (
                <tr key={item.id}>
                  <Td>
                    <div style={{ display: 'grid', gap: 2 }}>
                      <span style={{ fontWeight: 800 }}>{item.receiver?.name ?? 'Recebedor'}</span>
                      <span style={{ color: MUTED, fontSize: 12 }}>{bankLabel(item.receiver?.bankAccountMasked)}</span>
                    </div>
                  </Td>
                  <Td>
                    <span style={{ fontWeight: 800 }}>{fmtBRL(item.requestedAmountCents)}</span>
                  </Td>
                  <Td>
                    <span style={{ fontWeight: 800, color: '#059669' }}>{fmtBRL(item.netAmountCents)}</span>
                  </Td>
                  <Td>
                    <span style={{ fontFamily: MONO, color: MUTED }}>{item.expectedSettlementDate ? formatDate(item.expectedSettlementDate) : `${item.expectedSettlementDays} dia(s)`}</span>
                  </Td>
                  <Td>
                    <Badge status={item.status} />
                  </Td>
                  <td style={{ padding: '13px 20px', borderBottom: `1px solid ${BORDER}` }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <GhostBtn onClick={() => openHistory(item)}>
                        <Eye size={14} /> Histórico
                      </GhostBtn>
                      {['requested', 'under_review', 'approved', 'scheduled'].includes(item.status) ? (
                        <DangerBtn onClick={() => cancelRequest(item)} disabled={cancelingId === item.id}>
                          {cancelingId === item.id ? 'Cancelando...' : 'Cancelar'}
                        </DangerBtn>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {loading ? (
            <TableSkeleton rows={6} cols={6} />
          ) : filteredItems.length === 0 ? (
            <EmptyState
              icon={<CalendarClock size={18} style={{ color: NAVY }} />}
              title="Nenhuma solicitação interna encontrada"
              description={receivers.length === 0 ? 'Regularize um recebedor com KYC aprovado e dados bancários para iniciar a antecipação interna.' : 'Faça a primeira simulação e envie uma solicitação para começar o histórico desta fase.'}
            />
          ) : null}
        </TableCard>
      </div>

      <Modal
        open={modalOpen}
        title="Solicitar antecipação interna"
        description="Revise elegibilidade, taxa, desconto e prazo estimado antes de enviar para análise."
        onClose={() => {
          if (!submitting) setModalOpen(false)
        }}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
            <GhostBtn disabled={submitting} onClick={() => setModalOpen(false)}>
              Fechar
            </GhostBtn>
            <PrimaryBtn disabled={!canSubmit} loading={submitting} onClick={() => submitRequest()}>
              Enviar para análise
            </PrimaryBtn>
          </div>
        }
      >
        <div style={{ display: 'grid', gap: 14 }}>
          <div>
            <ModalFieldLabel>Recebedor</ModalFieldLabel>
            <select
              value={form.receiverId}
              onChange={async (event) => {
                const nextForm = { ...form, receiverId: event.target.value }
                setForm(nextForm)
                await runSimulation(nextForm)
              }}
              style={{ width: '100%', padding: '10px 14px', fontFamily: F, fontSize: 13.5, fontWeight: 700, background: 'white', border: `1px solid ${BORDER}`, borderRadius: 10, outline: 'none' }}
            >
              {receivers.map((receiver) => (
                <option key={receiver.id} value={receiver.id}>
                  {receiver.name} · {receiver.document ?? 'Sem documento'}
                </option>
              ))}
            </select>
          </div>

          <div>
            <ModalFieldLabel>Valor solicitado (R$)</ModalFieldLabel>
            <input
              type="text"
              value={form.requestedAmountInput}
              onChange={async (event) => {
                const nextForm = { ...form, requestedAmountInput: event.target.value }
                setForm(nextForm)
                await runSimulation(nextForm)
              }}
              style={{ width: '100%', padding: '10px 14px', fontFamily: F, fontSize: 13.5, fontWeight: 700, background: 'white', border: `1px solid ${BORDER}`, borderRadius: 10, outline: 'none', boxSizing: 'border-box' }}
            />
            {requestedAmountCents > availableCents ? <p style={{ fontFamily: F, fontSize: 12, color: '#DC2626', marginTop: 8 }}>O valor solicitado nao pode ultrapassar o saldo elegível.</p> : null}
          </div>

          <div>
            <ModalFieldLabel>Observações internas</ModalFieldLabel>
            <textarea
              value={form.internalNotes}
              onChange={(event) => setForm((current) => ({ ...current, internalNotes: event.target.value }))}
              rows={3}
              style={{ width: '100%', padding: '10px 14px', fontFamily: F, fontSize: 13, background: 'white', border: `1px solid ${BORDER}`, borderRadius: 10, outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ background: '#FAFBFD', borderRadius: 14, border: `1px solid ${BORDER}`, padding: 14 }}>
            <p style={{ fontFamily: F, fontWeight: 800, fontSize: 13, color: TEXT }}>Resumo da simulação</p>
            <div style={{ height: 10 }} />
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ fontFamily: F, fontSize: 12.5, color: MUTED }}>Saldo elegível</span>
                <span style={{ fontFamily: F, fontSize: 12.5, fontWeight: 800 }}>{fmtBRL(simulation?.availableAmountCents ?? availableCents)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ fontFamily: F, fontSize: 12.5, color: MUTED }}>Taxa estimada</span>
                <span style={{ fontFamily: F, fontSize: 12.5, fontWeight: 800 }}>{(((simulation?.estimatedFeeBps ?? 400) || 0) / 100).toFixed(2).replace('.', ',')}%</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ fontFamily: F, fontSize: 12.5, color: MUTED }}>Desconto estimado</span>
                <span style={{ fontFamily: F, fontSize: 12.5, fontWeight: 800 }}>{fmtBRL(simulation?.discountCents ?? 0)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ fontFamily: F, fontSize: 12.5, color: MUTED }}>Valor líquido</span>
                <span style={{ fontFamily: F, fontSize: 12.5, fontWeight: 900, color: NAVY }}>{fmtBRL(simulation?.netAmountCents ?? 0)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ fontFamily: F, fontSize: 12.5, color: MUTED }}>Prazo estimado</span>
                <span style={{ fontFamily: F, fontSize: 12.5, fontWeight: 800 }}>{simulation?.settlementDays ?? 2} dia(s)</span>
              </div>
            </div>
          </div>

          <Notice tone="success">
            Próximo passo: após o envio, a solicitação entra em análise interna. Nenhum dinheiro será movimentado nesta fase e nenhuma referência externa será criada.
          </Notice>

          {simulating ? <p style={{ fontFamily: F, fontSize: 12, color: MUTED }}>Atualizando simulação...</p> : null}
        </div>
      </Modal>

      <Modal open={historyOpen} title={historyTitle} description="Timeline da antecipação interna." onClose={() => setHistoryOpen(false)}>
        <div style={{ display: 'grid', gap: 10 }}>
          {historyError ? (
            <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, padding: '12px 14px', background: '#FFF7ED', fontFamily: F, fontSize: 12.5, color: '#9A3412' }}>
              {historyError}
            </div>
          ) : historyEvents.length === 0 ? (
            <EmptyState icon={<Eye size={18} style={{ color: NAVY }} />} title="Histórico ainda não disponível" description="Assim que a solicitação registrar eventos internos, eles aparecerão aqui." />
          ) : (
            historyEvents.map((event) => (
              <div key={event.id} style={{ border: `1px solid ${BORDER}`, borderRadius: 12, padding: '10px 12px', background: '#FAFBFD' }}>
                <p style={{ fontFamily: F, fontWeight: 800, fontSize: 12.5, color: TEXT }}>{eventLabel(event.eventType)}</p>
                <p style={{ fontFamily: F, fontSize: 12, color: MUTED, marginTop: 4 }}>{new Date(event.createdAt).toLocaleString('pt-BR')}</p>
              </div>
            ))
          )}
        </div>
      </Modal>
    </>
  )
}

export function AdminAnticipationInternalScreen() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submittingAction, setSubmittingAction] = useState<string | null>(null)
  const [items, setItems] = useState<AnticipationRecord[]>([])
  const [summary, setSummary] = useState({ total: 0, requested: 0, underReview: 0, approvedOrScheduled: 0, cancelledOrRejected: 0 })
  const [rejectModal, setRejectModal] = useState<{ id: string; reason: string } | null>(null)
  const [scheduleModal, setScheduleModal] = useState<{ id: string; expectedSettlementDate: string } | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyTitle, setHistoryTitle] = useState('Histórico da antecipação')
  const [historyEvents, setHistoryEvents] = useState<HistoryEvent[]>([])
  const [historyError, setHistoryError] = useState<string | null>(null)

  async function loadAdmin() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/anticipation', { method: 'GET' })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setError(typeof json?.error === 'string' ? json.error : 'Nao foi possivel carregar a fila de aprovacao.')
        setItems([])
        return
      }
      setItems(Array.isArray(json?.anticipations) ? json.anticipations : [])
      setSummary(json?.summary ?? { total: 0, requested: 0, underReview: 0, approvedOrScheduled: 0, cancelledOrRejected: 0 })
    } catch {
      setError('Nao foi possivel carregar a fila de aprovacao.')
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadAdmin()
  }, [])

  async function runAction(body: Record<string, unknown>, successMessage: string) {
    const actionKey = `${body.action}:${body.id}`
    setSubmittingAction(actionKey)
    setError(null)
    try {
      const res = await fetch('/api/admin/anticipation', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setError(typeof json?.error === 'string' ? json.error : 'Nao foi possivel concluir a acao administrativa.')
        return
      }
      emitAppToast({ tone: 'success', title: 'Fila atualizada', message: successMessage })
      setRejectModal(null)
      setScheduleModal(null)
      await loadAdmin()
    } catch {
      setError('Nao foi possivel concluir a acao administrativa.')
      emitAppToast({ tone: 'error', title: 'Ação indisponível', message: 'Nao foi possivel concluir a acao administrativa agora.' })
    } finally {
      setSubmittingAction(null)
    }
  }

  async function openHistory(item: AnticipationRecord) {
    setHistoryOpen(true)
    setHistoryTitle(`Histórico · ${item.receiver?.name ?? item.id}`)
    setHistoryEvents([])
    setHistoryError(null)
    try {
      const res = await fetch(`/api/anticipation/${item.id}`, { method: 'GET' })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        const message = typeof json?.error === 'string' ? json.error : 'Nao foi possivel carregar o historico agora.'
        setHistoryError(message)
        emitAppToast({ tone: 'error', title: 'Histórico indisponível', message })
        return
      }
      setHistoryEvents(Array.isArray(json?.events) ? json.events : [])
    } catch {
      const message = 'Nao foi possivel carregar o historico agora.'
      setHistoryError(message)
      emitAppToast({ tone: 'error', title: 'Histórico indisponível', message })
    }
  }

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          <KpiCard label="Solicitações recebidas" value={String(summary.total)} sub="Volume total do fluxo interno" icon={Clock3} loading={loading} />
          <KpiCard label="Em análise" value={String(summary.underReview)} sub="Fila ativa da operação" icon={Eye} loading={loading} />
          <KpiCard label="Aprovadas ou agendadas" value={String(summary.approvedOrScheduled)} sub="Prontas para próximos passos" icon={CheckCircle2} loading={loading} />
          <KpiCard label="Reprovadas ou canceladas" value={String(summary.cancelledOrRejected)} sub="Encerradas sem liquidação real" icon={XCircle} loading={loading} />
        </div>

        <Notice>
          <strong>Painel de análise interna</strong> para Owner/Admin acompanhar, revisar, aprovar, reprovar, agendar e auditar antecipações. Nenhuma ação desta fase executa liquidação real no provider e qualquer etapa externa continua pendente da configuração da Pagar.me.
        </Notice>

        {error ? <Notice tone="warning">{error}</Notice> : null}

        <TableCard>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <p style={{ fontFamily: F, fontWeight: 800, fontSize: 15, color: TEXT }}>Fila administrativa de antecipações</p>
              <p style={{ fontFamily: F, fontSize: 12.5, color: MUTED, marginTop: 4 }}>Acompanhe status internos, histórico e próximos passos sem simular liquidação externa.</p>
            </div>
            <GhostBtn
              disabled={loading || items.length === 0}
              onClick={() =>
                downloadCsv(
                  'anticipations-admin.csv',
                  items.map((item) => ({
                    id: item.id,
                    receiver_name: item.receiver?.name ?? '',
                    receiver_document: item.receiver?.document ?? '',
                    requested_amount_centavos: Number(item.requestedAmountCents ?? 0),
                    net_amount_centavos: Number(item.netAmountCents ?? 0),
                    status: item.status ?? '',
                    requested_at: item.requestedAt ?? '',
                    expected_settlement_date: item.expectedSettlementDate ?? '',
                    approved_at: item.approvedAt ?? '',
                    paid_at: item.paidAt ?? '',
                    rejected_at: item.rejectedAt ?? '',
                    rejection_reason: item.rejectionReason ?? '',
                    internal_notes: item.internalNotes ?? '',
                    provider_reference: item.providerReference ?? '',
                  }))
                )
              }
            >
              <Download size={15} /> Exportar
            </GhostBtn>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#FAFBFD' }}>{['Recebedor', 'Solicitado', 'Líquido', 'Status', 'Próximo passo', 'Ações'].map((header) => <Th key={header}>{header}</Th>)}</tr>
            </thead>
            <tbody>
              {(!loading ? items : []).map((item) => (
                <tr key={item.id}>
                  <Td>
                    <div style={{ display: 'grid', gap: 2 }}>
                      <span style={{ fontWeight: 800 }}>{item.receiver?.name ?? 'Recebedor'}</span>
                      <span style={{ color: MUTED, fontSize: 12 }}>{formatDate(item.requestedAt)}</span>
                    </div>
                  </Td>
                  <Td>{fmtBRL(item.requestedAmountCents)}</Td>
                  <Td>{fmtBRL(item.netAmountCents)}</Td>
                  <Td>
                    <Badge status={item.status} />
                  </Td>
                  <Td>
                    <div style={{ display: 'grid', gap: 3 }}>
                      <span style={{ fontFamily: F, fontSize: 12.5, color: TEXT }}>
                        {item.status === 'scheduled'
                          ? 'Aguardando etapa externa do provider'
                          : item.status === 'approved'
                            ? 'Pronta para agendamento interno'
                            : item.status === 'rejected'
                              ? 'Encerrada internamente'
                              : item.status === 'cancelled'
                                ? 'Cancelada sem liquidação'
                                : 'Fluxo interno em andamento'}
                      </span>
                      <span style={{ fontFamily: F, fontSize: 11, color: MUTED }}>
                        {item.expectedSettlementDate ? `Data prevista: ${formatDate(item.expectedSettlementDate)}` : 'Sem data prevista'}
                      </span>
                    </div>
                  </Td>
                  <td style={{ padding: '13px 20px', borderBottom: `1px solid ${BORDER}` }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {item.status === 'requested' ? (
                        <GhostBtn onClick={() => runAction({ action: 'review', id: item.id }, 'A solicitação foi movida para análise.')} loading={submittingAction === `review:${item.id}`}>
                          Analisar
                        </GhostBtn>
                      ) : null}
                      {(item.status === 'under_review' || item.status === 'requested') ? (
                        <PrimaryBtn onClick={() => runAction({ action: 'approve', id: item.id }, 'A solicitação foi aprovada internamente.')} loading={submittingAction === `approve:${item.id}`}>
                          Aprovar
                        </PrimaryBtn>
                      ) : null}
                      {(item.status === 'under_review' || item.status === 'requested') ? (
                        <DangerBtn onClick={() => setRejectModal({ id: item.id, reason: '' })} disabled={submittingAction != null}>
                          Reprovar
                        </DangerBtn>
                      ) : null}
                      {item.status === 'approved' ? (
                        <GhostBtn onClick={() => setScheduleModal({ id: item.id, expectedSettlementDate: '' })} disabled={submittingAction != null}>
                          Agendar
                        </GhostBtn>
                      ) : null}
                      {['requested', 'under_review', 'approved', 'scheduled'].includes(item.status) ? (
                        <GhostBtn
                          onClick={() => runAction({ action: 'review', id: item.id, internalNotes: 'Revisão administrativa registrada manualmente.' }, 'A fila administrativa foi atualizada.')}
                          disabled={submittingAction != null}
                        >
                          Atualizar status
                        </GhostBtn>
                      ) : null}
                      <GhostBtn onClick={() => void openHistory(item)} disabled={submittingAction != null}>
                        Histórico
                      </GhostBtn>
                      {['draft', 'rejected', 'cancelled'].includes(item.status) ? (
                        <DangerBtn onClick={() => runAction({ action: 'delete', id: item.id }, 'A solicitação foi excluída do histórico operacional.')} loading={submittingAction === `delete:${item.id}`}>
                          Excluir
                        </DangerBtn>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {loading ? (
            <TableSkeleton rows={6} cols={5} />
          ) : items.length === 0 ? (
            <EmptyState icon={<ShieldCheck size={18} style={{ color: NAVY }} />} title="Nenhuma solicitação aguardando ação" description="Quando o Financeiro enviar antecipações internas, a fila administrativa aparecerá aqui." />
          ) : null}
        </TableCard>
      </div>

      <Modal
        open={Boolean(rejectModal)}
        title="Reprovar antecipação"
        description="Explique o motivo da reprovação para manter a rastreabilidade interna."
        onClose={() => setRejectModal(null)}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <GhostBtn onClick={() => setRejectModal(null)}>Fechar</GhostBtn>
            <DangerBtn
              onClick={() => rejectModal && runAction({ action: 'reject', id: rejectModal.id, rejectionReason: rejectModal.reason }, 'A solicitação foi reprovada.')}
              disabled={!rejectModal?.reason.trim()}
            >
              Confirmar reprovação
            </DangerBtn>
          </div>
        }
      >
        <textarea
          rows={4}
          value={rejectModal?.reason ?? ''}
          onChange={(event) => setRejectModal((current) => (current ? { ...current, reason: event.target.value } : null))}
          style={{ width: '100%', padding: '10px 14px', fontFamily: F, fontSize: 13, background: 'white', border: `1px solid ${BORDER}`, borderRadius: 10, outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
        />
      </Modal>

      <Modal
        open={Boolean(scheduleModal)}
        title="Agendar antecipação"
        description="Defina a data prevista para o próximo passo interno."
        onClose={() => setScheduleModal(null)}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <GhostBtn onClick={() => setScheduleModal(null)}>Fechar</GhostBtn>
            <PrimaryBtn
              onClick={() =>
                scheduleModal &&
                runAction(
                  { action: 'schedule', id: scheduleModal.id, expectedSettlementDate: scheduleModal.expectedSettlementDate },
                  'A solicitação foi agendada internamente.',
                )
              }
              disabled={!scheduleModal?.expectedSettlementDate}
            >
              Confirmar agendamento
            </PrimaryBtn>
          </div>
        }
      >
        <input
          type="date"
          value={scheduleModal?.expectedSettlementDate ?? ''}
          onChange={(event) => setScheduleModal((current) => (current ? { ...current, expectedSettlementDate: event.target.value } : null))}
          style={{ width: '100%', padding: '10px 14px', fontFamily: F, fontSize: 13, background: 'white', border: `1px solid ${BORDER}`, borderRadius: 10, outline: 'none', boxSizing: 'border-box' }}
        />
      </Modal>

      <Modal
        open={historyOpen}
        title={historyTitle}
        description="Linha do tempo interna da antecipação. Eventos externos continuam pendentes do provider."
        onClose={() => {
          setHistoryOpen(false)
          setHistoryEvents([])
          setHistoryError(null)
        }}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <GhostBtn
              onClick={() => {
                setHistoryOpen(false)
                setHistoryEvents([])
                setHistoryError(null)
              }}
            >
              Fechar
            </GhostBtn>
          </div>
        }
      >
        <div style={{ display: 'grid', gap: 10 }}>
          {historyError ? (
            <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, padding: '12px 14px', background: '#FFF7ED', fontFamily: F, fontSize: 12.5, color: '#9A3412' }}>
              {historyError}
            </div>
          ) : historyEvents.length === 0 ? (
            <EmptyState icon={<Eye size={18} style={{ color: NAVY }} />} title="Histórico ainda não disponível" description="Assim que a solicitação registrar eventos internos, eles aparecerão aqui." />
          ) : (
            historyEvents.map((event) => (
              <div key={event.id} style={{ border: `1px solid ${BORDER}`, borderRadius: 12, padding: '10px 12px', background: '#FAFBFD' }}>
                <p style={{ fontFamily: F, fontWeight: 800, fontSize: 12.5, color: TEXT }}>{eventLabel(event.eventType)}</p>
                <p style={{ fontFamily: F, fontSize: 12, color: MUTED, marginTop: 4 }}>{new Date(event.createdAt).toLocaleString('pt-BR')}</p>
              </div>
            ))
          )}
        </div>
      </Modal>
    </>
  )
}

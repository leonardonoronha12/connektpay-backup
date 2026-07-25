'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  CircleDollarSign,
  Download,
  PauseCircle,
  Pencil,
  Percent,
  Play,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react'

import { emitAppToast } from '@/lib/app-events'
import { BORDER, F, FAINT, MONO, MUTED, NAVY, TEXT } from '@/lib/design-tokens'
import { fmtBRL } from '@/utils/format'
import { PrimaryBtn, GhostBtn, DangerBtn } from '@/components/ui/Buttons'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { KpiCard } from '@/components/ui/KpiCard'
import { Modal, ModalFieldLabel } from '@/components/ui/Modal'
import { TableCard, Th, Td } from '@/components/ui/Table'
import { TableSkeleton } from '@/components/ui/Skeleton'

type SplitRuleForm = {
  id?: string | null
  receiverId: string
  type: 'percentage' | 'fixed'
  valueCents: number | null
  percentageBps: number | null
  priority: number
}

type SplitConfigForm = {
  id?: string | null
  name: string
  mainReceiverId: string
  status: 'active' | 'inactive'
  validFrom: string
  validUntil: string
  internalNotes: string
  rules: SplitRuleForm[]
}

type SplitConfigRecord = {
  id: string
  name: string
  status: string
  mainReceiverId: string
  mainReceiver: { id: string; name: string; document: string | null } | null
  validFrom: string | null
  validUntil: string | null
  internalNotes: string | null
  createdAt: string
  updatedAt: string
  ruleCount: number
  rules: Array<{
    id: string
    receiverId: string
    type: 'percentage' | 'fixed'
    valueCents: number | null
    percentageBps: number | null
    priority: number
    status: string
    receiver: {
      id: string
      name: string
      document: string | null
      type: string | null
      status: string
      kyc_status: string
      internal_status: string
    } | null
  }>
}

type EligibleReceiver = {
  id: string
  name: string
  document: string | null
  type: string | null
  status: string
  kycStatus?: string
  internalStatus?: string
}

type ValidationIssue = { field: string; message: string }

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

function toUserFacingError(message: unknown, fallback: string) {
  if (typeof message === 'string' && message.trim()) return message
  return fallback
}

async function downloadFromApi(url: string, fallbackFilename: string, successMessage: string) {
  try {
    const res = await fetch(url, { method: 'GET' })
    if (!res.ok) {
      const json = await res.json().catch(() => null)
      throw new Error(toUserFacingError(json?.error, 'Nao foi possivel exportar os dados agora.'))
    }
    const blob = await res.blob()
    const objectUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = objectUrl
    link.download = fallbackFilename
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(objectUrl)
    emitAppToast({ tone: 'success', title: 'Exportacao concluida', message: successMessage })
  } catch (cause) {
    emitAppToast({
      tone: 'error',
      title: 'Exportacao indisponivel',
      message: toUserFacingError(cause instanceof Error ? cause.message : null, 'Nao foi possivel exportar os dados agora.'),
    })
  }
}

function parseMoneyToCents(input: string) {
  const normalized = input.replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, '')
  const value = Number(normalized)
  if (!Number.isFinite(value) || value <= 0) return null
  return Math.round(value * 100)
}

function moneyInputFromCents(valueCents: number | null) {
  if (!valueCents || valueCents <= 0) return ''
  return (valueCents / 100).toFixed(2).replace('.', ',')
}

function percentInputFromBps(valueBps: number | null) {
  if (!valueBps || valueBps <= 0) return ''
  return (valueBps / 100).toFixed(2).replace('.', ',')
}

function parsePercentToBps(input: string) {
  const normalized = input.replace(',', '.').replace(/[^\d.]/g, '')
  const value = Number(normalized)
  if (!Number.isFinite(value) || value <= 0) return null
  return Math.round(value * 100)
}

function draftFromConfig(config: SplitConfigRecord): SplitConfigForm {
  return {
    id: config.id,
    name: config.name,
    mainReceiverId: config.mainReceiverId,
    status: config.status === 'inactive' ? 'inactive' : 'active',
    validFrom: config.validFrom ?? '',
    validUntil: config.validUntil ?? '',
    internalNotes: config.internalNotes ?? '',
    rules: config.rules.map((rule) => ({
      id: rule.id,
      receiverId: rule.receiverId,
      type: rule.type,
      valueCents: rule.valueCents,
      percentageBps: rule.percentageBps,
      priority: rule.priority,
    })),
  }
}

function createEmptyDraft(receivers: EligibleReceiver[]): SplitConfigForm {
  const firstReceiverId = receivers[0]?.id ?? ''
  return {
    name: '',
    mainReceiverId: firstReceiverId,
    status: 'active',
    validFrom: '',
    validUntil: '',
    internalNotes: '',
    rules: firstReceiverId
      ? [
          {
            receiverId: firstReceiverId,
            type: 'percentage',
            percentageBps: 10000,
            valueCents: null,
            priority: 100,
          },
        ]
      : [],
  }
}

function validationMap(issues: ValidationIssue[]) {
  const out: Record<string, string> = {}
  for (const issue of issues) {
    if (!out[issue.field]) out[issue.field] = issue.message
  }
  return out
}

export function SplitInternalScreen() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [configs, setConfigs] = useState<SplitConfigRecord[]>([])
  const [eligibleReceivers, setEligibleReceivers] = useState<EligibleReceiver[]>([])
  const [providerEnabled, setProviderEnabled] = useState(false)
  const [selectedConfigId, setSelectedConfigId] = useState<string>('')
  const [saleAmountInput, setSaleAmountInput] = useState('1000,00')
  const [simulation, setSimulation] = useState<any | null>(null)
  const [simulating, setSimulating] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [draft, setDraft] = useState<SplitConfigForm | null>(null)
  const [saving, setSaving] = useState(false)
  const [validating, setValidating] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [pendingDelete, setPendingDelete] = useState<SplitConfigRecord | null>(null)
  const [actionBusyId, setActionBusyId] = useState<string | null>(null)

  const activeCount = useMemo(() => configs.filter((config) => config.status === 'active').length, [configs])
  const totalRules = useMemo(() => configs.reduce((acc, config) => acc + config.ruleCount, 0), [configs])
  const selectedConfig = useMemo(() => configs.find((config) => config.id === selectedConfigId) ?? null, [configs, selectedConfigId])

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/split-configs', { method: 'GET' })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setError(toUserFacingError(json?.error, 'Não foi possível carregar o módulo de split interno agora.'))
        setConfigs([])
        setEligibleReceivers([])
        return
      }
      const nextConfigs = Array.isArray(json?.splitConfigs) ? json.splitConfigs : []
      const nextEligibleReceivers = Array.isArray(json?.eligibleReceivers) ? json.eligibleReceivers : []
      setConfigs(nextConfigs)
      setEligibleReceivers(nextEligibleReceivers)
      setProviderEnabled(Boolean(json?.providerEnabled))
      setSelectedConfigId((current) => current || nextConfigs[0]?.id || '')
    } catch (e) {
      setError('Não foi possível carregar o módulo de split interno agora.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  useEffect(() => {
    if (!selectedConfigId && configs[0]?.id) setSelectedConfigId(configs[0].id)
  }, [configs, selectedConfigId])

  const validateDraft = async () => {
    if (!draft) return false
    setValidating(true)
    try {
      const res = await fetch('/api/split-configs/validate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(draft),
      })
      const json = await res.json().catch(() => null)
      const issues = Array.isArray(json?.issues) ? (json.issues as ValidationIssue[]) : []
      setFieldErrors(validationMap(issues))
      if (!res.ok || !json?.ok) {
        emitAppToast({
          tone: 'warning',
          title: 'Revise os dados',
          message: toUserFacingError(json?.error ?? issues[0]?.message, 'Existem ajustes pendentes na configuração de split.'),
        })
        return false
      }
      emitAppToast({
        tone: 'success',
        title: 'Configuração validada',
        message: 'A configuração interna de split está pronta para ser salva.',
      })
      return true
    } finally {
      setValidating(false)
    }
  }

  const saveDraft = async () => {
    if (!draft || saving) return
    setSaving(true)
    setError(null)
    try {
      const validateOk = await validateDraft()
      if (!validateOk) return

      const res = await fetch(draft.id ? `/api/split-configs/${draft.id}` : '/api/split-configs', {
        method: draft.id ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(draft),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        emitAppToast({
          tone: 'error',
          title: 'Não foi possível salvar',
          message: toUserFacingError(json?.error, 'Não foi possível salvar a configuração de split. Tente novamente.'),
        })
        return
      }

      emitAppToast({
        tone: 'success',
        title: draft.id ? 'Split atualizado' : 'Split criado',
        message: draft.id ? 'A configuração interna de split foi atualizada.' : 'A configuração interna de split foi criada com sucesso.',
      })
      setEditorOpen(false)
      setDraft(null)
      setFieldErrors({})
      await load()
      const nextId = json?.splitConfig?.id
      if (typeof nextId === 'string') setSelectedConfigId(nextId)
    } finally {
      setSaving(false)
    }
  }

  const toggleStatus = async (config: SplitConfigRecord) => {
    if (actionBusyId) return
    setActionBusyId(config.id)
    try {
      const nextStatus = config.status === 'active' ? 'inactive' : 'active'
      const res = await fetch(`/api/split-configs/${config.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        emitAppToast({
          tone: 'error',
          title: 'Não foi possível atualizar',
          message: toUserFacingError(json?.error, 'Não foi possível atualizar o status do split.'),
        })
        return
      }
      emitAppToast({
        tone: 'success',
        title: nextStatus === 'active' ? 'Split ativado' : 'Split desativado',
        message: nextStatus === 'active' ? 'A configuração já pode ser usada nas simulações internas.' : 'A configuração foi desativada com segurança.',
      })
      await load()
    } finally {
      setActionBusyId(null)
    }
  }

  const deleteConfig = async () => {
    if (!pendingDelete || actionBusyId) return
    setActionBusyId(pendingDelete.id)
    try {
      const res = await fetch(`/api/split-configs/${pendingDelete.id}`, { method: 'DELETE' })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        emitAppToast({
          tone: 'error',
          title: 'Não foi possível excluir',
          message: toUserFacingError(json?.error, 'Não foi possível excluir a configuração de split.'),
        })
        return
      }
      emitAppToast({
        tone: 'success',
        title: 'Split excluído',
        message: 'A configuração interna de split foi excluída.',
      })
      setPendingDelete(null)
      if (selectedConfigId === pendingDelete.id) setSelectedConfigId('')
      await load()
    } finally {
      setActionBusyId(null)
    }
  }

  const runSimulation = async () => {
    if (!selectedConfig) {
      emitAppToast({
        tone: 'warning',
        title: 'Selecione uma configuração',
        message: 'Escolha uma configuração interna de split para simular a distribuição.',
      })
      return
    }
    const saleAmountCents = parseMoneyToCents(saleAmountInput)
    if (!saleAmountCents) {
      emitAppToast({
        tone: 'warning',
        title: 'Valor inválido',
        message: 'Informe um valor de venda válido para a simulação.',
      })
      return
    }
    setSimulating(true)
    try {
      const payload = {
        ...draftFromConfig(selectedConfig),
        saleAmountCents,
      }
      const res = await fetch('/api/split-configs/simulate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        emitAppToast({
          tone: 'error',
          title: 'Não foi possível simular',
          message: toUserFacingError(json?.error, 'Não foi possível simular a distribuição agora.'),
        })
        return
      }
      setSimulation(json)
      emitAppToast({
        tone: 'success',
        title: 'Simulação pronta',
        message: 'A distribuição interna foi calculada com sucesso.',
      })
    } finally {
      setSimulating(false)
    }
  }

  const noEligibleReceivers = !loading && eligibleReceivers.length === 0

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gap: 14 }}>
          <Notice>
            <strong>Split Interno</strong> organiza a distribuição da venda apenas dentro da Connekt Pay. Nenhuma chamada externa é feita nesta fase e a
            integração com a Pagar.me permanece desabilitada até a configuração da conta.
          </Notice>
          {!providerEnabled ? (
            <Notice tone="success">
              <strong>Flag de provider:</strong> `SPLIT_PROVIDER_ENABLED=false`. O módulo está pronto para configuração, validação e simulação, sem executar
              pagamentos reais.
            </Notice>
          ) : null}
          {error ? <Notice tone="warning">{error}</Notice> : null}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          <KpiCard label="Configurações ativas" value={String(activeCount)} sub="Prontas para simulação interna" icon={Sparkles} loading={loading} />
          <KpiCard label="Recebedores elegíveis" value={String(eligibleReceivers.length)} sub="Ativos com KYC interno aprovado" icon={ShieldCheck} loading={loading} />
          <KpiCard label="Regras cadastradas" value={String(totalRules)} sub="Linhas de distribuição configuradas" icon={Users} loading={loading} />
          <KpiCard label="Provider externo" value={providerEnabled ? 'Habilitado' : 'Desabilitado'} sub="Nenhuma chamada externa nesta fase" icon={AlertTriangle} loading={loading} />
        </div>

        <div
          style={{
            background: 'white',
            borderRadius: 18,
            border: `1px solid ${BORDER}`,
            padding: 24,
            boxShadow: '0 10px 28px rgba(2,27,91,.06)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
            <div>
              <p style={{ fontFamily: F, fontWeight: 900, fontSize: 18, color: TEXT }}>Simulador de distribuição</p>
              <p style={{ fontFamily: F, fontSize: 13, color: MUTED, marginTop: 4 }}>
                Informe o valor da venda para visualizar quanto cada recebedor receberia antes de integrar o provider financeiro.
              </p>
            </div>
            <PrimaryBtn
              onClick={() => {
                setDraft(createEmptyDraft(eligibleReceivers))
                setFieldErrors({})
                setEditorOpen(true)
              }}
              disabled={noEligibleReceivers}
            >
              <Plus size={15} /> Nova configuração
            </PrimaryBtn>
          </div>

          {noEligibleReceivers ? (
            <EmptyState
              icon={<ShieldCheck size={18} style={{ color: NAVY }} />}
              title="Falta liberar recebedores para split"
              description="Cadastre recebedores ativos e conclua o KYC interno para começar a configurar distribuições."
              primaryAction={{ label: 'Ir para Recebedores', onClick: () => router.push('/recebedores') }}
            />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 360px) minmax(0, 1fr)', gap: 16 }}>
              <div style={{ display: 'grid', gap: 12 }}>
                <div>
                  <ModalFieldLabel>Configuração</ModalFieldLabel>
                  <select
                    value={selectedConfigId}
                    onChange={(e) => setSelectedConfigId(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: `1px solid ${BORDER}`,
                      fontFamily: F,
                      fontWeight: 700,
                      background: 'white',
                    }}
                  >
                    <option value="">Selecione uma configuração</option>
                    {configs.map((config) => (
                      <option key={config.id} value={config.id}>
                        {config.name} · {config.status === 'active' ? 'Ativa' : 'Inativa'}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <ModalFieldLabel>Valor da venda (R$)</ModalFieldLabel>
                  <input
                    type="text"
                    value={saleAmountInput}
                    onChange={(e) => setSaleAmountInput(e.target.value)}
                    placeholder="1000,00"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: `1px solid ${BORDER}`,
                      fontFamily: MONO,
                      fontWeight: 700,
                    }}
                  />
                </div>
                <Notice>
                  O simulador calcula apenas a distribuição interna. Nenhuma cobrança, pagamento, split real ou repasse será executado nesta etapa.
                </Notice>
                <PrimaryBtn onClick={() => void runSimulation()} loading={simulating} disabled={!selectedConfigId}>
                  <Calculator size={15} /> Simular distribuição
                </PrimaryBtn>
              </div>

              <div style={{ border: `1px solid ${BORDER}`, borderRadius: 16, background: '#FAFBFD', padding: 16 }}>
                {!simulation ? (
                  <EmptyState
                    icon={<Calculator size={18} style={{ color: NAVY }} />}
                    title="Sem simulação no momento"
                    description="Escolha uma configuração, informe o valor da venda e clique em simular para ver o resumo da distribuição."
                  />
                ) : (
                  <div style={{ display: 'grid', gap: 14 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                      <div style={{ background: 'white', borderRadius: 14, border: `1px solid ${BORDER}`, padding: 14 }}>
                        <p style={{ fontFamily: F, fontSize: 11.5, color: MUTED }}>Valor bruto</p>
                        <p style={{ fontFamily: F, fontWeight: 900, fontSize: 18, color: TEXT, marginTop: 6 }}>{fmtBRL(simulation.summary.saleAmountCents)}</p>
                      </div>
                      <div style={{ background: 'white', borderRadius: 14, border: `1px solid ${BORDER}`, padding: 14 }}>
                        <p style={{ fontFamily: F, fontSize: 11.5, color: MUTED }}>Taxa Connekt</p>
                        <p style={{ fontFamily: F, fontWeight: 900, fontSize: 18, color: '#C2410C', marginTop: 6 }}>{fmtBRL(simulation.summary.connektFeeAmount)}</p>
                      </div>
                      <div style={{ background: 'white', borderRadius: 14, border: `1px solid ${BORDER}`, padding: 14 }}>
                        <p style={{ fontFamily: F, fontSize: 11.5, color: MUTED }}>Valor distribuído</p>
                        <p style={{ fontFamily: F, fontWeight: 900, fontSize: 18, color: '#059669', marginTop: 6 }}>{fmtBRL(simulation.summary.receiverTotalAmount)}</p>
                      </div>
                    </div>
                    <TableCard>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ background: '#F8FAFF' }}>
                            <Th>Recebedor</Th>
                            <Th>Tipo</Th>
                            <Th>Prioridade</Th>
                            <Th>Percentual</Th>
                            <Th>Valor líquido</Th>
                          </tr>
                        </thead>
                        <tbody>
                          {simulation.receivers.map((row: any) => (
                            <tr key={row.receiverId}>
                              <Td>
                                <div style={{ display: 'grid', gap: 4 }}>
                                  <span style={{ fontWeight: 800 }}>{row.receiverName}</span>
                                  <span style={{ color: MUTED, fontSize: 12 }}>{row.receiverDocument ?? 'Documento não informado'}</span>
                                </div>
                              </Td>
                              <Td>
                                {row.isMainReceiver ? (
                                  <span style={{ fontFamily: F, fontWeight: 700, color: NAVY }}>Principal</span>
                                ) : (
                                  <span style={{ fontFamily: F, fontWeight: 700, color: MUTED }}>Secundário</span>
                                )}
                              </Td>
                              <Td mono>{String(row.priority)}</Td>
                              <Td mono>{(Number(row.percentageBps ?? 0) / 100).toFixed(2).replace('.', ',')}%</Td>
                              <Td mono>{fmtBRL(Number(row.amountCents ?? 0))}</Td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </TableCard>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <TableCard>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <p style={{ fontFamily: F, fontWeight: 800, fontSize: 15, color: TEXT }}>Configurações internas cadastradas</p>
              <p style={{ fontFamily: F, fontSize: 12.5, color: MUTED, marginTop: 4 }}>Gerencie validade, recebedor principal, regras e status do split interno.</p>
            </div>
            <GhostBtn disabled={loading || configs.length === 0} onClick={() => void downloadFromApi('/api/split-configs?format=csv', 'split-configs.csv', 'As configuracoes internas de split foram exportadas.')}>
              <Download size={14} /> Exportar CSV
            </GhostBtn>
          </div>

          {loading ? (
            <TableSkeleton rows={6} cols={6} />
          ) : configs.length === 0 ? (
            <EmptyState
              icon={<Sparkles size={18} style={{ color: NAVY }} />}
              title="Nenhuma configuração de split criada"
              description="Crie a primeira configuração para começar a validar cenários com múltiplos recebedores."
              primaryAction={{
                label: 'Criar configuração',
                onClick: () => {
                  setDraft(createEmptyDraft(eligibleReceivers))
                  setFieldErrors({})
                  setEditorOpen(true)
                },
                disabled: noEligibleReceivers,
              }}
            />
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#F8FAFF' }}>
                  <Th>Configuração</Th>
                  <Th>Recebedor principal</Th>
                  <Th>Vigência</Th>
                  <Th>Regras</Th>
                  <Th>Status</Th>
                  <Th>Ações</Th>
                </tr>
              </thead>
              <tbody>
                {configs.map((config) => (
                  <tr key={config.id}>
                    <Td>
                      <div style={{ display: 'grid', gap: 4 }}>
                        <span style={{ fontWeight: 800 }}>{config.name}</span>
                        <span style={{ color: MUTED, fontSize: 12 }}>{config.internalNotes || 'Sem observações internas.'}</span>
                      </div>
                    </Td>
                    <Td>
                      <div style={{ display: 'grid', gap: 4 }}>
                        <span style={{ fontWeight: 700 }}>{config.mainReceiver?.name ?? 'Recebedor'}</span>
                        <span style={{ color: MUTED, fontSize: 12 }}>{config.mainReceiver?.document ?? 'Documento não informado'}</span>
                      </div>
                    </Td>
                    <Td>
                      <span style={{ fontFamily: F, fontSize: 12.5, color: TEXT }}>
                        {config.validFrom || config.validUntil ? `${config.validFrom ?? 'Início livre'} até ${config.validUntil ?? 'sem término'}` : 'Sem prazo definido'}
                      </span>
                    </Td>
                    <Td mono>{String(config.ruleCount)}</Td>
                    <Td>
                      <Badge status={config.status} />
                    </Td>
                    <Td>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <GhostBtn
                          onClick={() => {
                            setDraft(draftFromConfig(config))
                            setFieldErrors({})
                            setEditorOpen(true)
                          }}
                        >
                          <Pencil size={14} /> Editar
                        </GhostBtn>
                        <GhostBtn disabled={actionBusyId === config.id} onClick={() => void toggleStatus(config)}>
                          {config.status === 'active' ? <PauseCircle size={14} /> : <Play size={14} />}
                          {config.status === 'active' ? 'Desativar' : 'Ativar'}
                        </GhostBtn>
                        <DangerBtn disabled={actionBusyId === config.id} onClick={() => setPendingDelete(config)}>
                          <Trash2 size={14} /> Excluir
                        </DangerBtn>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </TableCard>
      </div>

      <Modal
        open={editorOpen}
        title={draft?.id ? 'Editar split interno' : 'Nova configuração de split'}
        description="Defina recebedor principal, vigência e regras de distribuição sem executar nenhum pagamento real."
        maxWidth={860}
        dismissOnBackdrop={!saving && !validating}
        dismissOnEscape={!saving && !validating}
        onClose={() => {
          if (saving || validating) return
          setEditorOpen(false)
          setDraft(null)
          setFieldErrors({})
        }}
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: F, fontSize: 12.5, color: MUTED }}>Nenhuma chamada externa será feita enquanto `SPLIT_PROVIDER_ENABLED=false`.</span>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <GhostBtn disabled={saving || validating} onClick={() => void validateDraft()}>
                <CheckCircle2 size={14} /> Validar
              </GhostBtn>
              <GhostBtn
                disabled={saving || validating}
                onClick={() => {
                  setEditorOpen(false)
                  setDraft(null)
                  setFieldErrors({})
                }}
              >
                Cancelar
              </GhostBtn>
              <PrimaryBtn loading={saving} disabled={saving || validating} onClick={() => void saveDraft()}>
                {draft?.id ? 'Salvar alterações' : 'Criar configuração'}
              </PrimaryBtn>
            </div>
          </div>
        }
      >
        {draft ? (
          <div style={{ display: 'grid', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
              <div>
                <ModalFieldLabel>Nome da configuração</ModalFieldLabel>
                <input
                  value={draft.name}
                  onChange={(e) => setDraft((current) => (current ? { ...current, name: e.target.value } : current))}
                  placeholder="Ex: Split marketplace padrão"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${fieldErrors.name ? '#FCA5A5' : BORDER}`, fontFamily: F, fontWeight: 700 }}
                />
                {fieldErrors.name ? <p style={{ fontFamily: F, fontSize: 12, color: '#DC2626', marginTop: 6 }}>{fieldErrors.name}</p> : null}
              </div>
              <div>
                <ModalFieldLabel>Recebedor principal</ModalFieldLabel>
                <select
                  value={draft.mainReceiverId}
                  onChange={(e) => setDraft((current) => (current ? { ...current, mainReceiverId: e.target.value } : current))}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${fieldErrors.mainReceiverId ? '#FCA5A5' : BORDER}`, fontFamily: F, fontWeight: 700, background: 'white' }}
                >
                  <option value="">Selecione</option>
                  {eligibleReceivers.map((receiver) => (
                    <option key={receiver.id} value={receiver.id}>
                      {receiver.name} · {receiver.document ?? 'Sem documento'}
                    </option>
                  ))}
                </select>
                {fieldErrors.mainReceiverId ? <p style={{ fontFamily: F, fontSize: 12, color: '#DC2626', marginTop: 6 }}>{fieldErrors.mainReceiverId}</p> : null}
              </div>
              <div>
                <ModalFieldLabel>Status</ModalFieldLabel>
                <select
                  value={draft.status}
                  onChange={(e) => setDraft((current) => (current ? { ...current, status: e.target.value === 'inactive' ? 'inactive' : 'active' } : current))}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${BORDER}`, fontFamily: F, fontWeight: 700, background: 'white' }}
                >
                  <option value="active">Ativa</option>
                  <option value="inactive">Inativa</option>
                </select>
              </div>
              <div>
                <ModalFieldLabel>Vigência inicial</ModalFieldLabel>
                <input
                  type="date"
                  value={draft.validFrom}
                  onChange={(e) => setDraft((current) => (current ? { ...current, validFrom: e.target.value } : current))}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${fieldErrors.validity ? '#FCA5A5' : BORDER}`, fontFamily: F, fontWeight: 700 }}
                />
              </div>
              <div>
                <ModalFieldLabel>Vigência final</ModalFieldLabel>
                <input
                  type="date"
                  value={draft.validUntil}
                  onChange={(e) => setDraft((current) => (current ? { ...current, validUntil: e.target.value } : current))}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${fieldErrors.validity ? '#FCA5A5' : BORDER}`, fontFamily: F, fontWeight: 700 }}
                />
                {fieldErrors.validity ? <p style={{ fontFamily: F, fontSize: 12, color: '#DC2626', marginTop: 6 }}>{fieldErrors.validity}</p> : null}
              </div>
            </div>

            <div>
              <ModalFieldLabel>Observações internas</ModalFieldLabel>
              <textarea
                value={draft.internalNotes}
                onChange={(e) => setDraft((current) => (current ? { ...current, internalNotes: e.target.value } : current))}
                rows={3}
                placeholder="Ex: configuração usada para vendas com parceiro principal e dois recebedores secundários."
                style={{ width: '100%', padding: '10px 12px', borderRadius: 12, border: `1px solid ${BORDER}`, fontFamily: F, resize: 'vertical' }}
              />
            </div>

            <div style={{ border: `1px solid ${BORDER}`, borderRadius: 16, overflow: 'hidden' }}>
              <div style={{ padding: '14px 16px', background: '#F8FAFF', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <p style={{ fontFamily: F, fontWeight: 800, fontSize: 14, color: TEXT }}>Regras da distribuição</p>
                  <p style={{ fontFamily: F, fontSize: 12, color: MUTED, marginTop: 4 }}>Use uma linha por recebedor. O sistema bloqueia duplicidades e percentuais acima de 100%.</p>
                </div>
                <GhostBtn
                  onClick={() =>
                    setDraft((current) =>
                      current
                        ? {
                            ...current,
                            rules: [
                              ...current.rules,
                              {
                                receiverId: '',
                                type: 'percentage',
                                percentageBps: null,
                                valueCents: null,
                                priority: Math.max(0, current.rules.length ? Math.max(...current.rules.map((rule) => Number(rule.priority ?? 0))) - 10 : 100),
                              },
                            ],
                          }
                        : current,
                    )
                  }
                >
                  <Plus size={14} /> Adicionar recebedor
                </GhostBtn>
              </div>
              <div style={{ display: 'grid', gap: 12, padding: 16 }}>
                {draft.rules.map((rule, index) => (
                  <div key={rule.id ?? `${rule.receiverId}-${index}`} style={{ border: `1px solid ${BORDER}`, borderRadius: 14, padding: 14, background: 'white' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1.4fr) 150px 140px 100px auto', gap: 10, alignItems: 'end' }}>
                      <div>
                        <ModalFieldLabel>Recebedor</ModalFieldLabel>
                        <select
                          value={rule.receiverId}
                          onChange={(e) =>
                            setDraft((current) =>
                              current
                                ? {
                                    ...current,
                                    rules: current.rules.map((item, itemIndex) => (itemIndex === index ? { ...item, receiverId: e.target.value } : item)),
                                  }
                                : current,
                            )
                          }
                          style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${fieldErrors[`rules.${index}.receiverId`] ? '#FCA5A5' : BORDER}`, fontFamily: F, fontWeight: 700, background: 'white' }}
                        >
                          <option value="">Selecione</option>
                          {eligibleReceivers.map((receiver) => (
                            <option key={receiver.id} value={receiver.id}>
                              {receiver.name} · {receiver.document ?? 'Sem documento'}
                            </option>
                          ))}
                        </select>
                        {fieldErrors[`rules.${index}.receiverId`] ? <p style={{ fontFamily: F, fontSize: 12, color: '#DC2626', marginTop: 6 }}>{fieldErrors[`rules.${index}.receiverId`]}</p> : null}
                      </div>
                      <div>
                        <ModalFieldLabel>Tipo</ModalFieldLabel>
                        <select
                          value={rule.type}
                          onChange={(e) =>
                            setDraft((current) =>
                              current
                                ? {
                                    ...current,
                                    rules: current.rules.map((item, itemIndex) =>
                                      itemIndex === index
                                        ? {
                                            ...item,
                                            type: e.target.value === 'fixed' ? 'fixed' : 'percentage',
                                            percentageBps: e.target.value === 'fixed' ? null : item.percentageBps,
                                            valueCents: e.target.value === 'fixed' ? item.valueCents : null,
                                          }
                                        : item,
                                    ),
                                  }
                                : current,
                            )
                          }
                          style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${BORDER}`, fontFamily: F, fontWeight: 700, background: 'white' }}
                        >
                          <option value="percentage">Percentual</option>
                          <option value="fixed">Valor fixo</option>
                        </select>
                      </div>
                      <div>
                        <ModalFieldLabel>{rule.type === 'fixed' ? 'Valor (R$)' : 'Percentual (%)'}</ModalFieldLabel>
                        <input
                          type="text"
                          value={rule.type === 'fixed' ? moneyInputFromCents(rule.valueCents) : percentInputFromBps(rule.percentageBps)}
                          onChange={(e) =>
                            setDraft((current) =>
                              current
                                ? {
                                    ...current,
                                    rules: current.rules.map((item, itemIndex) =>
                                      itemIndex === index
                                        ? {
                                            ...item,
                                            valueCents: item.type === 'fixed' ? parseMoneyToCents(e.target.value) : null,
                                            percentageBps: item.type === 'percentage' ? parsePercentToBps(e.target.value) : null,
                                          }
                                        : item,
                                    ),
                                  }
                                : current,
                            )
                          }
                          placeholder={rule.type === 'fixed' ? '100,00' : '25,00'}
                          style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${fieldErrors[`rules.${index}.${rule.type === 'fixed' ? 'valueCents' : 'percentageBps'}`] ? '#FCA5A5' : BORDER}`, fontFamily: MONO, fontWeight: 700 }}
                        />
                        {fieldErrors[`rules.${index}.${rule.type === 'fixed' ? 'valueCents' : 'percentageBps'}`] ? (
                          <p style={{ fontFamily: F, fontSize: 12, color: '#DC2626', marginTop: 6 }}>{fieldErrors[`rules.${index}.${rule.type === 'fixed' ? 'valueCents' : 'percentageBps'}`]}</p>
                        ) : null}
                      </div>
                      <div>
                        <ModalFieldLabel>Prioridade</ModalFieldLabel>
                        <input
                          type="number"
                          value={String(rule.priority)}
                          onChange={(e) =>
                            setDraft((current) =>
                              current
                                ? {
                                    ...current,
                                    rules: current.rules.map((item, itemIndex) =>
                                      itemIndex === index ? { ...item, priority: Number(e.target.value || 0) } : item,
                                    ),
                                  }
                                : current,
                            )
                          }
                          style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${fieldErrors[`rules.${index}.priority`] ? '#FCA5A5' : BORDER}`, fontFamily: MONO, fontWeight: 700 }}
                        />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <DangerBtn
                          onClick={() =>
                            setDraft((current) =>
                              current
                                ? {
                                    ...current,
                                    rules: current.rules.filter((_, itemIndex) => itemIndex !== index),
                                  }
                                : current,
                            )
                          }
                        >
                          <Trash2 size={14} /> Remover
                        </DangerBtn>
                      </div>
                    </div>
                  </div>
                ))}
                {fieldErrors.rules ? <p style={{ fontFamily: F, fontSize: 12, color: '#DC2626' }}>{fieldErrors.rules}</p> : null}
              </div>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={!!pendingDelete}
        title="Excluir configuração de split?"
        description="Essa ação remove a configuração e suas regras internas. Nenhum pagamento real será afetado, mas o histórico operacional será atualizado."
        onClose={() => {
          if (actionBusyId) return
          setPendingDelete(null)
        }}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <GhostBtn disabled={!!actionBusyId} onClick={() => setPendingDelete(null)}>
              Cancelar
            </GhostBtn>
            <DangerBtn loading={!!actionBusyId} disabled={!!actionBusyId} onClick={() => void deleteConfig()}>
              Excluir configuração
            </DangerBtn>
          </div>
        }
      >
        <Notice tone="warning">
          {pendingDelete ? (
            <>
              Você está removendo <strong>{pendingDelete.name}</strong>. Se ainda quiser manter o histórico para futuras simulações, prefira desativar a
              configuração em vez de excluir.
            </>
          ) : null}
        </Notice>
      </Modal>
    </>
  )
}

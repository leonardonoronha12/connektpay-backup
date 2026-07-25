'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  CalendarClock,
  CirclePause,
  CirclePlay,
  Copy,
  Download,
  Files,
  PauseCircle,
  PlayCircle,
  Plus,
  RefreshCcw,
  Sparkles,
  Trash2,
  UserRoundPlus,
} from 'lucide-react'

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
}

type PlanRecord = {
  id: string
  receiverId: string
  name: string
  description: string | null
  amountCents: number
  currency: string
  cycle: 'weekly' | 'monthly' | 'yearly'
  trialDays: number
  billingCyclesLimit: number | null
  isInfinite: boolean
  status: string
  startsAt: string | null
  endsAt: string | null
  internalNotes: string | null
  receiver: ReceiverRecord | null
}

type CustomerRecord = {
  id: string
  name: string
  email: string | null
  document: string | null
  phone: string | null
}

type SubscriptionRecord = {
  id: string
  planId: string
  customerId: string
  receiverId: string
  status: string
  joinedAt: string | null
  nextChargeAt: string | null
  lastChargeAt: string | null
  internalNotes: string | null
  billingCyclesCompleted: number
  plan: PlanRecord | null
  customer: CustomerRecord | null
}

type PlanForm = {
  id?: string | null
  receiverId: string
  name: string
  description: string
  amountInput: string
  cycle: 'weekly' | 'monthly' | 'yearly'
  trialDays: number
  billingCyclesLimit: string
  isInfinite: boolean
  status: 'draft' | 'active' | 'inactive' | 'scheduled' | 'expired'
  startsAt: string
  endsAt: string
  internalNotes: string
}

type SubscriptionForm = {
  id?: string | null
  planId: string
  customerId: string
  customerName: string
  customerEmail: string
  customerDocument: string
  customerPhone: string
  joinedAt: string
  status: 'draft' | 'active' | 'trial' | 'scheduled' | 'paused' | 'cancelled' | 'expired' | 'payment_pending' | 'payment_failed' | 'provider_pending'
  internalNotes: string
}

type SimulationResult = {
  summary: {
    nextChargeAt: string
    trialEndsAt: string | null
    recurrenceCount: number
    estimatedRevenueCents: number
    amountCents: number
    cycle: string
    estimatedExpiryAt: string | null
  }
  recurrences: Array<{ index: number; chargeAt: string; amountCents: number; label: string }>
  calendar: Array<{ month: string; count: number; amountCents: number }>
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

function formatInputMoney(valueCents: number | null | undefined) {
  if (!valueCents || valueCents <= 0) return ''
  return (valueCents / 100).toFixed(2).replace('.', ',')
}

function cycleLabel(value: string) {
  if (value === 'weekly') return 'Semanal'
  if (value === 'yearly') return 'Anual'
  return 'Mensal'
}

function formatDate(value: string | null | undefined) {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('pt-BR', { timeZone: 'UTC' })
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

function createEmptyPlanDraft(receivers: ReceiverRecord[]): PlanForm {
  return {
    receiverId: receivers[0]?.id ?? '',
    name: '',
    description: '',
    amountInput: '',
    cycle: 'monthly',
    trialDays: 0,
    billingCyclesLimit: '',
    isInfinite: true,
    status: 'draft',
    startsAt: '',
    endsAt: '',
    internalNotes: '',
  }
}

function createPlanPayload(draft: PlanForm) {
  return {
    receiverId: draft.receiverId,
    name: draft.name,
    description: draft.description || null,
    amountCents: parseMoneyToCents(draft.amountInput),
    currency: 'BRL',
    cycle: draft.cycle,
    trialDays: Number(draft.trialDays ?? 0),
    billingCyclesLimit: draft.isInfinite ? null : Number(draft.billingCyclesLimit || 0),
    isInfinite: draft.isInfinite,
    status: draft.status,
    startsAt: draft.startsAt || null,
    endsAt: draft.endsAt || null,
    internalNotes: draft.internalNotes || null,
  }
}

function planDraftFromRecord(plan: PlanRecord): PlanForm {
  return {
    id: plan.id,
    receiverId: plan.receiverId,
    name: plan.name,
    description: plan.description ?? '',
    amountInput: formatInputMoney(plan.amountCents),
    cycle: plan.cycle,
    trialDays: plan.trialDays,
    billingCyclesLimit: plan.billingCyclesLimit ? String(plan.billingCyclesLimit) : '',
    isInfinite: Boolean(plan.isInfinite),
    status: (plan.status as PlanForm['status']) ?? 'draft',
    startsAt: plan.startsAt ?? '',
    endsAt: plan.endsAt ?? '',
    internalNotes: plan.internalNotes ?? '',
  }
}

function createEmptySubscriptionDraft(plans: PlanRecord[], customers: CustomerRecord[]): SubscriptionForm {
  return {
    planId: plans[0]?.id ?? '',
    customerId: '',
    customerName: customers[0]?.name ?? '',
    customerEmail: customers[0]?.email ?? '',
    customerDocument: customers[0]?.document ?? '',
    customerPhone: customers[0]?.phone ?? '',
    joinedAt: new Date().toISOString().slice(0, 10),
    status: 'draft',
    internalNotes: '',
  }
}

function subscriptionDraftFromRecord(subscription: SubscriptionRecord): SubscriptionForm {
  return {
    id: subscription.id,
    planId: subscription.planId,
    customerId: subscription.customer?.id ?? '',
    customerName: subscription.customer?.name ?? '',
    customerEmail: subscription.customer?.email ?? '',
    customerDocument: subscription.customer?.document ?? '',
    customerPhone: subscription.customer?.phone ?? '',
    joinedAt: subscription.joinedAt ?? new Date().toISOString().slice(0, 10),
    status: (subscription.status as SubscriptionForm['status']) ?? 'draft',
    internalNotes: subscription.internalNotes ?? '',
  }
}

function createSubscriptionPayload(draft: SubscriptionForm) {
  return {
    planId: draft.planId,
    customer: {
      id: draft.customerId || null,
      name: draft.customerName,
      email: draft.customerEmail || null,
      document: draft.customerDocument || null,
      phone: draft.customerPhone || null,
    },
    joinedAt: draft.joinedAt || null,
    status: draft.status,
    internalNotes: draft.internalNotes || null,
  }
}

function checklistItems(plans: PlanRecord[], subscriptions: SubscriptionRecord[], providerEnabled: boolean) {
  return [
    {
      label: 'Planos internos',
      done: plans.length > 0,
      helper: plans.length > 0 ? `${plans.length} plano(s) preparado(s).` : 'Cadastre pelo menos um plano interno para iniciar a recorrencia.',
    },
    {
      label: 'Adesoes internas',
      done: subscriptions.length > 0,
      helper: subscriptions.length > 0 ? `${subscriptions.length} assinatura(s) interna(s) registrada(s).` : 'Depois do plano, registre a adesao do cliente sem gerar cobranca real.',
    },
    {
      label: 'Provider desabilitado',
      done: !providerEnabled,
      helper: !providerEnabled ? 'Nenhuma cobranca automatica externa esta habilitada nesta fase.' : 'Desabilite o provider antes de homologar a Fase 2C.',
    },
  ]
}

export function SubscriptionsInternalScreen() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [plans, setPlans] = useState<PlanRecord[]>([])
  const [customers, setCustomers] = useState<CustomerRecord[]>([])
  const [subscriptions, setSubscriptions] = useState<SubscriptionRecord[]>([])
  const [eligibleReceivers, setEligibleReceivers] = useState<ReceiverRecord[]>([])
  const [providerEnabled, setProviderEnabled] = useState(false)
  const [planEditorOpen, setPlanEditorOpen] = useState(false)
  const [subscriptionEditorOpen, setSubscriptionEditorOpen] = useState(false)
  const [planDraft, setPlanDraft] = useState<PlanForm | null>(null)
  const [subscriptionDraft, setSubscriptionDraft] = useState<SubscriptionForm | null>(null)
  const [savingPlan, setSavingPlan] = useState(false)
  const [savingSubscription, setSavingSubscription] = useState(false)
  const [actionBusyId, setActionBusyId] = useState<string | null>(null)
  const [simulationPlanId, setSimulationPlanId] = useState('')
  const [simulationJoinedAt, setSimulationJoinedAt] = useState(new Date().toISOString().slice(0, 10))
  const [simulation, setSimulation] = useState<SimulationResult | null>(null)
  const [simulating, setSimulating] = useState(false)

  const activePlanCount = useMemo(() => plans.filter((plan) => plan.status === 'active').length, [plans])
  const activeSubscriptionCount = useMemo(() => subscriptions.filter((subscription) => subscription.status === 'active' || subscription.status === 'trial').length, [subscriptions])
  const scheduledRevenue30d = useMemo(() => {
    const now = Date.now()
    const max = now + 30 * 24 * 60 * 60 * 1000
    return subscriptions.reduce((acc, subscription) => {
      const nextCharge = subscription.nextChargeAt ? new Date(subscription.nextChargeAt).getTime() : null
      if (typeof nextCharge !== 'number' || !Number.isFinite(nextCharge)) return acc
      if (nextCharge < now || nextCharge > max) return acc
      return acc + Number(subscription.plan?.amountCents ?? 0)
    }, 0)
  }, [subscriptions])

  const checklist = useMemo(() => checklistItems(plans, subscriptions, providerEnabled), [plans, subscriptions, providerEnabled])

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/subscriptions-internal', { method: 'GET' })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setError(typeof json?.error === 'string' ? json.error : 'Nao foi possivel carregar o modulo de assinaturas internas.')
        setPlans([])
        setCustomers([])
        setSubscriptions([])
        setEligibleReceivers([])
        return
      }
      const nextPlans = Array.isArray(json?.plans) ? json.plans : []
      const nextCustomers = Array.isArray(json?.customers) ? json.customers : []
      const nextSubscriptions = Array.isArray(json?.subscriptions) ? json.subscriptions : []
      const nextReceivers = Array.isArray(json?.eligibleReceivers) ? json.eligibleReceivers : []
      setPlans(nextPlans)
      setCustomers(nextCustomers)
      setSubscriptions(nextSubscriptions)
      setEligibleReceivers(nextReceivers)
      setProviderEnabled(Boolean(json?.providerEnabled))
      setSimulationPlanId((current) => current || nextPlans[0]?.id || '')
    } catch (cause) {
      setError('Nao foi possivel carregar o modulo de assinaturas internas.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const selectedSimulationPlan = useMemo(() => plans.find((plan) => plan.id === simulationPlanId) ?? null, [plans, simulationPlanId])

  const runSimulation = async () => {
    if (!selectedSimulationPlan) {
      emitAppToast({ tone: 'warning', title: 'Escolha um plano', message: 'Selecione um plano interno para prever as recorrencias.' })
      return
    }
    setSimulating(true)
    try {
      const res = await fetch('/api/subscriptions-internal/simulate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ plan: selectedSimulationPlan, joinedAt: simulationJoinedAt || null }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        emitAppToast({
          tone: 'warning',
          title: 'Simulacao indisponivel',
          message: typeof json?.issues?.[0]?.message === 'string' ? json.issues[0].message : typeof json?.error === 'string' ? json.error : 'Revise os dados do plano e tente novamente.',
        })
        setSimulation(null)
        return
      }
      setSimulation(json?.simulation ?? null)
      emitAppToast({ tone: 'success', title: 'Simulacao pronta', message: 'A previsao das cobrancas futuras foi atualizada.' })
    } catch (cause) {
      emitAppToast({ tone: 'error', title: 'Nao foi possivel simular', message: 'Tente novamente em alguns instantes.' })
    } finally {
      setSimulating(false)
    }
  }

  const savePlan = async () => {
    if (!planDraft) return
    setSavingPlan(true)
    try {
      const res = await fetch(planDraft.id ? `/api/subscriptions-internal/plans/${planDraft.id}` : '/api/subscriptions-internal/plans', {
        method: planDraft.id ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(createPlanPayload(planDraft)),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        emitAppToast({
          tone: 'warning',
          title: 'Plano nao salvo',
          message: typeof json?.error === 'string' ? json.error : 'Revise os dados e tente novamente.',
        })
        return
      }
      emitAppToast({
        tone: 'success',
        title: planDraft.id ? 'Plano atualizado' : 'Plano criado',
        message: planDraft.id ? 'As alteracoes do plano interno foram salvas.' : 'O plano interno foi criado e ja pode ser usado nas adesoes.',
      })
      setPlanEditorOpen(false)
      setPlanDraft(null)
      await load()
    } catch (cause) {
      emitAppToast({ tone: 'error', title: 'Nao foi possivel salvar', message: 'Tente novamente em alguns instantes.' })
    } finally {
      setSavingPlan(false)
    }
  }

  const saveSubscription = async () => {
    if (!subscriptionDraft) return
    setSavingSubscription(true)
    try {
      const res = await fetch(
        subscriptionDraft.id ? `/api/subscriptions-internal/subscriptions/${subscriptionDraft.id}` : '/api/subscriptions-internal/subscriptions',
        {
          method: subscriptionDraft.id ? 'PATCH' : 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(createSubscriptionPayload(subscriptionDraft)),
        },
      )
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        emitAppToast({
          tone: 'warning',
          title: 'Assinatura nao salva',
          message: typeof json?.error === 'string' ? json.error : 'Revise os dados da adesao e tente novamente.',
        })
        return
      }
      emitAppToast({
        tone: 'success',
        title: subscriptionDraft.id ? 'Adesao atualizada' : 'Adesao criada',
        message: subscriptionDraft.id
          ? 'A assinatura interna foi atualizada com sucesso.'
          : 'A adesao foi registrada sem gerar cobranca real.',
      })
      setSubscriptionEditorOpen(false)
      setSubscriptionDraft(null)
      await load()
    } catch (cause) {
      emitAppToast({ tone: 'error', title: 'Nao foi possivel salvar', message: 'Tente novamente em alguns instantes.' })
    } finally {
      setSavingSubscription(false)
    }
  }

  const duplicatePlan = async (planId: string) => {
    setActionBusyId(planId)
    try {
      const res = await fetch(`/api/subscriptions-internal/plans/${planId}/duplicate`, { method: 'POST' })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        emitAppToast({
          tone: 'warning',
          title: 'Duplicacao indisponivel',
          message: typeof json?.error === 'string' ? json.error : 'Nao foi possivel duplicar este plano agora.',
        })
        return
      }
      emitAppToast({ tone: 'success', title: 'Plano duplicado', message: 'Uma copia em rascunho foi criada para voce ajustar com calma.' })
      await load()
    } catch (cause) {
      emitAppToast({ tone: 'error', title: 'Nao foi possivel duplicar', message: 'Tente novamente em alguns instantes.' })
    } finally {
      setActionBusyId(null)
    }
  }

  const changePlanStatus = async (plan: PlanRecord, status: PlanForm['status']) => {
    setActionBusyId(plan.id)
    try {
      const payload = { ...createPlanPayload(planDraftFromRecord(plan)), status }
      const res = await fetch(`/api/subscriptions-internal/plans/${plan.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        emitAppToast({ tone: 'warning', title: 'Acao indisponivel', message: typeof json?.error === 'string' ? json.error : 'Nao foi possivel atualizar o plano.' })
        return
      }
      emitAppToast({
        tone: 'success',
        title: status === 'active' ? 'Plano ativado' : 'Plano desativado',
        message: status === 'active' ? 'O plano voltou a ficar disponivel para novas adesoes.' : 'O plano foi pausado para novas adesoes.',
      })
      await load()
    } catch (cause) {
      emitAppToast({ tone: 'error', title: 'Nao foi possivel atualizar', message: 'Tente novamente em alguns instantes.' })
    } finally {
      setActionBusyId(null)
    }
  }

  const deletePlan = async (plan: PlanRecord) => {
    if (!window.confirm(`Excluir o plano "${plan.name}"? Essa acao so funciona quando nao existem assinaturas vinculadas.`)) return
    setActionBusyId(plan.id)
    try {
      const res = await fetch(`/api/subscriptions-internal/plans/${plan.id}`, { method: 'DELETE' })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        emitAppToast({ tone: 'warning', title: 'Plano nao excluido', message: typeof json?.error === 'string' ? json.error : 'Nao foi possivel excluir este plano.' })
        return
      }
      emitAppToast({ tone: 'success', title: 'Plano excluido', message: 'O plano interno foi removido com seguranca.' })
      await load()
    } catch (cause) {
      emitAppToast({ tone: 'error', title: 'Nao foi possivel excluir', message: 'Tente novamente em alguns instantes.' })
    } finally {
      setActionBusyId(null)
    }
  }

  const changeSubscriptionStatus = async (
    subscription: SubscriptionRecord,
    status: SubscriptionForm['status'],
    successTitle: string,
    successMessage: string,
  ) => {
    setActionBusyId(subscription.id)
    try {
      const payload = { ...createSubscriptionPayload(subscriptionDraftFromRecord(subscription)), status }
      const res = await fetch(`/api/subscriptions-internal/subscriptions/${subscription.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        emitAppToast({ tone: 'warning', title: 'Acao indisponivel', message: typeof json?.error === 'string' ? json.error : 'Nao foi possivel atualizar esta assinatura.' })
        return
      }
      emitAppToast({ tone: 'success', title: successTitle, message: successMessage })
      await load()
    } catch (cause) {
      emitAppToast({ tone: 'error', title: 'Nao foi possivel atualizar', message: 'Tente novamente em alguns instantes.' })
    } finally {
      setActionBusyId(null)
    }
  }

  const deleteSubscription = async (subscription: SubscriptionRecord) => {
    if (!window.confirm(`Excluir a adesao de ${subscription.customer?.name ?? 'cliente'}?`)) return
    setActionBusyId(subscription.id)
    try {
      const res = await fetch(`/api/subscriptions-internal/subscriptions/${subscription.id}`, { method: 'DELETE' })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        emitAppToast({ tone: 'warning', title: 'Assinatura nao excluida', message: typeof json?.error === 'string' ? json.error : 'Nao foi possivel excluir esta assinatura.' })
        return
      }
      emitAppToast({ tone: 'success', title: 'Assinatura excluida', message: 'A adesao interna foi removida.' })
      await load()
    } catch (cause) {
      emitAppToast({ tone: 'error', title: 'Nao foi possivel excluir', message: 'Tente novamente em alguns instantes.' })
    } finally {
      setActionBusyId(null)
    }
  }

  const openNewPlan = () => {
    setPlanDraft(createEmptyPlanDraft(eligibleReceivers))
    setPlanEditorOpen(true)
  }

  const openEditPlan = (plan: PlanRecord) => {
    setPlanDraft(planDraftFromRecord(plan))
    setPlanEditorOpen(true)
  }

  const openNewSubscription = () => {
    setSubscriptionDraft(createEmptySubscriptionDraft(plans, customers))
    setSubscriptionEditorOpen(true)
  }

  const openEditSubscription = (subscription: SubscriptionRecord) => {
    setSubscriptionDraft(subscriptionDraftFromRecord(subscription))
    setSubscriptionEditorOpen(true)
  }

  if (loading) {
    return (
      <div style={{ display: 'grid', gap: 18 }}>
        <TableSkeleton rows={4} cols={4} />
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <Notice>
        <strong>Assinaturas Internas</strong> organizam planos, adesoes e previsoes de recorrencia apenas dentro da Connekt Pay.{' '}
        <strong>As cobrancas automaticas serao habilitadas apos a integracao com o provedor financeiro.</strong>
      </Notice>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        <Notice tone={providerEnabled ? 'warning' : 'success'}>
          <strong>Flag do provider:</strong> `SUBSCRIPTIONS_PROVIDER_ENABLED=false`
        </Notice>
        <Notice>
          <strong>Onboarding guiado:</strong> se quiser rever as etapas da operacao, voce pode reabrir o onboarding ou o tour guiado desta tela.
          <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
            <GhostBtn onClick={() => openGuide('onboarding')}>Abrir onboarding</GhostBtn>
            <GhostBtn onClick={() => openGuide('tour')}>Abrir tour guiado</GhostBtn>
          </div>
        </Notice>
      </div>

      {error ? <Notice tone="warning">{error}</Notice> : null}

      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <KpiCard label="Planos ativos" value={String(activePlanCount)} sub="Disponiveis para novas adesoes" icon={Files} />
        <KpiCard label="Assinaturas ativas" value={String(activeSubscriptionCount)} sub="Base ativa e em trial" icon={RefreshCcw} accent />
        <KpiCard label="Receita prevista 30d" value={fmtBRL(scheduledRevenue30d)} sub="Projecao interna sem cobranca real" icon={CalendarClock} />
      </div>

      <div
        style={{
          display: 'grid',
          gap: 18,
          gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, .8fr)',
          alignItems: 'start',
        }}
      >
        <div style={{ display: 'grid', gap: 18 }}>
          <TableCard>
            <div style={{ padding: 18, borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <p style={{ fontFamily: F, fontWeight: 900, fontSize: 16, color: TEXT }}>Planos internos</p>
                <p style={{ fontFamily: F, fontSize: 12.5, color: MUTED, marginTop: 4 }}>Crie e organize os planos que servirao de base para a recorrencia futura.</p>
              </div>
              <PrimaryBtn onClick={openNewPlan}>
                <Plus size={16} />
                Novo plano
              </PrimaryBtn>
              <GhostBtn disabled={loading || plans.length === 0} onClick={() => void downloadFromApi('/api/subscriptions-internal/plans?format=csv', 'subscriptions-plans-internal.csv', 'Os planos internos foram exportados.')}>
                <Download size={14} />
                Exportar CSV
              </GhostBtn>
            </div>

            {plans.length === 0 ? (
              <EmptyState
                icon={<Files size={22} color={NAVY} />}
                title="Nenhum plano interno cadastrado"
                description="Comece pelo plano. Ele define valor, periodicidade, trial e a previsao do calendario de cobrancas."
                primaryAction={{ label: 'Criar primeiro plano', onClick: openNewPlan }}
              />
            ) : (
              <table style={{ width: '100%', minWidth: 860, borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <Th>Plano</Th>
                    <Th>Recebedor</Th>
                    <Th>Periodicidade</Th>
                    <Th>Valor</Th>
                    <Th>Recorrencia</Th>
                    <Th>Status</Th>
                    <Th>Acoes</Th>
                  </tr>
                </thead>
                <tbody>
                  {plans.map((plan) => (
                    <tr key={plan.id}>
                      <Td>
                        <div>
                          <strong>{plan.name}</strong>
                          <div style={{ color: MUTED, fontSize: 12, marginTop: 4 }}>{plan.description || 'Sem descricao interna.'}</div>
                        </div>
                      </Td>
                      <Td>
                        <div>
                          <strong>{plan.receiver?.name ?? 'Recebedor'}</strong>
                          <div style={{ color: MUTED, fontSize: 12, marginTop: 4 }}>{plan.receiver?.document ?? '-'}</div>
                        </div>
                      </Td>
                      <Td>{cycleLabel(plan.cycle)}</Td>
                      <Td>{fmtBRL(plan.amountCents)}</Td>
                      <Td>{plan.isInfinite ? 'Infinita' : `${plan.billingCyclesLimit ?? 0} cobrancas`}</Td>
                      <Td>
                        <Badge status={plan.status} />
                      </Td>
                      <Td>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <GhostBtn onClick={() => openEditPlan(plan)}>Editar</GhostBtn>
                          <GhostBtn loading={actionBusyId === plan.id} onClick={() => duplicatePlan(plan.id)}>
                            Duplicar
                          </GhostBtn>
                          {plan.status === 'active' ? (
                            <GhostBtn loading={actionBusyId === plan.id} onClick={() => changePlanStatus(plan, 'inactive')}>
                              Desativar
                            </GhostBtn>
                          ) : (
                            <GhostBtn loading={actionBusyId === plan.id} onClick={() => changePlanStatus(plan, 'active')}>
                              Ativar
                            </GhostBtn>
                          )}
                          <DangerBtn loading={actionBusyId === plan.id} onClick={() => deletePlan(plan)}>
                            Excluir
                          </DangerBtn>
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </TableCard>

          <TableCard>
            <div style={{ padding: 18, borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <p style={{ fontFamily: F, fontWeight: 900, fontSize: 16, color: TEXT }}>Adesoes internas</p>
                <p style={{ fontFamily: F, fontSize: 12.5, color: MUTED, marginTop: 4 }}>Registre o cliente, o plano contratado e o ciclo esperado sem gerar nenhuma cobranca real.</p>
              </div>
              <PrimaryBtn onClick={openNewSubscription}>
                <UserRoundPlus size={16} />
                Nova adesao
              </PrimaryBtn>
              <GhostBtn disabled={loading || subscriptions.length === 0} onClick={() => void downloadFromApi('/api/subscriptions-internal/subscriptions?format=csv', 'subscriptions-internal.csv', 'As adesoes internas foram exportadas.')}>
                <Download size={14} />
                Exportar CSV
              </GhostBtn>
            </div>

            {subscriptions.length === 0 ? (
              <EmptyState
                icon={<Sparkles size={22} color={NAVY} />}
                title="Nenhuma adesao interna registrada"
                description="Depois do plano, registre a adesao do cliente para visualizar proxima cobranca, calendario e estimativa de faturamento."
                primaryAction={{ label: 'Registrar adesao', onClick: openNewSubscription, disabled: plans.length === 0 }}
                secondaryAction={plans.length === 0 ? { label: 'Criar plano antes', onClick: openNewPlan } : undefined}
              />
            ) : (
              <table style={{ width: '100%', minWidth: 980, borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <Th>Cliente</Th>
                    <Th>Plano</Th>
                    <Th>Adesao</Th>
                    <Th>Proxima cobranca</Th>
                    <Th>Ultima cobranca</Th>
                    <Th>Status</Th>
                    <Th>Acoes</Th>
                  </tr>
                </thead>
                <tbody>
                  {subscriptions.map((subscription) => (
                    <tr key={subscription.id}>
                      <Td>
                        <div>
                          <strong>{subscription.customer?.name ?? 'Cliente'}</strong>
                          <div style={{ color: MUTED, fontSize: 12, marginTop: 4 }}>
                            {subscription.customer?.email || subscription.customer?.document || 'Sem identificador adicional'}
                          </div>
                        </div>
                      </Td>
                      <Td>
                        <div>
                          <strong>{subscription.plan?.name ?? 'Plano interno'}</strong>
                          <div style={{ color: MUTED, fontSize: 12, marginTop: 4 }}>{subscription.plan ? fmtBRL(subscription.plan.amountCents) : '-'}</div>
                        </div>
                      </Td>
                      <Td>{formatDate(subscription.joinedAt)}</Td>
                      <Td>{formatDate(subscription.nextChargeAt)}</Td>
                      <Td>{formatDate(subscription.lastChargeAt)}</Td>
                      <Td>
                        <Badge status={subscription.status} />
                      </Td>
                      <Td>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <GhostBtn onClick={() => openEditSubscription(subscription)}>Editar</GhostBtn>
                          {subscription.status === 'paused' ? (
                            <GhostBtn
                              loading={actionBusyId === subscription.id}
                              onClick={() =>
                                changeSubscriptionStatus(subscription, 'active', 'Assinatura reativada', 'A recorrencia interna voltou ao acompanhamento ativo.')
                              }
                            >
                              Reativar
                            </GhostBtn>
                          ) : (
                            <GhostBtn
                              loading={actionBusyId === subscription.id}
                              onClick={() =>
                                changeSubscriptionStatus(subscription, 'paused', 'Assinatura pausada', 'A recorrencia interna ficou pausada sem qualquer chamada externa.')
                              }
                            >
                              Pausar
                            </GhostBtn>
                          )}
                          <GhostBtn
                            loading={actionBusyId === subscription.id}
                            onClick={() =>
                              changeSubscriptionStatus(subscription, 'cancelled', 'Assinatura cancelada', 'A adesao interna foi cancelada sem criar cobranca real.')
                            }
                          >
                            Cancelar
                          </GhostBtn>
                          {['draft', 'cancelled', 'expired'].includes(subscription.status) ? (
                            <DangerBtn loading={actionBusyId === subscription.id} onClick={() => deleteSubscription(subscription)}>
                              Excluir
                            </DangerBtn>
                          ) : null}
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </TableCard>
        </div>

        <div style={{ display: 'grid', gap: 18 }}>
          <TableCard>
            <div style={{ padding: 18, borderBottom: `1px solid ${BORDER}` }}>
              <p style={{ fontFamily: F, fontWeight: 900, fontSize: 16, color: TEXT }}>Checklist de homologacao</p>
              <p style={{ fontFamily: F, fontSize: 12.5, color: MUTED, marginTop: 4 }}>Use este quadro para validar se a base interna esta pronta para receber o adapter oficial no futuro.</p>
            </div>
            <div style={{ padding: 18, display: 'grid', gap: 12 }}>
              {checklist.map((item) => (
                <div key={item.label} style={{ border: `1px solid ${BORDER}`, borderRadius: 14, padding: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                    <strong style={{ fontFamily: F, color: TEXT }}>{item.label}</strong>
                    <Badge status={item.done ? 'active' : 'pending'} />
                  </div>
                  <p style={{ fontFamily: F, fontSize: 12.5, color: MUTED, lineHeight: 1.6, marginTop: 8 }}>{item.helper}</p>
                </div>
              ))}
            </div>
          </TableCard>

          <TableCard>
            <div style={{ padding: 18, borderBottom: `1px solid ${BORDER}` }}>
              <p style={{ fontFamily: F, fontWeight: 900, fontSize: 16, color: TEXT }}>Simulador de recorrencia</p>
              <p style={{ fontFamily: F, fontSize: 12.5, color: MUTED, marginTop: 4 }}>Antecipe a proxima cobranca, o calendario futuro e a estimativa interna de faturamento.</p>
            </div>
            <div style={{ padding: 18, display: 'grid', gap: 12 }}>
              <div>
                <ModalFieldLabel>Plano para simular</ModalFieldLabel>
                <select
                  value={simulationPlanId}
                  onChange={(event) => setSimulationPlanId(event.target.value)}
                  style={{ width: '100%', padding: '11px 12px', borderRadius: 12, border: `1px solid ${BORDER}`, fontFamily: F, fontSize: 13 }}
                >
                  <option value="">Selecione um plano</option>
                  {plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <ModalFieldLabel>Data de adesao</ModalFieldLabel>
                <input
                  value={simulationJoinedAt}
                  onChange={(event) => setSimulationJoinedAt(event.target.value)}
                  type="date"
                  style={{ width: '100%', padding: '11px 12px', borderRadius: 12, border: `1px solid ${BORDER}`, fontFamily: F, fontSize: 13 }}
                />
              </div>
              <PrimaryBtn loading={simulating} onClick={runSimulation}>
                Simular calendario
              </PrimaryBtn>

              {simulation ? (
                <div style={{ display: 'grid', gap: 12 }}>
                  <Notice tone="success">
                    <strong>Proxima cobranca:</strong> {formatDate(simulation.summary.nextChargeAt)}.
                    <br />
                    <strong>Estimativa de faturamento:</strong> {fmtBRL(simulation.summary.estimatedRevenueCents)}.
                  </Notice>

                  <div style={{ border: `1px solid ${BORDER}`, borderRadius: 14, padding: 14 }}>
                    <p style={{ fontFamily: F, fontWeight: 800, color: TEXT }}>Resumo da simulacao</p>
                    <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                        <span style={{ fontFamily: F, color: MUTED }}>Trial termina em</span>
                        <strong style={{ fontFamily: F, color: TEXT }}>{formatDate(simulation.summary.trialEndsAt)}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                        <span style={{ fontFamily: F, color: MUTED }}>Quantidade prevista</span>
                        <strong style={{ fontFamily: F, color: TEXT }}>{simulation.summary.recurrenceCount}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                        <span style={{ fontFamily: F, color: MUTED }}>Fim estimado</span>
                        <strong style={{ fontFamily: F, color: TEXT }}>{formatDate(simulation.summary.estimatedExpiryAt)}</strong>
                      </div>
                    </div>
                  </div>

                  <div style={{ border: `1px solid ${BORDER}`, borderRadius: 14, padding: 14 }}>
                    <p style={{ fontFamily: F, fontWeight: 800, color: TEXT }}>Calendario futuro</p>
                    <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                      {simulation.calendar.map((row) => (
                        <div key={row.month} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontFamily: F, fontSize: 12.5 }}>
                          <span style={{ color: MUTED }}>{row.month}</span>
                          <strong style={{ color: TEXT }}>
                            {row.count} cobranca(s) · {fmtBRL(row.amountCents)}
                          </strong>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ border: `1px solid ${BORDER}`, borderRadius: 14, padding: 14 }}>
                    <p style={{ fontFamily: F, fontWeight: 800, color: TEXT }}>Proximas recorrencias</p>
                    <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
                      {simulation.recurrences.slice(0, 8).map((row) => (
                        <div key={`${row.index}-${row.chargeAt}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                          <span style={{ fontFamily: MONO, fontSize: 12, color: MUTED }}>#{row.index} · {formatDate(row.chargeAt)}</span>
                          <strong style={{ fontFamily: F, color: TEXT }}>{fmtBRL(row.amountCents)}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <Notice>
                  Use o simulador para prever a proxima cobranca, o calendario de recorrencias e a estimativa de faturamento antes de ativar a operacao com provider.
                </Notice>
              )}
            </div>
          </TableCard>
        </div>
      </div>

      <Modal
        open={planEditorOpen}
        onClose={() => {
          if (savingPlan) return
          setPlanEditorOpen(false)
          setPlanDraft(null)
        }}
        title={planDraft?.id ? 'Editar plano interno' : 'Novo plano interno'}
        description="Defina o plano base da recorrencia sem criar Payment Link nem cobrar o cliente."
        maxWidth={760}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <GhostBtn onClick={() => setPlanEditorOpen(false)}>Cancelar</GhostBtn>
            <PrimaryBtn loading={savingPlan} onClick={savePlan}>
              Salvar plano
            </PrimaryBtn>
          </div>
        }
      >
        {planDraft ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <Notice>
              Esse cadastro prepara a camada interna de assinaturas. Nenhuma cobranca automatica sera disparada nesta fase.
            </Notice>
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
              <div>
                <ModalFieldLabel>Recebedor principal</ModalFieldLabel>
                <select
                  value={planDraft.receiverId}
                  onChange={(event) => setPlanDraft((current) => (current ? { ...current, receiverId: event.target.value } : current))}
                  style={{ width: '100%', padding: '11px 12px', borderRadius: 12, border: `1px solid ${BORDER}`, fontFamily: F, fontSize: 13 }}
                >
                  <option value="">Selecione</option>
                  {eligibleReceivers.map((receiver) => (
                    <option key={receiver.id} value={receiver.id}>
                      {receiver.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <ModalFieldLabel>Status inicial</ModalFieldLabel>
                <select
                  value={planDraft.status}
                  onChange={(event) => setPlanDraft((current) => (current ? { ...current, status: event.target.value as PlanForm['status'] } : current))}
                  style={{ width: '100%', padding: '11px 12px', borderRadius: 12, border: `1px solid ${BORDER}`, fontFamily: F, fontSize: 13 }}
                >
                  <option value="draft">Rascunho</option>
                  <option value="active">Ativo</option>
                  <option value="inactive">Inativo</option>
                  <option value="scheduled">Agendado</option>
                  <option value="expired">Expirado</option>
                </select>
              </div>
            </div>
            <div>
              <ModalFieldLabel>Nome do plano</ModalFieldLabel>
              <input
                value={planDraft.name}
                onChange={(event) => setPlanDraft((current) => (current ? { ...current, name: event.target.value } : current))}
                placeholder="Ex.: Plano Premium Mensal"
                style={{ width: '100%', padding: '11px 12px', borderRadius: 12, border: `1px solid ${BORDER}`, fontFamily: F, fontSize: 13 }}
              />
            </div>
            <div>
              <ModalFieldLabel>Descricao</ModalFieldLabel>
              <textarea
                value={planDraft.description}
                onChange={(event) => setPlanDraft((current) => (current ? { ...current, description: event.target.value } : current))}
                rows={3}
                placeholder="Explique o que o cliente recebe e em que contexto esse plano sera usado."
                style={{ width: '100%', padding: '11px 12px', borderRadius: 12, border: `1px solid ${BORDER}`, fontFamily: F, fontSize: 13, resize: 'vertical' }}
              />
            </div>
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
              <div>
                <ModalFieldLabel>Valor</ModalFieldLabel>
                <input
                  value={planDraft.amountInput}
                  onChange={(event) => setPlanDraft((current) => (current ? { ...current, amountInput: event.target.value } : current))}
                  placeholder="199,90"
                  style={{ width: '100%', padding: '11px 12px', borderRadius: 12, border: `1px solid ${BORDER}`, fontFamily: F, fontSize: 13 }}
                />
              </div>
              <div>
                <ModalFieldLabel>Periodicidade</ModalFieldLabel>
                <select
                  value={planDraft.cycle}
                  onChange={(event) => setPlanDraft((current) => (current ? { ...current, cycle: event.target.value as PlanForm['cycle'] } : current))}
                  style={{ width: '100%', padding: '11px 12px', borderRadius: 12, border: `1px solid ${BORDER}`, fontFamily: F, fontSize: 13 }}
                >
                  <option value="weekly">Semanal</option>
                  <option value="monthly">Mensal</option>
                  <option value="yearly">Anual</option>
                </select>
              </div>
              <div>
                <ModalFieldLabel>Trial (dias)</ModalFieldLabel>
                <input
                  value={planDraft.trialDays}
                  onChange={(event) => setPlanDraft((current) => (current ? { ...current, trialDays: Number(event.target.value || 0) } : current))}
                  type="number"
                  min={0}
                  style={{ width: '100%', padding: '11px 12px', borderRadius: 12, border: `1px solid ${BORDER}`, fontFamily: F, fontSize: 13 }}
                />
              </div>
            </div>
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
              <div>
                <ModalFieldLabel>Recorrencia</ModalFieldLabel>
                <select
                  value={planDraft.isInfinite ? 'infinite' : 'limited'}
                  onChange={(event) =>
                    setPlanDraft((current) =>
                      current
                        ? {
                            ...current,
                            isInfinite: event.target.value === 'infinite',
                            billingCyclesLimit: event.target.value === 'infinite' ? '' : current.billingCyclesLimit,
                          }
                        : current,
                    )
                  }
                  style={{ width: '100%', padding: '11px 12px', borderRadius: 12, border: `1px solid ${BORDER}`, fontFamily: F, fontSize: 13 }}
                >
                  <option value="infinite">Infinita</option>
                  <option value="limited">Quantidade limitada</option>
                </select>
              </div>
              <div>
                <ModalFieldLabel>Quantidade de cobrancas</ModalFieldLabel>
                <input
                  value={planDraft.billingCyclesLimit}
                  onChange={(event) => setPlanDraft((current) => (current ? { ...current, billingCyclesLimit: event.target.value } : current))}
                  type="number"
                  min={1}
                  disabled={planDraft.isInfinite}
                  placeholder={planDraft.isInfinite ? 'Nao se aplica' : '12'}
                  style={{ width: '100%', padding: '11px 12px', borderRadius: 12, border: `1px solid ${BORDER}`, fontFamily: F, fontSize: 13, opacity: planDraft.isInfinite ? 0.6 : 1 }}
                />
              </div>
            </div>
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
              <div>
                <ModalFieldLabel>Inicio de vigencia</ModalFieldLabel>
                <input
                  value={planDraft.startsAt}
                  onChange={(event) => setPlanDraft((current) => (current ? { ...current, startsAt: event.target.value } : current))}
                  type="date"
                  style={{ width: '100%', padding: '11px 12px', borderRadius: 12, border: `1px solid ${BORDER}`, fontFamily: F, fontSize: 13 }}
                />
              </div>
              <div>
                <ModalFieldLabel>Fim de vigencia</ModalFieldLabel>
                <input
                  value={planDraft.endsAt}
                  onChange={(event) => setPlanDraft((current) => (current ? { ...current, endsAt: event.target.value } : current))}
                  type="date"
                  style={{ width: '100%', padding: '11px 12px', borderRadius: 12, border: `1px solid ${BORDER}`, fontFamily: F, fontSize: 13 }}
                />
              </div>
            </div>
            <div>
              <ModalFieldLabel>Observacoes internas</ModalFieldLabel>
              <textarea
                value={planDraft.internalNotes}
                onChange={(event) => setPlanDraft((current) => (current ? { ...current, internalNotes: event.target.value } : current))}
                rows={3}
                placeholder="Use este campo para orientar a operacao interna sobre quando e como usar o plano."
                style={{ width: '100%', padding: '11px 12px', borderRadius: 12, border: `1px solid ${BORDER}`, fontFamily: F, fontSize: 13, resize: 'vertical' }}
              />
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={subscriptionEditorOpen}
        onClose={() => {
          if (savingSubscription) return
          setSubscriptionEditorOpen(false)
          setSubscriptionDraft(null)
        }}
        title={subscriptionDraft?.id ? 'Editar adesao interna' : 'Nova adesao interna'}
        description="Associe um cliente a um plano interno e acompanhe a recorrencia esperada sem gerar cobranca real."
        maxWidth={760}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <GhostBtn onClick={() => setSubscriptionEditorOpen(false)}>Cancelar</GhostBtn>
            <PrimaryBtn loading={savingSubscription} onClick={saveSubscription}>
              Salvar adesao
            </PrimaryBtn>
          </div>
        }
      >
        {subscriptionDraft ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <Notice>
              A adesao interna organiza calendario, status e previsao de faturamento. Nenhuma cobranca automatica sera criada nesta fase.
            </Notice>
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
              <div>
                <ModalFieldLabel>Plano contratado</ModalFieldLabel>
                <select
                  value={subscriptionDraft.planId}
                  onChange={(event) => setSubscriptionDraft((current) => (current ? { ...current, planId: event.target.value } : current))}
                  style={{ width: '100%', padding: '11px 12px', borderRadius: 12, border: `1px solid ${BORDER}`, fontFamily: F, fontSize: 13 }}
                >
                  <option value="">Selecione</option>
                  {plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <ModalFieldLabel>Status inicial</ModalFieldLabel>
                <select
                  value={subscriptionDraft.status}
                  onChange={(event) => setSubscriptionDraft((current) => (current ? { ...current, status: event.target.value as SubscriptionForm['status'] } : current))}
                  style={{ width: '100%', padding: '11px 12px', borderRadius: 12, border: `1px solid ${BORDER}`, fontFamily: F, fontSize: 13 }}
                >
                  <option value="draft">Rascunho</option>
                  <option value="active">Ativa</option>
                  <option value="trial">Trial</option>
                  <option value="scheduled">Agendada</option>
                  <option value="paused">Pausada</option>
                  <option value="cancelled">Cancelada</option>
                  <option value="expired">Expirada</option>
                  <option value="payment_pending">Pagamento pendente</option>
                  <option value="payment_failed">Pagamento falhou</option>
                  <option value="provider_pending">Aguardando provider</option>
                </select>
              </div>
            </div>
            <div>
              <ModalFieldLabel>Cliente existente (opcional)</ModalFieldLabel>
              <select
                value={subscriptionDraft.customerId}
                onChange={(event) => {
                  const selected = customers.find((customer) => customer.id === event.target.value)
                  setSubscriptionDraft((current) =>
                    current
                      ? {
                          ...current,
                          customerId: event.target.value,
                          customerName: selected?.name ?? current.customerName,
                          customerEmail: selected?.email ?? '',
                          customerDocument: selected?.document ?? '',
                          customerPhone: selected?.phone ?? '',
                        }
                      : current,
                  )
                }}
                style={{ width: '100%', padding: '11px 12px', borderRadius: 12, border: `1px solid ${BORDER}`, fontFamily: F, fontSize: 13 }}
              >
                <option value="">Preencher manualmente</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
              <div>
                <ModalFieldLabel>Nome do cliente</ModalFieldLabel>
                <input
                  value={subscriptionDraft.customerName}
                  onChange={(event) => setSubscriptionDraft((current) => (current ? { ...current, customerName: event.target.value } : current))}
                  placeholder="Ex.: Maria Oliveira"
                  style={{ width: '100%', padding: '11px 12px', borderRadius: 12, border: `1px solid ${BORDER}`, fontFamily: F, fontSize: 13 }}
                />
              </div>
              <div>
                <ModalFieldLabel>E-mail</ModalFieldLabel>
                <input
                  value={subscriptionDraft.customerEmail}
                  onChange={(event) => setSubscriptionDraft((current) => (current ? { ...current, customerEmail: event.target.value } : current))}
                  placeholder="cliente@empresa.com"
                  style={{ width: '100%', padding: '11px 12px', borderRadius: 12, border: `1px solid ${BORDER}`, fontFamily: F, fontSize: 13 }}
                />
              </div>
            </div>
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
              <div>
                <ModalFieldLabel>Documento</ModalFieldLabel>
                <input
                  value={subscriptionDraft.customerDocument}
                  onChange={(event) => setSubscriptionDraft((current) => (current ? { ...current, customerDocument: event.target.value } : current))}
                  placeholder="CPF ou CNPJ"
                  style={{ width: '100%', padding: '11px 12px', borderRadius: 12, border: `1px solid ${BORDER}`, fontFamily: F, fontSize: 13 }}
                />
              </div>
              <div>
                <ModalFieldLabel>Telefone</ModalFieldLabel>
                <input
                  value={subscriptionDraft.customerPhone}
                  onChange={(event) => setSubscriptionDraft((current) => (current ? { ...current, customerPhone: event.target.value } : current))}
                  placeholder="(11) 99999-0000"
                  style={{ width: '100%', padding: '11px 12px', borderRadius: 12, border: `1px solid ${BORDER}`, fontFamily: F, fontSize: 13 }}
                />
              </div>
            </div>
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
              <div>
                <ModalFieldLabel>Data de adesao</ModalFieldLabel>
                <input
                  value={subscriptionDraft.joinedAt}
                  onChange={(event) => setSubscriptionDraft((current) => (current ? { ...current, joinedAt: event.target.value } : current))}
                  type="date"
                  style={{ width: '100%', padding: '11px 12px', borderRadius: 12, border: `1px solid ${BORDER}`, fontFamily: F, fontSize: 13 }}
                />
              </div>
              <div>
                <ModalFieldLabel>Resumo previsto</ModalFieldLabel>
                <div style={{ minHeight: 46, display: 'flex', alignItems: 'center', padding: '0 12px', borderRadius: 12, border: `1px solid ${BORDER}`, fontFamily: F, fontSize: 12.5, color: MUTED }}>
                  A proxima cobranca sera calculada automaticamente a partir do plano e da data de adesao.
                </div>
              </div>
            </div>
            <div>
              <ModalFieldLabel>Observacoes internas</ModalFieldLabel>
              <textarea
                value={subscriptionDraft.internalNotes}
                onChange={(event) => setSubscriptionDraft((current) => (current ? { ...current, internalNotes: event.target.value } : current))}
                rows={3}
                placeholder="Registre observacoes importantes para a equipe acompanhar essa recorrencia."
                style={{ width: '100%', padding: '11px 12px', borderRadius: 12, border: `1px solid ${BORDER}`, fontFamily: F, fontSize: 13, resize: 'vertical' }}
              />
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}

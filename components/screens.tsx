'use client'

import { WordMark } from '@/components/brand/Logo'
import { Badge } from '@/components/ui/Badge'
import { Avi } from '@/components/ui/AvatarInitials'
import { DangerBtn, GhostBtn, PrimaryBtn } from '@/components/ui/Buttons'
import { EmptyState } from '@/components/ui/EmptyState'
import { KpiCard } from '@/components/ui/KpiCard'
import { Modal, ModalFieldLabel } from '@/components/ui/Modal'
import { Skeleton, TableSkeleton } from '@/components/ui/Skeleton'
import { TableCard, Td, Th } from '@/components/ui/Table'
import { Toggle } from '@/components/ui/Toggle'
import { BG, BORDER, F, FAINT, MINT, MINT_D, MONO, MUTED, NAVY, TEXT } from '@/lib/design-tokens'
import { getSupabaseClient } from '@/lib/supabase'
import { resetPassword, signInWithPassword, signOut, signUp, updatePassword } from '@/services/auth'
import {
  Activity,
  AlertCircle,
  Building2,
  CheckCircle2,
  ChevronRight,
  Clock,
  Copy,
  CreditCard,
  Database,
  Download,
  Eye,
  EyeOff,
  FileText,
  Link2,
  MoreHorizontal,
  Plus,
  QrCode,
  RefreshCw,
  ArrowUpDown,
  ArrowRightLeft,
  RotateCcw,
  Search,
  Server,
  Settings,
  Shield,
  TrendingUp,
  Upload,
  Users,
  Wallet,
  XCircle,
  Zap,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import QRCode from 'qrcode'
import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { fmtBRL, initials } from '@/utils/format'
import { inferPersonTypeFromDocument, validateDocument } from '@/lib/kyc-core'
import {
  buildKycEducationMessage,
  buildReceiverEducationMessage,
  canTransitionInternalKycStatus,
  countReceiverKycChecklist,
  getKycDocumentLabel,
  getRequiredDocumentTypes,
  mapInternalStatusToPortuguese,
  mapKycStatusToPortuguese,
  validateBirthDate,
  validateEmail,
} from '@/lib/receiver-kyc'
import { validateCheckoutCustomer } from '@/lib/checkout-validation'
import { getProviderLabel, normalizeProviderId } from '@/lib/acquirer/provider-id'
import { tokenizePagarMeCardInBrowser } from '@/lib/pagarme-browser-tokenize'
import { getMeCached } from '@/hooks/me'
import { useSession } from '@/hooks/useSession'
import { DashboardChart } from '@/components/charts/DashboardChart'
import { emitAppToast } from '@/lib/app-events'
import { readScreenCache, readScreenCacheSnapshot, writeScreenCache } from '@/lib/screen-cache'

const DEV = process.env.NODE_ENV === 'development'
const PAGARME_BROWSER_TOKENIZATION_READY = Boolean(
  process.env.NEXT_PUBLIC_PAGARME_APP_ID && process.env.NEXT_PUBLIC_PAGARME_BASE_URL,
)

function logError(...args: any[]) {
  if (DEV) console.error(...args)
}

function isAbortLikeError(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e)
  const lower = msg.toLowerCase()
  if (lower.includes('abort')) return true
  if (lower.includes('load request cancelled')) return true
  if (lower.includes('access control checks')) return true
  return false
}

function csvCell(value: unknown) {
  const s = value == null ? '' : String(value)
  const needsQuotes = /[",\n\r]/.test(s) || /^\s|\s$/.test(s)
  const escaped = s.replace(/"/g, '""')
  return needsQuotes ? `"${escaped}"` : escaped
}

function downloadCsv(filename: string, rows: Array<Record<string, unknown>>) {
  if (!rows.length) return
  const headers = Object.keys(rows[0] ?? {})
  const lines = [headers.map(csvCell).join(','), ...rows.map((r) => headers.map((h) => csvCell(r[h])).join(','))]
  const csv = lines.join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function parseDownloadFilename(disposition: string | null, fallback: string) {
  if (!disposition) return fallback
  const utf8Match = disposition.match(/filename\*\s*=\s*UTF-8''([^;]+)/i)
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1].trim())
    } catch {
      return utf8Match[1].trim()
    }
  }
  const plainMatch = disposition.match(/filename\s*=\s*"([^"]+)"|filename\s*=\s*([^;]+)/i)
  const candidate = plainMatch?.[1] ?? plainMatch?.[2]
  return candidate?.trim() || fallback
}

async function downloadFromApi(url: string, fallbackFilename: string, successMessage: string) {
  try {
    const res = await fetch(url, { method: 'GET' })
    if (!res.ok) {
      const json = await res.json().catch(() => null)
      throw new Error(typeof json?.error === 'string' ? json.error : 'Não foi possível exportar os dados.')
    }
    const blob = await res.blob()
    const objectUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = parseDownloadFilename(res.headers.get('content-disposition'), fallbackFilename)
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(objectUrl)
    emitAppToast({ tone: 'success', title: 'Exportação concluída', message: successMessage })
  } catch (e) {
    logError('downloadFromApi failed', { url, error: e })
    emitAppToast({
      tone: 'error',
      title: 'Exportação indisponível',
      message: toUserFacingError(e instanceof Error ? e.message : String(e), 'Não foi possível exportar os dados agora.', url),
    })
  }
}

function toUserFacingError(input: unknown, fallback: string, context?: string) {
  const raw = typeof input === 'string' ? input.trim() : ''
  if (!raw) return fallback
  const lower = raw.toLowerCase()
  if (lower.includes('provedor financeiro') && (lower.includes('nÃ£o estÃ¡ configurado') || lower.includes('nao esta configurado') || lower.includes('ainda nÃ£o estÃ¡ configurado') || lower.includes('ainda nao esta configurado'))) {
    return 'Funcionalidade indisponÃ­vel no momento. Ela serÃ¡ liberada assim que esta etapa estiver pronta na sua operaÃ§Ã£o.'
  }
  if (raw === 'Internal Server Error' || lower.includes('internal server error')) {
    if (context) logError(`[${context}]`, raw)
    return fallback
  }
  if (raw === 'Service not configured' || lower.includes('service not configured') || raw === 'Not configured' || lower.includes('not configured')) {
    return 'Funcionalidade indisponÃ­vel no momento.'
  }
  if (lower.includes('unexpected error') || lower.includes('unhandled error') || lower.includes('stack trace') || lower.includes('stacktrace')) {
    if (context) logError(`[${context}]`, raw)
    return fallback
  }
  if (lower.includes('auth session missing') || lower.includes('jwt expired') || lower.includes('invalid jwt') || lower.includes('session') && lower.includes('expired')) return 'SessÃ£o expirada. Entre novamente.'
  if (raw === 'Unauthorized' || lower.includes('unauthorized')) return 'SessÃ£o expirada. Entre novamente.'
  if (raw === 'Forbidden' || lower.includes('forbidden') || lower.includes('row level security') || lower.includes('rls')) return 'VocÃª nÃ£o tem permissÃ£o para acessar este recurso.'
  if (lower.includes('invalid login credentials')) return 'E-mail ou senha invÃ¡lidos.'
  if (lower.includes('duplicate key value') || lower.includes('already exists')) return 'JÃ¡ existe um registro com esses dados.'
  if (lower.includes('supabase') || lower.includes('postgrest') || lower.includes('postgres') || lower.includes('sqlstate') || lower.includes('syntax error') || lower.includes('provider')) {
    if (context) logError(`[${context}]`, raw)
    return fallback
  }
  return raw
}

async function copyWithFeedback(value: string, successMessage: string, failureMessage = 'NÃ£o foi possÃ­vel copiar automaticamente. Copie manualmente.') {
  try {
    await navigator.clipboard.writeText(value)
    emitAppToast({ tone: 'success', title: 'Copiado', message: successMessage })
    return true
  } catch (e) {
    logError('copyWithFeedback failed', e)
    emitAppToast({ tone: 'error', title: 'NÃ£o foi possÃ­vel copiar', message: failureMessage })
    return false
  }
}

type PromptDialogOptions = {
  title: string
  label: string
  helperText?: string
  defaultValue?: string
  placeholder?: string
  multiline?: boolean
  normalize?: (v: string) => string
  requiredMessage?: string
}

type SplitType = 'percentage' | 'fixed'

type SplitReceiverOption = {
  id: string
  name: string
}

type SplitRuleOption = {
  id: string
  paymentLinkId: string | null
  receiverId: string
  type: SplitType
  valueCents: number | null
  percentageBps: number | null
  status: string | null
}

type SplitFieldErrors = {
  receiverId?: string
  type?: string
  valueInput?: string
}

type SplitDialogState = {
  paymentLinkId: string
  receivers: SplitReceiverOption[]
  receiverId: string
  type: SplitType
  valueInput: string
  fieldErrors: SplitFieldErrors
  generalError: string | null
  loadingReceivers: boolean
  submitting: boolean
}

function parseSplitAmountBRL(input: string) {
  const normalized = input.replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, '')
  const value = Number(normalized)
  if (!Number.isFinite(value) || value <= 0) return null
  return Math.round(value * 100)
}

function parseSplitPercentageBps(input: string) {
  const normalized = input.replace(/\s+/g, '').replace(',', '.').replace(/[^\d.]/g, '')
  const value = Number(normalized)
  if (!Number.isFinite(value) || value <= 0 || value > 100) return null
  return Math.round(value * 100)
}

function formatSplitAmountInputFromCents(valueCents: number | null) {
  if (!valueCents || !Number.isFinite(valueCents)) return '10,00'
  return (valueCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatSplitPercentageInputFromBps(percentageBps: number | null) {
  if (!percentageBps || !Number.isFinite(percentageBps)) return '10'
  const percentage = percentageBps / 100
  return Number.isInteger(percentage) ? String(percentage) : percentage.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

function splitInputStyle(hasError: boolean): React.CSSProperties {
  return {
    width: '100%',
    background: FAINT,
    border: `1px solid ${hasError ? '#FCA5A5' : BORDER}`,
    borderRadius: 12,
    padding: '11px 12px',
    fontFamily: F,
    fontSize: 13,
    color: TEXT,
    boxSizing: 'border-box',
    outline: 'none',
    boxShadow: hasError ? '0 0 0 3px rgba(239,68,68,.12)' : 'none',
  }
}

function toSplitUserFacingError(input: unknown, type: SplitType) {
  const raw = typeof input === 'string' ? input.trim() : ''
  const lower = raw.toLowerCase()
  if (!raw) return 'NÃ£o foi possÃ­vel salvar a regra de split. Tente novamente.'
  if (lower.includes('missing receiverid')) return 'Selecione um recebedor.'
  if (lower.includes('receiver not found')) return 'NÃ£o foi possÃ­vel salvar a regra de split. Tente novamente.'
  if (lower.includes('invalid type')) return 'Selecione um tipo de split vÃ¡lido.'
  if (lower.includes('percentagebps')) return 'Informe um percentual vÃ¡lido para o split.'
  if (lower.includes('valuecents')) return 'Informe um valor vÃ¡lido para o split.'
  if (lower.includes('payment link not found')) return 'NÃ£o foi possÃ­vel salvar a regra de split. Tente novamente.'
  return type === 'percentage' || type === 'fixed' ? 'NÃ£o foi possÃ­vel salvar a regra de split. Tente novamente.' : 'NÃ£o foi possÃ­vel salvar a regra de split. Tente novamente.'
}

function useSplitDialog({
  setScreenError,
  errorScope,
}: {
  setScreenError: (value: string | null) => void
  errorScope: string
}) {
  const resolveRef = useRef<((value: boolean) => void) | null>(null)
  const toastRef = useRef<{ key: string; at: number }>({ key: '', at: 0 })
  const submitLockRef = useRef(false)
  const [state, setState] = useState<SplitDialogState | null>(null)

  const emitSplitToast = useCallback((detail: { tone: 'success' | 'warning' | 'error'; title: string; message: string }) => {
    const key = `${detail.tone}:${detail.title}:${detail.message}`
    const now = Date.now()
    if (toastRef.current.key === key && now - toastRef.current.at < 1200) return
    toastRef.current = { key, at: now }
    emitAppToast({ ...detail, durationMs: detail.tone === 'success' ? 4200 : 4600 })
  }, [])

  const resolveDialog = useCallback((value: boolean) => {
    const resolve = resolveRef.current
    resolveRef.current = null
    submitLockRef.current = false
    setState(null)
    resolve?.(value)
  }, [])

  const updateField = useCallback((field: 'receiverId' | 'type' | 'valueInput', value: string) => {
    setState((current) => {
      if (!current) return current
      const nextFieldErrors = { ...current.fieldErrors }
      if (field === 'receiverId') delete nextFieldErrors.receiverId
      if (field === 'type') delete nextFieldErrors.type
      if (field === 'valueInput') delete nextFieldErrors.valueInput
      return {
        ...current,
        [field]: value,
        fieldErrors: nextFieldErrors,
        generalError: null,
      }
    })
  }, [])

  const openSplitDialog = useCallback(
    async ({ paymentLinkId }: { paymentLinkId: string }) => {
      setScreenError(null)
      return await new Promise<boolean>((resolve) => {
        resolveRef.current = resolve
        submitLockRef.current = false
        setState({
          paymentLinkId,
          receivers: [],
          receiverId: '',
          type: 'percentage',
          valueInput: '10',
          fieldErrors: {},
          generalError: null,
          loadingReceivers: true,
          submitting: false,
        })

        void (async () => {
          try {
            const [receiversRes, splitRulesRes] = await Promise.all([
              fetch('/api/receivers', { method: 'GET' }),
              fetch(`/api/split-rules?paymentLinkId=${encodeURIComponent(paymentLinkId)}`, { method: 'GET' }),
            ])
            const receiversJson = await receiversRes.json().catch(() => null)
            if (!receiversRes.ok) {
              logError(`${errorScope}: /api/receivers failed`, { status: receiversRes.status, error: receiversJson?.error })
              const message = toUserFacingError(receiversJson?.error, 'Ocorreu um erro ao carregar recebedores. Tente novamente.', '/api/receivers')
              setState((current) =>
                !current
                  ? current
                  : {
                      ...current,
                      loadingReceivers: false,
                      generalError: message,
                    }
              )
              emitSplitToast({ tone: 'error', title: 'Erro ao carregar recebedores', message })
              return
            }

            const receivers = Array.isArray(receiversJson?.receivers)
              ? receiversJson.receivers
                  .map((receiver: any) => ({
                    id: String(receiver?.id ?? ''),
                    name: String(receiver?.name ?? 'Recebedor'),
                  }))
                  .filter((receiver: SplitReceiverOption) => receiver.id)
              : []

            const splitRulesJson = await splitRulesRes.json().catch(() => null)
            const splitRules = Array.isArray(splitRulesJson?.splitRules)
              ? splitRulesJson.splitRules
                  .map((rule: any) => ({
                    id: String(rule?.id ?? ''),
                    paymentLinkId: typeof rule?.payment_link_id === 'string' ? String(rule.payment_link_id) : null,
                    receiverId: String(rule?.receiver_id ?? ''),
                    type: rule?.type === 'fixed' ? 'fixed' : 'percentage',
                    valueCents: typeof rule?.value_cents === 'number' ? rule.value_cents : null,
                    percentageBps: typeof rule?.percentage_bps === 'number' ? rule.percentage_bps : null,
                    status: typeof rule?.status === 'string' ? String(rule.status) : null,
                  }))
                  .filter((rule: SplitRuleOption) => rule.id && rule.receiverId)
              : []
            const existingRule = splitRules.find((rule: SplitRuleOption) => rule.paymentLinkId === paymentLinkId && rule.status !== 'inactive') ?? splitRules[0] ?? null

            const noReceiversMessage = receivers.length ? null : 'Cadastre um recebedor antes de configurar split.'
            setState((current) =>
              !current
                ? current
                : {
                    ...current,
                    receivers,
                    receiverId: existingRule?.receiverId ?? current.receiverId,
                    type: existingRule?.type ?? current.type,
                    valueInput:
                      existingRule?.type === 'fixed'
                        ? formatSplitAmountInputFromCents(existingRule.valueCents)
                        : existingRule?.type === 'percentage'
                          ? formatSplitPercentageInputFromBps(existingRule.percentageBps)
                          : current.valueInput,
                    loadingReceivers: false,
                    generalError: noReceiversMessage,
                  }
            )
            if (noReceiversMessage) {
              emitSplitToast({ tone: 'warning', title: 'PrÃ©-requisito', message: noReceiversMessage })
            }
          } catch (e) {
            if (isAbortLikeError(e)) return
            logError(`${errorScope}: load split receivers failed`, e)
            const message = 'Ocorreu um erro ao carregar recebedores. Tente novamente.'
            setState((current) =>
              !current
                ? current
                : {
                    ...current,
                    loadingReceivers: false,
                    generalError: message,
                  }
            )
            emitSplitToast({ tone: 'error', title: 'Erro ao carregar recebedores', message })
          }
        })()
      })
    },
    [emitSplitToast, errorScope, setScreenError]
  )

  const submit = useCallback(async () => {
    if (!state || state.submitting || submitLockRef.current) return
    submitLockRef.current = true

    let fieldErrors: SplitFieldErrors = {}
    let message: string | null = null

    if (!state.receivers.length) {
      message = 'Cadastre um recebedor antes de configurar split.'
      fieldErrors.receiverId = message
    } else if (!state.receiverId || !state.receivers.some((receiver) => receiver.id === state.receiverId)) {
      message = 'Selecione um recebedor.'
      fieldErrors.receiverId = message
    }

    if (!message && state.type !== 'percentage' && state.type !== 'fixed') {
      message = 'Selecione um tipo de split vÃ¡lido.'
      fieldErrors.type = message
    }

    const percentageBps = state.type === 'percentage' ? parseSplitPercentageBps(state.valueInput) : null
    const valueCents = state.type === 'fixed' ? parseSplitAmountBRL(state.valueInput) : null

    if (!message && state.type === 'percentage' && !percentageBps) {
      message = 'Informe um percentual vÃ¡lido para o split.'
      fieldErrors.valueInput = message
    }

    if (!message && state.type === 'fixed' && !valueCents) {
      message = 'Informe um valor vÃ¡lido para o split.'
      fieldErrors.valueInput = message
    }

    if (message) {
      submitLockRef.current = false
      setState((current) =>
        !current
          ? current
          : {
              ...current,
              fieldErrors,
              generalError: message,
            }
      )
      emitSplitToast({ tone: 'warning', title: 'Erro de validaÃ§Ã£o', message })
      return
    }

    setState((current) =>
      !current
        ? current
        : {
            ...current,
            fieldErrors: {},
            generalError: null,
            submitting: true,
          }
    )

    try {
      const body =
        state.type === 'percentage'
          ? {
              receiverId: state.receiverId,
              paymentLinkId: state.paymentLinkId,
              type: state.type,
              percentageBps: percentageBps as number,
              status: 'active' as const,
            }
          : {
              receiverId: state.receiverId,
              paymentLinkId: state.paymentLinkId,
              type: state.type,
              valueCents: valueCents as number,
              status: 'active' as const,
            }

      const res = await fetch('/api/split-rules', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        logError(`${errorScope}: create split-rule failed`, { status: res.status, error: json?.error, body })
        const apiMessage = toSplitUserFacingError(json?.error, state.type)
        submitLockRef.current = false
        setState((current) =>
          !current
            ? current
            : {
                ...current,
                generalError: apiMessage,
                submitting: false,
              }
        )
        emitSplitToast({ tone: 'error', title: 'NÃ£o foi possÃ­vel salvar o split', message: apiMessage })
        return
      }

      setScreenError(null)
      emitSplitToast({ tone: 'success', title: 'Split configurado', message: 'Regra de split configurada com sucesso.' })
      resolveDialog(true)
    } catch (e) {
      if (isAbortLikeError(e)) {
        submitLockRef.current = false
        return
      }
      logError(`${errorScope}: split flow failed`, e)
      const apiMessage = 'NÃ£o foi possÃ­vel salvar a regra de split. Tente novamente.'
      submitLockRef.current = false
      setState((current) =>
        !current
          ? current
          : {
              ...current,
              generalError: apiMessage,
              submitting: false,
            }
      )
      emitSplitToast({ tone: 'error', title: 'NÃ£o foi possÃ­vel salvar o split', message: apiMessage })
    }
  }, [emitSplitToast, errorScope, resolveDialog, setScreenError, state])

  const splitDialog =
    !state ? null : (
      <Modal
        open={true}
        title="Configurar split"
        description="Selecione o recebedor, o tipo e o valor da regra de split desta cobranÃ§a."
        dismissOnBackdrop={false}
        dismissOnEscape={false}
        onClose={() => {
          if (!state.submitting) resolveDialog(false)
        }}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
            <GhostBtn disabled={state.submitting} onClick={() => resolveDialog(false)}>
              Cancelar
            </GhostBtn>
            <PrimaryBtn loading={state.submitting} disabled={state.loadingReceivers || !state.receivers.length} onClick={() => void submit()}>
              {state.submitting ? 'Salvando...' : 'Salvar split'}
            </PrimaryBtn>
          </div>
        }
      >
        <div style={{ display: 'grid', gap: 14 }}>
          {state.generalError ? <Notice style={{ marginBottom: 2 }}>{state.generalError}</Notice> : null}

          <div>
            <ModalFieldLabel>Recebedor</ModalFieldLabel>
            <select
              value={state.receiverId}
              aria-invalid={state.fieldErrors.receiverId ? 'true' : 'false'}
              disabled={state.loadingReceivers || state.submitting || !state.receivers.length}
              onChange={(e) => updateField('receiverId', e.target.value)}
              style={{ ...splitInputStyle(Boolean(state.fieldErrors.receiverId)), cursor: state.loadingReceivers || state.submitting || !state.receivers.length ? 'default' : 'pointer' }}
            >
              <option value="">
                {state.loadingReceivers ? 'Carregando recebedores...' : state.receivers.length ? 'Selecione um recebedor' : 'Nenhum recebedor disponÃ­vel'}
              </option>
              {state.receivers.map((receiver) => (
                <option key={receiver.id} value={receiver.id}>
                  {receiver.name}
                </option>
              ))}
            </select>
            <p style={{ fontFamily: F, fontSize: 11.5, color: state.fieldErrors.receiverId ? '#DC2626' : MUTED, marginTop: 6 }}>
              {state.fieldErrors.receiverId ?? 'Selecione quem deve receber parte do valor desta cobranÃ§a.'}
            </p>
          </div>

          <div>
            <ModalFieldLabel>Tipo do split</ModalFieldLabel>
            <select
              value={state.type}
              aria-invalid={state.fieldErrors.type ? 'true' : 'false'}
              disabled={state.submitting}
              onChange={(e) => {
                const nextType = e.target.value === 'fixed' ? 'fixed' : 'percentage'
                setState((current) =>
                  !current
                    ? current
                    : {
                        ...current,
                        type: nextType,
                        valueInput: nextType === 'percentage' ? '10' : '10,00',
                        fieldErrors: {
                          ...current.fieldErrors,
                          type: undefined,
                          valueInput: undefined,
                        },
                        generalError: null,
                      }
                )
              }}
              style={{ ...splitInputStyle(Boolean(state.fieldErrors.type)), cursor: state.submitting ? 'default' : 'pointer' }}
            >
              <option value="percentage">Percentual</option>
              <option value="fixed">Valor fixo</option>
            </select>
            <p style={{ fontFamily: F, fontSize: 11.5, color: state.fieldErrors.type ? '#DC2626' : MUTED, marginTop: 6 }}>
              {state.fieldErrors.type ?? 'Use percentual ou valor fixo para definir a regra de split.'}
            </p>
          </div>

          <div>
            <ModalFieldLabel>{state.type === 'percentage' ? 'Percentual do split' : 'Valor fixo do split'}</ModalFieldLabel>
            <input
              autoFocus
              value={state.valueInput}
              aria-invalid={state.fieldErrors.valueInput ? 'true' : 'false'}
              disabled={state.submitting}
              placeholder={state.type === 'percentage' ? 'Ex: 10' : 'Ex: 50,00'}
              onChange={(e) => updateField('valueInput', e.target.value)}
              style={splitInputStyle(Boolean(state.fieldErrors.valueInput))}
            />
            <p style={{ fontFamily: F, fontSize: 11.5, color: state.fieldErrors.valueInput ? '#DC2626' : MUTED, marginTop: 6 }}>
              {state.fieldErrors.valueInput ??
                (state.type === 'percentage' ? 'Informe um percentual entre 0,01 e 100.' : 'Informe um valor monetÃ¡rio positivo em reais.')}
            </p>
          </div>
        </div>
      </Modal>
    )

  return { openSplitDialog, splitDialog }
}

function Notice({
  children,
  style,
  tone = 'warning',
}: {
  children: React.ReactNode
  style?: React.CSSProperties
  tone?: 'warning' | 'info' | 'success'
}) {
  const palette =
    tone === 'success'
      ? {
          background: 'linear-gradient(180deg, #F0FDF4 0%, #DCFCE7 100%)',
          border: '#86EFAC',
          text: '#166534',
          icon: '#16A34A',
          shadow: 'rgba(22,163,74,.08)',
        }
      : tone === 'info'
        ? {
            background: 'linear-gradient(180deg, #F8FAFC 0%, #E0F2FE 100%)',
            border: '#7DD3FC',
            text: '#0F4C81',
            icon: '#0284C7',
            shadow: 'rgba(2,132,199,.08)',
          }
        : {
            background: 'linear-gradient(180deg, #FFFDF5 0%, #FFF7D6 100%)',
            border: '#FDE68A',
            text: '#92400E',
            icon: '#D97706',
            shadow: 'rgba(146,64,14,.05)',
          }

  return (
    <div
      style={{
        background: palette.background,
        border: '1px solid ' + palette.border,
        borderRadius: 14,
        padding: '12px 14px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        boxShadow: '0 10px 24px ' + palette.shadow,
        ...(style ?? null),
      }}
    >
      <AlertCircle size={16} style={{ color: palette.icon, marginTop: 1, flexShrink: 0 }} />
      <div style={{ fontFamily: F, fontSize: 13, color: palette.text, lineHeight: 1.5 }}>{children}</div>
    </div>
  )
}

function Toast({
  tone,
  children,
}: {
  tone: 'loading' | 'success' | 'error'
  children: React.ReactNode
}) {
  const palette =
    tone === 'success'
      ? { bg: '#ECFDF5', border: '#A7F3D0', text: '#065F46', icon: <CheckCircle2 size={20} style={{ color: '#059669', marginTop: 1, flexShrink: 0 }} /> }
      : tone === 'loading'
        ? {
            bg: '#EFF6FF',
            border: '#BFDBFE',
            text: '#1D4ED8',
            icon: <RefreshCw size={20} className="animate-spin" style={{ color: '#2563EB', marginTop: 1, flexShrink: 0 }} />,
          }
        : { bg: '#FEF2F2', border: '#FECACA', text: '#991B1B', icon: <XCircle size={20} style={{ color: '#DC2626', marginTop: 1, flexShrink: 0 }} /> }

  return (
    <div
      className="cp-fade-in"
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        top: 16,
        right: 16,
        left: 16,
        maxWidth: 520,
        width: 'calc(100vw - 32px)',
        marginLeft: 'auto',
        zIndex: 95,
        background: palette.bg,
        border: `1px solid ${palette.border}`,
        borderRadius: 16,
        padding: '15px 18px',
        boxShadow: '0 16px 40px rgba(15,23,42,.2)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
      }}
    >
      {palette.icon}
      <div style={{ fontFamily: F, fontSize: 14.5, fontWeight: 700, color: palette.text, lineHeight: 1.45 }}>{children}</div>
    </div>
  )
}

function useConfirmDialog() {
  const [state, setState] = useState<null | { title: string; description?: string; confirmLabel?: string; danger?: boolean; resolve: (v: boolean) => void }>(null)

  const confirm = (opts: { title: string; description?: string; confirmLabel?: string; danger?: boolean }) =>
    new Promise<boolean>((resolve) => {
      setState({ ...opts, resolve })
    })

  const confirmDialog =
    !state ? null : (
      <Modal
        open={true}
        title={state.title}
        description={state.description}
        dismissOnBackdrop={false}
        dismissOnEscape={false}
        onClose={() => {}}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
            <GhostBtn
              onClick={() => {
                state.resolve(false)
                setState(null)
              }}
            >
              Cancelar
            </GhostBtn>
            {state.danger ? (
              <DangerBtn
                onClick={() => {
                  state.resolve(true)
                  setState(null)
                }}
              >
                {state.confirmLabel ?? 'Confirmar'}
              </DangerBtn>
            ) : (
              <PrimaryBtn
                onClick={() => {
                  state.resolve(true)
                  setState(null)
                }}
              >
                {state.confirmLabel ?? 'Confirmar'}
              </PrimaryBtn>
            )}
          </div>
        }
      >
        <div />
      </Modal>
    )

  return { confirm, confirmDialog }
}

function usePromptDialog() {
  const [state, setState] = useState<null | { title: string; label: string; helperText?: string; defaultValue?: string; placeholder?: string; multiline?: boolean; normalize?: (v: string) => string; requiredMessage?: string; resolve: (v: string | null) => void }>(null)
  const [value, setValue] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)

  const prompt = (opts: { title: string; label: string; helperText?: string; defaultValue?: string; placeholder?: string; multiline?: boolean; normalize?: (v: string) => string; requiredMessage?: string }) =>
    new Promise<string | null>((resolve) => {
      setValue(opts.defaultValue ?? '')
      setFieldError(null)
      setState({ ...opts, resolve })
    })

  const promptDialog =
    !state ? null : (() => {
      const submit = () => {
        const v = value.trim()
        if (!v && state.requiredMessage) {
          setFieldError(state.requiredMessage)
          emitAppToast({ tone: 'warning', title: 'Campo obrigatÃ³rio', message: state.requiredMessage })
          return
        }
        state.resolve(v ? v : null)
        setFieldError(null)
        setState(null)
      }
      return (
        <Modal
          open={true}
          title={state.title}
          dismissOnBackdrop={false}
          dismissOnEscape={false}
          onClose={() => {}}
          footer={
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
              <GhostBtn
                onClick={() => {
                  state.resolve(null)
                  setFieldError(null)
                  setState(null)
                }}
              >
                Cancelar
              </GhostBtn>
              <PrimaryBtn onClick={submit}>{'Confirmar'}</PrimaryBtn>
            </div>
          }
        >
          <div>
            <ModalFieldLabel>{state.label}</ModalFieldLabel>
            {state.helperText ? <p style={{ fontFamily: F, fontSize: 12, color: MUTED, marginBottom: 8, lineHeight: 1.45 }}>{state.helperText}</p> : null}
            {fieldError ? <p style={{ fontFamily: F, fontSize: 12, color: '#DC2626', marginBottom: 8 }}>{fieldError}</p> : null}
            {state.multiline ? (
              <textarea
                autoFocus
                rows={4}
                value={value}
                placeholder={state.placeholder}
                onChange={(e) => {
                  if (fieldError) setFieldError(null)
                  setValue(state.normalize ? state.normalize(e.target.value) : e.target.value)
                }}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 12, border: `1px solid ${BORDER}`, fontFamily: F, fontSize: 13, color: TEXT, resize: 'vertical', boxSizing: 'border-box' }}
              />
            ) : (
              <input
                autoFocus
                value={value}
                placeholder={state.placeholder}
                onChange={(e) => {
                  if (fieldError) setFieldError(null)
                  setValue(state.normalize ? state.normalize(e.target.value) : e.target.value)
                }}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 12, border: `1px solid ${BORDER}`, fontFamily: F, fontSize: 13, color: TEXT, boxSizing: 'border-box' }}
              />
            )}
          </div>
        </Modal>
      )
    })()

  return { prompt, promptDialog }
}

function onlyDigits(value: string) {
  return value.replace(/\D+/g, '')
}

function maskCpfCnpj(value: string) {
  const d = onlyDigits(value).slice(0, 14)
  if (d.length <= 11) {
    const p1 = d.slice(0, 3)
    const p2 = d.slice(3, 6)
    const p3 = d.slice(6, 9)
    const p4 = d.slice(9, 11)
    if (d.length <= 3) return p1
    if (d.length <= 6) return `${p1}.${p2}`
    if (d.length <= 9) return `${p1}.${p2}.${p3}`
    return `${p1}.${p2}.${p3}-${p4}`
  }
  const p1 = d.slice(0, 2)
  const p2 = d.slice(2, 5)
  const p3 = d.slice(5, 8)
  const p4 = d.slice(8, 12)
  const p5 = d.slice(12, 14)
  if (d.length <= 2) return p1
  if (d.length <= 5) return `${p1}.${p2}`
  if (d.length <= 8) return `${p1}.${p2}.${p3}`
  if (d.length <= 12) return `${p1}.${p2}.${p3}/${p4}`
  return `${p1}.${p2}.${p3}/${p4}-${p5}`
}

function maskPhoneBR(value: string) {
  const d = onlyDigits(value).slice(0, 11)
  if (d.length <= 2) return d ? `(${d}` : ''
  const area = d.slice(0, 2)
  const rest = d.slice(2)
  if (rest.length <= 4) return `(${area}) ${rest}`.trim()
  if (rest.length <= 8) return `(${area}) ${rest.slice(0, 4)}-${rest.slice(4)}`.trim()
  return `(${area}) ${rest.slice(0, 5)}-${rest.slice(5)}`.trim()
}

function maskCardExp(value: string) {
  const d = onlyDigits(value).slice(0, 4)
  if (d.length <= 2) return d
  return `${d.slice(0, 2)}/${d.slice(2)}`
}

function maskCardNumber(value: string) {
  const d = onlyDigits(value).slice(0, 19)
  const parts: string[] = []
  for (let i = 0; i < d.length; i += 4) parts.push(d.slice(i, i + 4))
  return parts.join(' ')
}

function maskBRLInput(value: string) {
  const d = onlyDigits(value)
  const cents = d ? Number(d) : 0
  const v = Math.floor(cents / 100)
  const c = String(cents % 100).padStart(2, '0')
  const int = String(v).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${int},${c}`
}

function countDigitsBefore(value: string, endIndex: number) {
  const end = Math.max(0, Math.min(endIndex, value.length))
  let count = 0
  for (let i = 0; i < end; i += 1) {
    const code = value.charCodeAt(i)
    if (code >= 48 && code <= 57) count += 1
  }
  return count
}

function caretPosForDigitIndex(masked: string, digitIndex: number) {
  if (!digitIndex) return 0
  let count = 0
  for (let i = 0; i < masked.length; i += 1) {
    const code = masked.charCodeAt(i)
    if (code >= 48 && code <= 57) {
      count += 1
      if (count >= digitIndex) return i + 1
    }
  }
  return masked.length
}

function applyMaskKeepingCaret(
  e: React.ChangeEvent<HTMLInputElement>,
  setValue: (v: string) => void,
  mask: (v: string) => string
) {
  const el = e.currentTarget
  const raw = el.value
  const caret = typeof el.selectionStart === 'number' ? el.selectionStart : raw.length
  const digitIndex = countDigitsBefore(raw, caret)
  const next = mask(raw)
  setValue(next)
  requestAnimationFrame(() => {
    try {
      const pos = caretPosForDigitIndex(next, digitIndex)
      el.setSelectionRange(pos, pos)
    } catch {
    }
  })
}

export function LoginScreen() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { session } = useSession()
  const [showPw, setShowPw] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const inp: React.CSSProperties = {
    width: '100%',
    background: FAINT,
    border: '1px solid rgba(2,27,91,.1)',
    borderRadius: 10,
    padding: '11px 14px',
    fontFamily: F,
    fontSize: 13.5,
    color: TEXT,
    outline: 'none',
    boxSizing: 'border-box',
  }
  const lbl: React.CSSProperties = { fontFamily: F, fontWeight: 600, fontSize: 12, color: NAVY, display: 'block', marginBottom: 6 }

  useEffect(() => {
    if (!session?.user) return
    const returnToRaw = searchParams?.get('returnTo')
    const returnTo = returnToRaw && returnToRaw.startsWith('/') ? returnToRaw : '/dashboard'
    window.location.replace(returnTo)
  }, [session, searchParams])

  return (
    <div className="flex flex-col md:flex-row" style={{ minHeight: '100vh', fontFamily: F, background: 'white' }}>
      <div className="hidden md:flex" style={{ width: 480, background: NAVY, flexDirection: 'column', justifyContent: 'space-between', padding: '48px 52px', flexShrink: 0 }}>
        <WordMark dark />
        <div>
          <h1 style={{ color: 'white', fontWeight: 800, fontSize: 36, lineHeight: 1.15, marginBottom: 16, letterSpacing: '-0.02em' }}>
            Sua operaÃ§Ã£o financeira em um sÃ³ lugar
          </h1>
          <p style={{ color: 'rgba(255,255,255,.45)', fontSize: 14.5, lineHeight: 1.7, marginBottom: 48 }}>
            Organize cobranÃ§as, acompanhe recebimentos e mantenha sua operaÃ§Ã£o pronta para crescer com clareza.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {[
              { icon: CreditCard, t: 'CobranÃ§as e pagamentos em um fluxo simples', d: 'Acompanhe a jornada do cliente sem perder visibilidade da operaÃ§Ã£o.' },
              { icon: Shield, t: 'SeguranÃ§a e confianÃ§a para o dia a dia', d: 'Seus dados ficam organizados com uma experiÃªncia pensada para uso profissional.' },
              { icon: TrendingUp, t: 'Indicadores claros para decidir melhor', d: 'Veja o que jÃ¡ entrou, o que estÃ¡ em andamento e o que merece sua atenÃ§Ã£o.' },
            ].map(({ icon: Icon, t, d }) => (
              <div key={t} style={{ display: 'flex', gap: 14 }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: `${MINT}18`, border: `1px solid ${MINT}28`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon size={17} style={{ color: MINT }} />
                </div>
                <div>
                  <p style={{ color: 'white', fontWeight: 600, fontSize: 13.5 }}>{t}</p>
                  <p style={{ color: 'rgba(255,255,255,.38)', fontSize: 12, marginTop: 2 }}>{d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <p style={{ color: 'rgba(255,255,255,.2)', fontSize: 12 }}>
          Plataforma preparada para equipes que precisam de clareza, controle e agilidade.
        </p>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40, background: BG }}>
        <div style={{ width: '100%', maxWidth: 380 }}>
          <div style={{ marginBottom: 32 }}>
            <h2 style={{ fontWeight: 800, fontSize: 26, color: TEXT, marginBottom: 6, letterSpacing: '-0.02em' }}>Bem-vindo de volta</h2>
            <p style={{ color: MUTED, fontSize: 14, lineHeight: 1.6 }}>Entre com sua conta para continuar de onde vocÃª parou.</p>
          </div>
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              setError(null)
              setInfo(null)
              setLoading(true)
              try {
                const { error: err } = await signInWithPassword(email, password)
                if (err) {
                  setError(toUserFacingError(err.message, 'NÃ£o foi possÃ­vel entrar. Verifique seus dados e tente novamente.', 'signInWithPassword'))
                  return
                }
                const returnToRaw = searchParams?.get('returnTo')
                const returnTo = returnToRaw && returnToRaw.startsWith('/') ? returnToRaw : '/dashboard'
                const ensureRes = await fetch('/api/onboarding/ensure', { method: 'POST' }).catch(() => null)
                if (ensureRes && !ensureRes.ok) {
                  const j = await ensureRes.json().catch(() => null)
                  setError(toUserFacingError(j?.error, 'NÃ£o foi possÃ­vel finalizar o cadastro agora. Tente novamente.', '/api/onboarding/ensure'))
                  return
                }
                window.location.assign(returnTo)
              } finally {
                setLoading(false)
              }
            }}
            style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
          >
            <div>
              <label style={lbl}>E-mail</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inp} />
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <label style={lbl}>Senha</label>
                <button
                  type="button"
                  disabled={loading}
                  onClick={async () => {
                    setError(null)
                    setInfo(null)
                    if (!email) {
                      setError('Informe seu e-mail para recuperar a senha.')
                      return
                    }
                    setLoading(true)
                    try {
                      const redirectTo = `${window.location.origin}/reset-password`
                      const { error: err } = await resetPassword(email, redirectTo)
                      if (err) {
                        setError(toUserFacingError(err.message, 'NÃ£o foi possÃ­vel enviar o e-mail de redefiniÃ§Ã£o. Tente novamente.', 'resetPassword'))
                        return
                      }
                      setInfo('Enviamos um e-mail com as instruÃ§Ãµes para redefinir sua senha.')
                    } finally {
                      setLoading(false)
                    }
                  }}
                  style={{ fontFamily: F, fontWeight: 600, fontSize: 12, color: NAVY, background: 'none', border: 'none', cursor: 'pointer', opacity: loading ? 0.6 : 1 }}
                >
                  Esqueci minha senha
                </button>
              </div>
              <div style={{ position: 'relative' }}>
                <input type={showPw ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} style={{ ...inp, paddingRight: 44 }} />
                <button
                  type="button"
                  disabled={loading}
                  aria-label={showPw ? 'Ocultar senha' : 'Mostrar senha'}
                  onClick={() => setShowPw(!showPw)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: MUTED, opacity: loading ? 0.6 : 1 }}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              style={{ background: MINT, color: NAVY, fontFamily: F, fontWeight: 800, fontSize: 14.5, padding: '13px', borderRadius: 11, border: 'none', cursor: loading ? 'default' : 'pointer', marginTop: 4, boxShadow: `0 4px 16px ${MINT}40`, transition: 'background .15s', opacity: loading ? 0.75 : 1 }}
              onMouseEnter={(e) => {
                if (!loading) e.currentTarget.style.background = MINT_D
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = MINT
              }}
            >
              {loading ? 'Entrando...' : 'Entrar na conta'}
            </button>
          </form>
          {(error || info) && (
            <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
              {error ? (
                <div
                  style={{
                    borderRadius: 14,
                    border: '1px solid #FECACA',
                    background: '#FEF2F2',
                    padding: '10px 12px',
                    fontFamily: F,
                    fontSize: 13,
                    color: '#B91C1C',
                    lineHeight: 1.55,
                  }}
                >
                  {error}
                </div>
              ) : null}
              {info ? (
                <div
                  style={{
                    borderRadius: 14,
                    border: '1px solid #BBF7D0',
                    background: '#F0FDF4',
                    padding: '10px 12px',
                    fontFamily: F,
                    fontSize: 13,
                    color: '#166534',
                    lineHeight: 1.55,
                  }}
                >
                  {info}
                </div>
              ) : null}
            </div>
          )}
          <div style={{ marginTop: 24, paddingTop: 20, borderTop: `1px solid ${BORDER}`, textAlign: 'center' }}>
            <span style={{ color: MUTED, fontSize: 13.5 }}>NÃ£o tem uma conta? </span>
            <button onClick={() => router.push('/register')} style={{ color: NAVY, fontWeight: 700, fontSize: 13.5, background: 'none', border: 'none', cursor: 'pointer', fontFamily: F }}>
              Criar conta
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function RegisterScreen() {
  const router = useRouter()
  const [showPw, setShowPw] = useState(false)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [document, setDocument] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const inp: React.CSSProperties = { width: '100%', background: FAINT, border: '1px solid rgba(2,27,91,.1)', borderRadius: 10, padding: '11px 14px', fontFamily: F, fontSize: 13.5, color: TEXT, outline: 'none', boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { fontFamily: F, fontWeight: 600, fontSize: 12, color: NAVY, display: 'block', marginBottom: 6 }
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: BG, fontFamily: F }}>
      <div style={{ width: '100%', maxWidth: 520, background: 'white', borderRadius: 20, border: `1px solid ${BORDER}`, boxShadow: '0 4px 24px rgba(2,27,91,.07)', padding: '44px 48px' }}>
        <div style={{ marginBottom: 28, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12 }}>
          <WordMark />
          <div>
            <h2 style={{ fontWeight: 800, fontSize: 24, color: TEXT, marginBottom: 4, letterSpacing: '-0.02em' }}>Criar conta</h2>
            <p style={{ color: MUTED, fontSize: 13.5 }}>Comece a receber pagamentos hoje mesmo.</p>
          </div>
        </div>
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            setError(null)
            setInfo(null)
            if (!fullName || !email || !password) {
              setError('Preencha nome, e-mail e senha.')
              return
            }
            if (password.length < 8) {
              setError('A senha deve ter pelo menos 8 caracteres.')
              return
            }
            if (password !== password2) {
              setError('As senhas nÃ£o conferem.')
              return
            }
            setLoading(true)
            try {
              const { data, error: err } = await signUp(email, password, { fullName, role: 'owner' })
              if (err) {
                setError(toUserFacingError(err.message, 'NÃ£o foi possÃ­vel criar sua conta. Verifique os dados e tente novamente.', 'signUp'))
                return
              }
              if (!data.session) {
                setInfo('Cadastro criado. Verifique seu e-mail para confirmar e finalizar o acesso.')
                return
              }
              router.push('/dashboard')
            } finally {
              setLoading(false)
            }
          }}
          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}
        >
          <div style={{ gridColumn: '1/-1' }}>
            <label style={lbl}>Nome completo</label>
            <input type="text" placeholder="Ana Lima" value={fullName} onChange={(e) => setFullName(e.target.value)} style={inp} />
          </div>
          <div>
            <label style={lbl}>E-mail</label>
            <input type="email" placeholder="seu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} style={inp} />
          </div>
          <div>
            <label style={lbl}>Telefone</label>
            <input type="tel" placeholder="(11) 99999-0000" value={phone} onChange={(e) => setPhone(maskPhoneBR(e.target.value))} style={inp} />
          </div>
          <div style={{ gridColumn: '1/-1' }}>
            <label style={lbl}>CPF / CNPJ</label>
            <input type="text" placeholder="000.000.000-00 ou 00.000.000/0001-00" value={document} onChange={(e) => setDocument(maskCpfCnpj(e.target.value))} style={inp} />
          </div>
          <div>
            <label style={lbl}>Senha</label>
            <div style={{ position: 'relative' }}>
              <input type={showPw ? 'text' : 'password'} placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢" value={password} onChange={(e) => setPassword(e.target.value)} style={{ ...inp, paddingRight: 44 }} />
              <button type="button" disabled={loading} aria-label={showPw ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setShowPw(!showPw)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: MUTED, opacity: loading ? 0.6 : 1 }}>
                {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>
          <div>
            <label style={lbl}>Confirmar senha</label>
            <input type="password" placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢" value={password2} onChange={(e) => setPassword2(e.target.value)} style={inp} />
          </div>
          <div style={{ gridColumn: '1/-1', marginTop: 4 }}>
            <button
              type="submit"
              disabled={loading}
              style={{ width: '100%', background: MINT, color: NAVY, fontFamily: F, fontWeight: 800, fontSize: 14.5, padding: '13px', borderRadius: 11, border: 'none', cursor: loading ? 'default' : 'pointer', boxShadow: `0 4px 16px ${MINT}40`, transition: 'background .15s', opacity: loading ? 0.75 : 1 }}
              onMouseEnter={(e) => {
                if (!loading) e.currentTarget.style.background = MINT_D
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = MINT
              }}
            >
              {loading ? 'Criando conta...' : 'Criar conta'}
            </button>
          </div>
        </form>
        {(error || info) && (
          <div style={{ marginTop: 14 }}>
            {error && <p style={{ fontFamily: F, fontSize: 13, color: '#DC2626', lineHeight: 1.5 }}>{error}</p>}
            {info && <p style={{ fontFamily: F, fontSize: 13, color: '#059669', lineHeight: 1.5 }}>{info}</p>}
          </div>
        )}
        <div style={{ marginTop: 18, textAlign: 'center' }}>
          <span style={{ color: MUTED, fontSize: 13.5 }}>JÃ¡ tem conta? </span>
          <button onClick={() => router.push('/login')} style={{ color: NAVY, fontWeight: 700, fontSize: 13.5, background: 'none', border: 'none', cursor: 'pointer', fontFamily: F }}>
            Entrar
          </button>
        </div>
      </div>
    </div>
  )
}

export function ResetPasswordScreen() {
  const router = useRouter()
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const inp: React.CSSProperties = { width: '100%', background: FAINT, border: '1px solid rgba(2,27,91,.1)', borderRadius: 10, padding: '11px 14px', fontFamily: F, fontSize: 13.5, color: TEXT, outline: 'none', boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { fontFamily: F, fontWeight: 600, fontSize: 12, color: NAVY, display: 'block', marginBottom: 6 }

  useEffect(() => {
    const run = async () => {
      const code = new URLSearchParams(window.location.search).get('code')
      if (!code) return
      const supabase = getSupabaseClient()
      await supabase.auth.exchangeCodeForSession(code)
    }
    void run()
  }, [])

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: BG, fontFamily: F }}>
      <div style={{ width: '100%', maxWidth: 480, background: 'white', borderRadius: 20, border: `1px solid ${BORDER}`, boxShadow: '0 4px 24px rgba(2,27,91,.07)', padding: '44px 48px' }}>
        <div style={{ marginBottom: 22, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12 }}>
          <WordMark />
          <div>
            <h2 style={{ fontWeight: 800, fontSize: 24, color: TEXT, marginBottom: 4, letterSpacing: '-0.02em' }}>Redefinir senha</h2>
            <p style={{ color: MUTED, fontSize: 13.5 }}>Defina uma nova senha para continuar.</p>
          </div>
        </div>
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            setError(null)
            setInfo(null)
            if (pw.length < 8) {
              setError('A senha deve ter pelo menos 8 caracteres.')
              return
            }
            if (pw !== pw2) {
              setError('As senhas nÃ£o conferem.')
              return
            }
            setLoading(true)
            try {
              const { error: err } = await updatePassword(pw)
              if (err) {
                setError(toUserFacingError(err.message, 'NÃ£o foi possÃ­vel atualizar sua senha. Tente novamente.', 'updatePassword'))
                return
              }
              setInfo('Senha atualizada com sucesso.')
              router.push('/dashboard')
            } finally {
              setLoading(false)
            }
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
        >
          <div>
            <label style={lbl}>Nova senha</label>
            <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} style={inp} />
          </div>
          <div>
            <label style={lbl}>Confirmar senha</label>
            <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} style={inp} />
          </div>
          <button
            type="submit"
            disabled={loading}
            style={{ width: '100%', background: MINT, color: NAVY, fontFamily: F, fontWeight: 800, fontSize: 14.5, padding: '13px', borderRadius: 11, border: 'none', cursor: loading ? 'default' : 'pointer', boxShadow: `0 4px 16px ${MINT}40`, transition: 'background .15s', opacity: loading ? 0.75 : 1 }}
            onMouseEnter={(e) => {
              if (!loading) e.currentTarget.style.background = MINT_D
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = MINT
            }}
          >
            {loading ? 'Atualizando...' : 'Atualizar senha'}
          </button>
        </form>
        {(error || info) && (
          <div style={{ marginTop: 14 }}>
            {error && <p style={{ fontFamily: F, fontSize: 13, color: '#DC2626', lineHeight: 1.5 }}>{error}</p>}
            {info && <p style={{ fontFamily: F, fontSize: 13, color: '#059669', lineHeight: 1.5 }}>{info}</p>}
          </div>
        )}
        <div style={{ marginTop: 18, textAlign: 'center' }}>
          <button onClick={() => router.push('/login')} style={{ color: NAVY, fontWeight: 700, fontSize: 13.5, background: 'none', border: 'none', cursor: 'pointer', fontFamily: F }}>
            Voltar para o login
          </button>
        </div>
      </div>
    </div>
  )
}

export function DashboardScreen() {
  const router = useRouter()
  const uid = useId()
  const navyId = `navy-${uid}`
  const mintId = `mint-${uid}`
  const [days, setDays] = useState(30)
  const [status, setStatus] = useState<'all' | 'paid' | 'created' | 'failed' | 'refunded'>('all')
  const [receiverId, setReceiverId] = useState<string>('')
  const dashboardCacheKey = useMemo(() => `dashboard:${days}:${status}:${receiverId || 'all'}`, [days, receiverId, status])
  const cachedDashboard = useMemo(() => readScreenCache<{ txs: any[]; metrics: any | null; receivers: any[] }>(dashboardCacheKey), [dashboardCacheKey])
  const [loading, setLoading] = useState(cachedDashboard == null)
  const [error, setError] = useState<string | null>(null)
  const [txs, setTxs] = useState<any[]>(cachedDashboard?.txs ?? [])
  const [metrics, setMetrics] = useState<any | null>(cachedDashboard?.metrics ?? null)
  const [receivers, setReceivers] = useState<any[]>(cachedDashboard?.receivers ?? [])

  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false
    const run = async () => {
      const screenPath = typeof window !== 'undefined' ? window.location.pathname : '/dashboard'
      const cached = readScreenCache<{ txs: any[]; metrics: any | null; receivers: any[] }>(dashboardCacheKey)
      if (cached) {
        setTxs(cached.txs)
        setMetrics(cached.metrics)
        setReceivers(cached.receivers)
        setLoading(false)
      } else {
        setLoading(true)
      }
      setError(null)
      try {
        const me = await getMeCached().catch(() => null)
        const role = typeof me?.role === 'string' ? me.role.trim().toLowerCase() : null
        const canLoadReceivers = role !== 'financeiro'
        if (!canLoadReceivers && receiverId) setReceiverId('')
        for (let attempt = 0; attempt < 2; attempt += 1) {
          try {
            const qs = new URLSearchParams()
            qs.set('days', String(days))
            if (status !== 'all') qs.set('status', status)
            if (receiverId && canLoadReceivers) qs.set('receiverId', receiverId)
            const [txRes, dashRes, recRes] = await Promise.all([
              fetch('/api/transactions', { method: 'GET', signal: controller.signal, keepalive: true }),
              fetch(`/api/dashboard?${qs.toString()}`, { method: 'GET', signal: controller.signal, keepalive: true }),
              canLoadReceivers ? fetch('/api/receivers', { method: 'GET', signal: controller.signal, keepalive: true }) : Promise.resolve(null),
            ])
            const txJson = await txRes.json().catch(() => null)
            const dashJson = await dashRes.json().catch(() => null)
            const recJson = recRes ? await (recRes as any).json().catch(() => null) : null
            let nextError: string | null = null

            if (!txRes.ok) {
              logError('DashboardScreen: /api/transactions failed', { status: txRes.status, error: txJson?.error })
              nextError = toUserFacingError(txJson?.error, 'Ocorreu um erro ao carregar o dashboard. Tente novamente.', '/api/transactions')
              if (!cancelled) setTxs([])
            } else {
              if (!cancelled) setTxs(Array.isArray(txJson?.transactions) ? txJson.transactions : [])
            }

            if (!dashRes.ok) {
              logError('DashboardScreen: /api/dashboard failed', { status: dashRes.status, error: dashJson?.error })
              nextError = nextError ?? toUserFacingError(dashJson?.error, 'Ocorreu um erro ao carregar o dashboard. Tente novamente.', '/api/dashboard')
              if (!cancelled) setMetrics(null)
            } else {
              if (!cancelled) setMetrics(dashJson?.metrics ?? null)
            }

            const nextReceivers = !canLoadReceivers ? [] : Array.isArray(recJson?.receivers) ? recJson.receivers : []

            if (!canLoadReceivers) {
              if (!cancelled) setReceivers([])
            } else if (!(recRes as any)?.ok) {
              logError('DashboardScreen: /api/receivers failed', { status: (recRes as any)?.status, error: recJson?.error })
              nextError = nextError ?? toUserFacingError(recJson?.error, 'Ocorreu um erro ao carregar recebedores. Tente novamente.', '/api/receivers')
              if (!cancelled) setReceivers([])
            } else {
              if (!cancelled) setReceivers(nextReceivers)
            }

            if (!cancelled && !nextError) {
              writeScreenCache(dashboardCacheKey, {
                txs: txRes.ok ? (Array.isArray(txJson?.transactions) ? txJson.transactions : []) : [],
                metrics: dashRes.ok ? (dashJson?.metrics ?? null) : null,
                receivers: nextReceivers,
              })
            }

            if (!cancelled) setError(nextError)
            break
          } catch (e) {
            await new Promise((resolve) => window.setTimeout(resolve, 50))
            const navigatedAway = typeof window !== 'undefined' && window.location.pathname !== screenPath
            if (cancelled || controller.signal.aborted || navigatedAway || isAbortLikeError(e)) return
            if (attempt === 0) {
              await new Promise((resolve) => window.setTimeout(resolve, 250))
              continue
            }
            throw e
          }
        }
      } catch (e) {
        if (cancelled || controller.signal.aborted || isAbortLikeError(e)) return
        logError('DashboardScreen load failed', e)
        setError('Ocorreu um erro ao carregar o dashboard. Tente novamente.')
        setTxs([])
        setMetrics(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [dashboardCacheKey, days, receiverId, status])

  const tpv = Number(metrics?.tpv_cents ?? 0)
  const balance = metrics?.balance_cents == null ? null : Number(metrics.balance_cents)
  const connektRevenue = Number(metrics?.connekt_revenue_cents ?? 0)
  const anticipable = Number(metrics?.anticipable_cents ?? 0)
  const approvedCount = Number(metrics?.payments?.approved ?? 0)
  const pendingCount = Number(metrics?.payments?.pending ?? 0)
  const mrr = Number(metrics?.subscriptions?.mrr_cents ?? 0)
  const churn = Number(metrics?.subscriptions?.churn_rate ?? 0)
  const pendingPayouts = Number(metrics?.payouts?.pending ?? 0)
  const divergences = Number(metrics?.reconciliation?.divergences ?? 0)
  const receiverVolume = metrics?.receiver_volume_cents == null ? null : Number(metrics.receiver_volume_cents)

  const series = useMemo(() => {
    if (!Array.isArray(metrics?.charts?.by_day)) return []
    return (metrics.charts.by_day as any[]).slice(-14).map((d) => ({
      month: typeof d.day === 'string' ? d.day.slice(5).split('-').reverse().join('/') : 'â€”',
      volume: Number(d.volume_cents ?? 0),
      revenue: Number(d.revenue_cents ?? 0),
    }))
  }, [metrics])

  const paymentsByMethod = useMemo(() => (Array.isArray(metrics?.charts?.payments_by_method) ? (metrics.charts.payments_by_method as any[]) : []), [metrics])
  const subsByStatus = useMemo(() => (Array.isArray(metrics?.charts?.subscriptions_by_status) ? (metrics.charts.subscriptions_by_status as any[]) : []), [metrics])
  const maxMethod = useMemo(() => paymentsByMethod.reduce((acc, r) => Math.max(acc, Number(r.count ?? 0)), 0) || 1, [paymentsByMethod])
  const maxSub = useMemo(() => subsByStatus.reduce((acc, r) => Math.max(acc, Number(r.count ?? 0)), 0) || 1, [subsByStatus])

  const sortedTxs = useMemo(() => {
    return txs.slice().sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }, [txs])

  const activity = useMemo(() => {
    return sortedTxs.slice(0, 6).map((tx) => {
      const customer = tx.customer?.name ?? tx.customer?.email ?? 'â€”'
      const method = tx.method === 'pix' ? 'PIX' : tx.method === 'card' ? 'CartÃ£o' : String(tx.method ?? 'â€”')
      const status = tx.status === 'paid' ? 'Pago' : tx.status === 'failed' ? 'Recusado' : tx.status === 'refunded' ? 'Estornado' : 'Pendente'
      return { id: tx.id, customer, value: Number(tx.amount ?? 0), method, status }
    })
  }, [sortedTxs])

  const last = useMemo(() => {
    return sortedTxs.slice(0, 5).map((tx) => {
      const customer = tx.customer?.name ?? tx.customer?.email ?? 'â€”'
      const value = Number(tx.amount ?? 0)
      const method = tx.method === 'pix' ? 'PIX' : tx.method === 'card' ? 'CartÃ£o' : String(tx.method ?? 'â€”')
      const status = tx.status === 'paid' ? 'Pago' : tx.status === 'failed' ? 'Recusado' : tx.status === 'refunded' ? 'Estornado' : 'Pendente'
      const date = tx.created_at ? new Date(tx.created_at as string).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'â€”'
      return { id: tx.id, customer, value, method, status, date }
    })
  }, [sortedTxs])

  const receiverOptions = useMemo(() => {
    return receivers.map((r: any) => (
      <option key={r.id} value={r.id}>
        {r.name} Â· {r.document}
      </option>
    ))
  }, [receivers])
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ background: 'white', borderRadius: 14, border: `1px solid ${BORDER}`, padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontFamily: F, fontSize: 12, color: MUTED }}>PerÃ­odo</span>
          <select value={String(days)} onChange={(e) => setDays(Number(e.target.value))} style={{ fontFamily: F, fontSize: 12.5, color: TEXT, background: FAINT, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '8px 10px', outline: 'none' }}>
            {[7, 14, 30, 60, 90].map((d) => (
              <option key={d} value={String(d)}>
                {d} dias
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontFamily: F, fontSize: 12, color: MUTED }}>Status</span>
          <select value={status} onChange={(e) => setStatus((e.target.value as any) ?? 'all')} style={{ fontFamily: F, fontSize: 12.5, color: TEXT, background: FAINT, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '8px 10px', outline: 'none' }}>
            {[
              { v: 'all', l: 'Todos' },
              { v: 'paid', l: 'Pago' },
              { v: 'created', l: 'Pendente' },
              { v: 'failed', l: 'Recusado' },
              { v: 'refunded', l: 'Estornado' },
            ].map((o) => (
              <option key={o.v} value={o.v}>
                {o.l}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1, minWidth: 240 }}>
          <span style={{ fontFamily: F, fontSize: 12, color: MUTED }}>Recebedor</span>
          <select value={receiverId} onChange={(e) => setReceiverId(e.target.value)} style={{ flex: 1, minWidth: 160, fontFamily: F, fontSize: 12.5, color: TEXT, background: FAINT, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '8px 10px', outline: 'none' }}>
            <option value="">Todos</option>
            {receiverOptions}
          </select>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
        <KpiCard label="TPV" value={fmtBRL(tpv)} sub="Pagos (últimos 30 dias)" icon={TrendingUp} trend="up" loading={loading} />
        <KpiCard label="Receita Connekt" value={fmtBRL(connektRevenue)} sub="Taxa (últimos 30 dias)" icon={Wallet} loading={loading} />
        <KpiCard label="Saldo disponível" value={balance == null ? '—' : fmtBRL(balance)} sub={`Antecipável: ${fmtBRL(anticipable)}`} icon={Database} loading={loading} />
        <KpiCard label="MRR" value={fmtBRL(mrr)} sub={`Churn: ${(churn * 100).toFixed(1).replace('.', ',')}%`} icon={RefreshCw} loading={loading} />
        <KpiCard label="Pagamentos aprovados" value={String(approvedCount)} sub="Últimos 30 dias" icon={CheckCircle2} trend="up" loading={loading} />
        <KpiCard label="Pagamentos pendentes" value={String(pendingCount)} sub="Aguardando confirmação" icon={Clock} loading={loading} />
        <KpiCard label="Repasses pendentes" value={String(pendingPayouts)} sub="Acompanhar repasses" icon={ArrowRightLeft} loading={loading} />
        <KpiCard label="Divergências" value={String(divergences)} sub="Conciliação" icon={AlertCircle} loading={loading} />
        {receiverVolume != null && <KpiCard label="Volume (recebedor)" value={fmtBRL(receiverVolume)} sub="Recebedor filtrado" icon={Building2} loading={loading} />}
      </div>
      {error && <Notice>{error}</Notice>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <div style={{ background: 'white', borderRadius: 16, border: `1px solid ${BORDER}`, padding: '24px', boxShadow: '0 1px 4px rgba(2,27,91,.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div>
              <p style={{ fontFamily: F, fontWeight: 700, fontSize: 15, color: TEXT }}>Volume de vendas</p>
              <p style={{ fontFamily: F, fontSize: 12, color: MUTED, marginTop: 2 }}>Ãšltimos 14 dias</p>
            </div>
            <div style={{ fontFamily: MONO, fontSize: 11.5, color: MUTED }}>{receiverId ? 'Filtrado' : 'Geral'}</div>
          </div>
          <DashboardChart series={series} navyId={navyId} mintId={mintId} />
          <div style={{ display: 'flex', gap: 20, marginTop: 12 }}>
            {[{ color: NAVY, label: 'TPV (centavos)' }, { color: MINT, label: 'Receita Connekt' }].map(({ color, label }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 10, height: 10, borderRadius: 3, background: color }} />
                <span style={{ fontFamily: F, fontSize: 11.5, color: MUTED }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
          <div style={{ background: 'white', borderRadius: 16, border: `1px solid ${BORDER}`, padding: '24px', boxShadow: '0 1px 4px rgba(2,27,91,.04)' }}>
            <p style={{ fontFamily: F, fontWeight: 700, fontSize: 15, color: TEXT, marginBottom: 14 }}>Pagamentos por mÃ©todo</p>
            {!loading &&
              paymentsByMethod
                .slice()
                .sort((a: any, b: any) => Number(b.count ?? 0) - Number(a.count ?? 0))
                .slice(0, 6)
                .map((r: any) => {
                  const method = String(r.method ?? 'unknown')
                  const count = Number(r.count ?? 0)
                  const width = Math.max(3, Math.round((count / maxMethod) * 100))
                  return (
                    <div key={method} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                      <div style={{ width: 80, fontFamily: MONO, fontSize: 11.5, color: MUTED }}>{method}</div>
                      <div style={{ flex: 1, height: 10, borderRadius: 6, background: FAINT, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
                        <div style={{ width: `${width}%`, height: '100%', background: NAVY }} />
                      </div>
                      <div style={{ width: 42, textAlign: 'right', fontFamily: MONO, fontSize: 11.5, color: TEXT }}>{count}</div>
                    </div>
                  )
                })}
            {loading && (
              <div className="cp-fade-in" style={{ display: 'grid', gap: 12, paddingTop: 6 }}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Skeleton width={80} height={10} radius={8} />
                    <div style={{ flex: 1 }}>
                      <Skeleton height={10} radius={8} />
                    </div>
                    <Skeleton width={42} height={10} radius={8} />
                  </div>
                ))}
              </div>
            )}
            {!loading && paymentsByMethod.length === 0 && <div style={{ padding: '10px 0', textAlign: 'center', fontFamily: F, color: MUTED, fontSize: 13 }}>Os mÃ©todos de pagamento aparecem aqui assim que houver vendas processadas.</div>}
          </div>
          <div style={{ background: 'white', borderRadius: 16, border: `1px solid ${BORDER}`, padding: '24px', boxShadow: '0 1px 4px rgba(2,27,91,.04)' }}>
            <p style={{ fontFamily: F, fontWeight: 700, fontSize: 15, color: TEXT, marginBottom: 14 }}>Assinaturas por status</p>
            {!loading &&
              subsByStatus
                .slice()
                .sort((a: any, b: any) => Number(b.count ?? 0) - Number(a.count ?? 0))
                .slice(0, 6)
                .map((r: any) => {
                  const st = String(r.status ?? 'unknown')
                  const count = Number(r.count ?? 0)
                  const width = Math.max(3, Math.round((count / maxSub) * 100))
                  return (
                    <div key={st} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                      <div style={{ width: 110, fontFamily: MONO, fontSize: 11.5, color: MUTED }}>{st}</div>
                      <div style={{ flex: 1, height: 10, borderRadius: 6, background: FAINT, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
                        <div style={{ width: `${width}%`, height: '100%', background: MINT_D }} />
                      </div>
                      <div style={{ width: 42, textAlign: 'right', fontFamily: MONO, fontSize: 11.5, color: TEXT }}>{count}</div>
                    </div>
                  )
                })}
            {loading && (
              <div className="cp-fade-in" style={{ display: 'grid', gap: 12, paddingTop: 6 }}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Skeleton width={110} height={10} radius={8} />
                    <div style={{ flex: 1 }}>
                      <Skeleton height={10} radius={8} />
                    </div>
                    <Skeleton width={42} height={10} radius={8} />
                  </div>
                ))}
              </div>
            )}
            {!loading && subsByStatus.length === 0 && <div style={{ padding: '10px 0', textAlign: 'center', fontFamily: F, color: MUTED, fontSize: 13 }}>Os status das assinaturas aparecerÃ£o aqui conforme a base recorrente ganhar volume.</div>}
          </div>
          <div style={{ background: 'white', borderRadius: 16, border: `1px solid ${BORDER}`, padding: '24px', boxShadow: '0 1px 4px rgba(2,27,91,.04)', display: 'flex', flexDirection: 'column' }}>
            <p style={{ fontFamily: F, fontWeight: 700, fontSize: 15, color: TEXT, marginBottom: 16 }}>Atividade recente</p>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {(!loading ? activity : []).map((tx) => (
                <div key={tx.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Avi name={tx.customer} size={32} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontFamily: F, fontWeight: 600, fontSize: 12.5, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.customer.split(' ')[0]}</p>
                    <p style={{ fontFamily: F, fontSize: 11, color: MUTED }}>{tx.method}</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontFamily: F, fontWeight: 700, fontSize: 12.5, color: TEXT }}>{fmtBRL(tx.value)}</p>
                    <Badge status={tx.status} />
                  </div>
                </div>
              ))}
            </div>
            {loading && (
              <div className="cp-fade-in" style={{ display: 'grid', gap: 12, padding: '8px 0' }}>
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 999, overflow: 'hidden' }}>
                      <Skeleton width="100%" height={32} radius={999} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <Skeleton height={10} radius={8} />
                      <div style={{ height: 6 }} />
                      <Skeleton height={9} radius={8} width="60%" />
                    </div>
                    <div style={{ width: 92 }}>
                      <Skeleton height={10} radius={8} />
                      <div style={{ height: 6 }} />
                      <Skeleton height={18} radius={10} width={70} />
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button onClick={() => router.push('/transacoes')} style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontFamily: F, fontWeight: 700, fontSize: 12.5, color: NAVY, background: 'none', border: 'none', cursor: 'pointer' }}>
              Ver todas <ChevronRight size={13} />
            </button>
          </div>
        </div>
      </div>
      <TableCard>
        <div style={{ padding: '18px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <p style={{ fontFamily: F, fontWeight: 700, fontSize: 15, color: TEXT }}>Ãšltimas transaÃ§Ãµes</p>
          <button onClick={() => router.push('/transacoes')} style={{ fontFamily: F, fontWeight: 700, fontSize: 12.5, color: NAVY, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
            Ver todas <ChevronRight size={12} />
          </button>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>{['ID', 'Cliente', 'Valor', 'MÃ©todo', 'Status', 'Data'].map((h) => <Th key={h}>{h}</Th>)}</tr>
          </thead>
          <tbody>
            {(!loading ? last : []).map((tx) => (
              <tr key={tx.id} style={{ transition: 'background .12s' }} onMouseEnter={(e) => (e.currentTarget.style.background = FAINT)} onMouseLeave={(e) => (e.currentTarget.style.background = '')}>
                <Td mono>{tx.id}</Td>
                <td style={{ padding: '13px 20px', borderBottom: `1px solid ${BORDER}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <Avi name={tx.customer} />
                    <span style={{ fontFamily: F, fontWeight: 600, fontSize: 13, color: TEXT }}>{tx.customer}</span>
                  </div>
                </td>
                <Td>
                  <span style={{ fontWeight: 700 }}>{fmtBRL(tx.value)}</span>
                </Td>
                <td style={{ padding: '13px 20px', borderBottom: `1px solid ${BORDER}` }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: F, fontSize: 12.5, color: MUTED }}>
                    {tx.method === 'PIX' ? <QrCode size={13} style={{ color: MINT_D }} /> : tx.method === 'CartÃ£o' ? <CreditCard size={13} style={{ color: NAVY }} /> : <FileText size={13} />}
                    {tx.method}
                  </span>
                </td>
                <td style={{ padding: '13px 20px', borderBottom: `1px solid ${BORDER}` }}>
                  <Badge status={tx.status} />
                </td>
                <Td>
                  <span style={{ color: MUTED }}>{tx.date}</span>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading ? (
          <TableSkeleton rows={4} cols={6} />
        ) : last.length === 0 ? (
          <EmptyState
            icon={<ArrowUpDown size={18} style={{ color: NAVY }} />}
            title="Nenhuma transaÃ§Ã£o encontrada"
            description="Quando houver movimentaÃ§Ã£o, as Ãºltimas transaÃ§Ãµes aparecerÃ£o aqui."
            primaryAction={{ label: 'Ir para TransaÃ§Ãµes', onClick: () => router.push('/transacoes') }}
          />
        ) : null}
      </TableCard>
    </div>
  )
}

export function TransactionsScreen() {
  const router = useRouter()
  const transactionStatusOptions = [
    { value: 'all', label: 'Todos' },
    { value: 'paid', label: 'Pago' },
    { value: 'created', label: 'Criada' },
    { value: 'pending', label: 'Pendente' },
    { value: 'processing', label: 'Processando' },
    { value: 'canceled', label: 'Cancelada' },
    { value: 'failed', label: 'Recusado' },
    { value: 'refunded', label: 'Estornado' },
  ] as const
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<(typeof transactionStatusOptions)[number]['value']>('all')
  const transactionsCacheKey = useMemo(() => `transactions:${statusFilter}:${search || ''}`, [search, statusFilter])
  const transactionsCacheSnapshot = useMemo(() => readScreenCacheSnapshot<{ rows: any[] }>(transactionsCacheKey), [transactionsCacheKey])
  const cachedTransactions = useMemo(() => readScreenCache<{ rows: any[] }>(transactionsCacheKey), [transactionsCacheKey])
  const [loading, setLoading] = useState(cachedTransactions == null)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<any[]>(cachedTransactions?.rows ?? [])
  const [menuTxId, setMenuTxId] = useState<string | null>(null)

  useEffect(() => {
    if (!menuTxId) return
    const onDoc = (ev: MouseEvent) => {
      const t = ev.target as HTMLElement | null
      if (!t) return
      const root = t.closest('[data-tx-menu-root]')
      if (!root) setMenuTxId(null)
    }
    document.addEventListener('click', onDoc)
    return () => document.removeEventListener('click', onDoc)
  }, [menuTxId])

  useEffect(() => {
    let t: any = null
    const run = async () => {
      const status = statusFilter === 'all' ? null : statusFilter

      const cached = readScreenCache<{ rows: any[] }>(transactionsCacheKey)
      if (cached) {
        setRows(cached.rows)
        setLoading(false)
      } else {
        setLoading(true)
      }
      setError(null)
      const remainingMs = transactionsCacheSnapshot?.expiresAt ? transactionsCacheSnapshot.expiresAt - Date.now() : 0
      if (cached && remainingMs > 30_000) return
      try {
        const qs = new URLSearchParams()
        if (search) qs.set('q', search)
        if (status) qs.set('status', status)
        const res = await fetch(`/api/transactions?${qs.toString()}`)
        const json = await res.json().catch(() => null)
        if (!res.ok) {
          setError(toUserFacingError(json?.error, 'Ocorreu um erro ao carregar transaÃ§Ãµes. Tente novamente.', '/api/transactions'))
          setRows([])
          return
        }
        const nextRows = Array.isArray(json?.transactions) ? json.transactions : []
        setRows(nextRows)
        writeScreenCache(transactionsCacheKey, { rows: nextRows })
      } catch (e) {
        logError('TransactionsScreen: fetch failed', e)
        setError(toUserFacingError(e instanceof Error ? e.message : String(e), 'Ocorreu um erro ao carregar transaÃ§Ãµes. Tente novamente.', '/api/transactions'))
        setRows([])
      } finally {
        setLoading(false)
      }
    }
    t = setTimeout(() => void run(), 250)
    return () => clearTimeout(t)
  }, [search, statusFilter, transactionsCacheKey, transactionsCacheSnapshot])

  const filtered = useMemo(() => {
    return rows.map((tx) => {
      const customer = tx.customer?.name ?? tx.customer?.email ?? 'â€”'
      const value = Number(tx.amount ?? 0)
      const methodLabel = tx.method === 'pix' ? 'PIX' : tx.method === 'card' ? 'CartÃ£o' : String(tx.method ?? 'â€”')
      const date = new Date(tx.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
      return { id: tx.id, customer, value, method: methodLabel, status: String(tx.status ?? 'created'), date }
    })
  }, [rows])
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ background: 'white', borderRadius: 14, border: `1px solid ${BORDER}`, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: MUTED }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por cliente ou ID..." style={{ width: '100%', paddingLeft: 36, paddingRight: 14, paddingTop: 9, paddingBottom: 9, fontFamily: F, fontSize: 13, background: FAINT, border: `1px solid ${BORDER}`, borderRadius: 9, outline: 'none', color: TEXT, boxSizing: 'border-box' }} />
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {transactionStatusOptions.map((option) => (
            <button key={option.value} onClick={() => setStatusFilter(option.value)} style={{ padding: '7px 13px', borderRadius: 8, fontFamily: F, fontWeight: 600, fontSize: 12.5, cursor: 'pointer', transition: 'all .15s', border: statusFilter === option.value ? 'none' : `1px solid ${BORDER}`, background: statusFilter === option.value ? NAVY : 'white', color: statusFilter === option.value ? 'white' : MUTED }}>
              {option.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => {
            const status = statusFilter === 'all' ? null : statusFilter
            const qs = new URLSearchParams()
            if (search) qs.set('q', search)
            if (status) qs.set('status', status)
            qs.set('format', 'csv')
            window.open(`/api/transactions?${qs.toString()}`, '_blank')
          }}
          style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, fontFamily: F, fontWeight: 600, fontSize: 12.5, color: MUTED, background: 'white', border: `1px solid ${BORDER}`, cursor: 'pointer' }}
        >
          <Download size={13} /> Exportar
        </button>
      </div>
      {error && <Notice>{error}</Notice>}
      <TableCard>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#FAFBFD' }}>{['ID', 'Cliente', 'Valor', 'Forma de pagamento', 'Status', 'Data', ''].map((h) => <Th key={h}>{h}</Th>)}</tr>
          </thead>
          <tbody>
            {filtered.map((tx) => (
              <tr key={tx.id} className="group" style={{ transition: 'background .12s' }} onMouseEnter={(e) => (e.currentTarget.style.background = FAINT)} onMouseLeave={(e) => (e.currentTarget.style.background = '')}>
                <Td mono>{tx.id}</Td>
                <td style={{ padding: '13px 20px', borderBottom: `1px solid ${BORDER}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <Avi name={tx.customer} />
                    <span style={{ fontFamily: F, fontWeight: 600, fontSize: 13, color: TEXT }}>{tx.customer}</span>
                  </div>
                </td>
                <Td>
                  <span style={{ fontWeight: 700 }}>{fmtBRL(tx.value)}</span>
                </Td>
                <td style={{ padding: '13px 20px', borderBottom: `1px solid ${BORDER}` }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: F, fontSize: 12.5, color: MUTED }}>
                    {tx.method === 'PIX' ? <QrCode size={13} style={{ color: MINT_D }} /> : tx.method === 'CartÃ£o' ? <CreditCard size={13} style={{ color: NAVY }} /> : <FileText size={13} />}
                    {tx.method}
                  </span>
                </td>
                <td style={{ padding: '13px 20px', borderBottom: `1px solid ${BORDER}` }}>
                  <Badge status={tx.status} />
                </td>
                <Td>
                  <span style={{ color: MUTED }}>{tx.date}</span>
                </Td>
                <td style={{ padding: '13px 20px', borderBottom: `1px solid ${BORDER}`, opacity: 0 }} className="group-hover:opacity-100">
                  <div data-tx-menu-root style={{ position: 'relative', display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => setMenuTxId((prev) => (prev === tx.id ? null : tx.id))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, padding: 4, borderRadius: 8 }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = FAINT)}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <MoreHorizontal size={15} />
                    </button>
                    {menuTxId === tx.id && (
                      <div
                        style={{
                          position: 'absolute',
                          right: 0,
                          top: 28,
                          background: 'white',
                          border: `1px solid ${BORDER}`,
                          borderRadius: 12,
                          boxShadow: '0 10px 30px rgba(0,0,0,.12)',
                          overflow: 'hidden',
                          minWidth: 180,
                          zIndex: 5,
                        }}
                      >
                        <button
                          onClick={() => {
                            setMenuTxId(null)
                            router.push(`/transacoes/${encodeURIComponent(tx.id)}`)
                          }}
                          style={{ width: '100%', textAlign: 'left', background: 'white', border: 'none', cursor: 'pointer', padding: '10px 12px', fontFamily: F, fontSize: 12.5, color: TEXT }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = FAINT)}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'white')}
                        >
                          Ver detalhes
                        </button>
                        <button
                          onClick={async () => {
                            setMenuTxId(null)
                            await copyWithFeedback(String(tx.id), 'ID da transaÃ§Ã£o copiado com sucesso.')
                          }}
                          style={{ width: '100%', textAlign: 'left', background: 'white', border: 'none', cursor: 'pointer', padding: '10px 12px', fontFamily: F, fontSize: 12.5, color: TEXT }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = FAINT)}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'white')}
                        >
                          Copiar ID
                        </button>
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading ? (
          <TableSkeleton rows={7} cols={7} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<ArrowUpDown size={18} style={{ color: NAVY }} />}
            title="Nenhuma transaÃ§Ã£o encontrada"
            description="As transaÃ§Ãµes aparecerÃ£o aqui quando seus clientes realizarem pagamentos. Se quiser, ajuste os filtros para revisar outro perÃ­odo."
            primaryAction={{ label: 'Limpar filtros', onClick: () => (setSearch(''), setStatusFilter('all')) }}
          />
        ) : null}
      </TableCard>
    </div>
  )
}

export function PaymentLinksScreen() {
  const router = useRouter()
  const cachedPaymentLinks = useMemo(() => readScreenCache<{ links: any[] }>('payment-links:list'), [])
  const [loading, setLoading] = useState(cachedPaymentLinks == null)
  const [error, setError] = useState<string | null>(null)
  const [links, setLinks] = useState<any[]>(cachedPaymentLinks?.links ?? [])
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null)
  const [splitCountByLink, setSplitCountByLink] = useState<Record<string, number>>({})
  const { openSplitDialog, splitDialog } = useSplitDialog({ setScreenError: setError, errorScope: 'PaymentLinksScreen' })

  const loadSplitRules = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch('/api/split-rules', { method: 'GET', signal, keepalive: true })
      const json = await res.json().catch(() => null)
      if (!res.ok) return
      const splitRules = Array.isArray(json?.splitRules) ? json.splitRules : []
      const nextCountByLink = splitRules.reduce((acc: Record<string, number>, rule: any) => {
        const paymentLinkId = typeof rule?.payment_link_id === 'string' ? String(rule.payment_link_id) : null
        if (!paymentLinkId || rule?.status === 'inactive') return acc
        acc[paymentLinkId] = (acc[paymentLinkId] ?? 0) + 1
        return acc
      }, {})
      setSplitCountByLink(nextCountByLink)
    } catch (e) {
      if (signal?.aborted || isAbortLikeError(e)) return
      logError('PaymentLinksScreen: /api/split-rules failed', e)
    }
  }, [])

  useEffect(() => {
    if (!copiedLinkId) return
    const timeout = window.setTimeout(() => setCopiedLinkId(null), 2000)
    return () => window.clearTimeout(timeout)
  }, [copiedLinkId])

  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false
    const screenPath = typeof window !== 'undefined' ? window.location.pathname : '/links-pagamento'
    const run = async () => {
      const cached = readScreenCache<{ links: any[] }>('payment-links:list')
      if (cached) {
        setLinks(cached.links)
        setLoading(false)
      } else {
        setLoading(true)
      }
      setError(null)
      const snapshot = readScreenCacheSnapshot<{ links: any[] }>('payment-links:list')
      const remainingMs = snapshot?.expiresAt ? snapshot.expiresAt - Date.now() : 0
      if (cached && remainingMs > 30_000) return
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const [res, splitRulesRes] = await Promise.all([
            fetch('/api/payment-links', { method: 'GET', signal: controller.signal, keepalive: true }),
            fetch('/api/split-rules', { method: 'GET', signal: controller.signal, keepalive: true }),
          ])
          const json = await res.json().catch(() => null)
          if (!res.ok) {
            logError('PaymentLinksScreen: /api/payment-links failed', { status: res.status, error: json?.error })
            if (!cancelled) {
              setError(toUserFacingError(json?.error, 'Ocorreu um erro ao carregar links. Tente novamente.', '/api/payment-links'))
            }
            return
          }
          const nextLinks = Array.isArray(json?.paymentLinks) ? json.paymentLinks : []
          if (!cancelled) {
            setLinks(nextLinks)
            writeScreenCache('payment-links:list', { links: nextLinks })
          }
          const splitRulesJson = await splitRulesRes.json().catch(() => null)
          if (!cancelled && splitRulesRes.ok) {
            const splitRules = Array.isArray(splitRulesJson?.splitRules) ? splitRulesJson.splitRules : []
            const nextCountByLink = splitRules.reduce((acc: Record<string, number>, rule: any) => {
              const paymentLinkId = typeof rule?.payment_link_id === 'string' ? String(rule.payment_link_id) : null
              if (!paymentLinkId || rule?.status === 'inactive') return acc
              acc[paymentLinkId] = (acc[paymentLinkId] ?? 0) + 1
              return acc
            }, {})
            setSplitCountByLink(nextCountByLink)
          }
          return
        } catch (e) {
          // In dev, HMR can unmount/remount the screen and abort in-flight GETs
          // shortly before React cleanup flips the local flags.
          await new Promise((resolve) => window.setTimeout(resolve, 50))
          const navigatedAway = typeof window !== 'undefined' && window.location.pathname !== screenPath
          if (cancelled || controller.signal.aborted || navigatedAway || isAbortLikeError(e)) return
          if (attempt === 0) {
            await new Promise((resolve) => window.setTimeout(resolve, 250))
            continue
          }
          logError('PaymentLinksScreen load failed', e)
          setError('Ocorreu um erro ao carregar links. Tente novamente.')
          return
        } finally {
          if (!cancelled) setLoading(false)
        }
      }
    }
    void run()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [])

  const totalLinks = links.length
  const receitaAcumulada = links.reduce((acc, l) => acc + Number(l.amount ?? 0), 0)

  const configureSplit = async (link: any) => {
    const didSave = await openSplitDialog({ paymentLinkId: String(link.id) })
    if (didSave) {
      setError(null)
      await loadSplitRules()
      router.refresh()
    }
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 12 }}>
          {[
            { l: 'Total de links', v: loading ? 'â€”' : totalLinks.toLocaleString('pt-BR') },
            { l: 'Receita acumulada', v: loading ? 'â€”' : fmtBRL(receitaAcumulada) },
          ].map(({ l, v }) => (
            <div key={l} style={{ background: 'white', borderRadius: 12, border: `1px solid ${BORDER}`, padding: '12px 18px' }}>
              <p style={{ fontFamily: F, fontSize: 11, color: MUTED }}>{l}</p>
              <p style={{ fontFamily: F, fontWeight: 800, fontSize: 17, color: TEXT }}>{v}</p>
            </div>
          ))}
        </div>
        <Link
          href="/links-pagamento/novo"
          prefetch={false}
          className="flex items-center gap-2"
          style={{
            background: MINT,
            color: NAVY,
            fontFamily: F,
            fontWeight: 700,
            fontSize: 14,
            padding: '10px 18px',
            borderRadius: 10,
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 2px 12px rgba(57,240,174,.28)',
            transition: 'background .15s',
            textDecoration: 'none',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = MINT_D
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = MINT
          }}
        >
          <Plus size={15} /> Novo link
        </Link>
      </div>
      {error && <Notice>{error}</Notice>}
      <TableCard>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#FAFBFD' }}>{['Produto', 'Valor', 'Tipo', 'CobranÃ§as', 'Status', 'AÃ§Ãµes'].map((h) => <Th key={h}>{h}</Th>)}</tr>
          </thead>
          <tbody>
            {(!loading ? links : []).map((link) => {
              const isCopied = copiedLinkId === String(link.id)
              const configuredSplitCount = splitCountByLink[String(link.id)] ?? 0
              const hasConfiguredSplit = configuredSplitCount > 0
              return (
              <tr key={link.id} className="group" style={{ transition: 'background .12s' }} onMouseEnter={(e) => (e.currentTarget.style.background = FAINT)} onMouseLeave={(e) => (e.currentTarget.style.background = '')}>
                <td style={{ padding: '14px 20px', borderBottom: `1px solid ${BORDER}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: NAVY, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Link2 size={15} style={{ color: MINT }} />
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <p style={{ fontFamily: F, fontWeight: 700, fontSize: 13.5, color: TEXT }}>{link.name}</p>
                        {hasConfiguredSplit ? (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              background: '#ECFDF5',
                              border: '1px solid #A7F3D0',
                              color: '#047857',
                              borderRadius: 999,
                              padding: '3px 8px',
                              fontFamily: F,
                              fontSize: 11,
                              fontWeight: 800,
                            }}
                          >
                            Split configurado
                          </span>
                        ) : null}
                      </div>
                      <p style={{ fontFamily: MONO, fontSize: 11, color: MUTED }}>{`${typeof window !== 'undefined' ? window.location.host : 'connektpay.com.br'}/checkout?slug=${link.slug}`}</p>
                    </div>
                  </div>
                </td>
                <Td>
                  <span style={{ fontWeight: 700 }}>{fmtBRL(Number(link.amount ?? 0))}</span>
                </Td>
                <td style={{ padding: '14px 20px', borderBottom: `1px solid ${BORDER}` }}>
                  <span style={{ fontFamily: F, fontWeight: 600, fontSize: 12, padding: '4px 10px', borderRadius: 6, background: link.type === 'recurring' ? '#EEF2FF' : '#F0F9FF', color: link.type === 'recurring' ? '#4F46E5' : '#0369A1' }}>
                    {link.type === 'recurring' ? 'Recorrente' : 'Ãšnico'}
                  </span>
                </td>
                <Td>
                  <span style={{ fontWeight: 700 }}>â€”</span>
                </Td>
                <td style={{ padding: '14px 20px', borderBottom: `1px solid ${BORDER}` }}>
                  <Badge status={link.status === 'active' ? 'Ativo' : link.status} />
                </td>
                <td style={{ padding: '14px 20px', borderBottom: `1px solid ${BORDER}` }}>
                  <div style={{ display: 'flex', gap: 4, opacity: isCopied ? 1 : 0 }} className="group-hover:opacity-100">
                    <button aria-label="Visualizar link" onClick={() => router.push(`/checkout?slug=${link.slug}`)} style={{ padding: '5px 7px', borderRadius: 6, background: FAINT, border: 'none', cursor: 'pointer', color: MUTED }}>
                      <Eye size={13} />
                    </button>
                    <button
                      aria-label={isCopied ? 'Copiado' : 'Copiar URL'}
                      onClick={async () => {
                        const url = `${window.location.origin}/checkout?slug=${link.slug}`
                        const copied = await copyWithFeedback(url, 'Link copiado com sucesso.', 'NÃ£o foi possÃ­vel copiar automaticamente. Copie manualmente.')
                        if (copied) setCopiedLinkId(String(link.id))
                      }}
                      style={{
                        padding: '5px 9px',
                        borderRadius: 8,
                        background: isCopied ? '#DCFCE7' : FAINT,
                        border: isCopied ? '1px solid #BBF7D0' : 'none',
                        cursor: 'pointer',
                        color: isCopied ? '#166534' : MUTED,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        fontFamily: F,
                        fontSize: 11.5,
                        fontWeight: 700,
                        transition: 'background .15s, color .15s, border-color .15s',
                      }}
                    >
                      <Copy size={13} />
                      {isCopied ? 'Copiado' : 'Copiar'}
                    </button>
                    <button
                      aria-label={hasConfiguredSplit ? 'Editar split' : 'Configurar split'}
                      onClick={() => void configureSplit(link)}
                      style={{
                        padding: '5px 7px',
                        borderRadius: 6,
                        background: hasConfiguredSplit ? '#ECFDF5' : FAINT,
                        border: hasConfiguredSplit ? '1px solid #A7F3D0' : 'none',
                        cursor: 'pointer',
                        color: hasConfiguredSplit ? '#047857' : MUTED,
                      }}
                    >
                      <MoreHorizontal size={13} />
                    </button>
                  </div>
                </td>
              </tr>
              )
            })}
          </tbody>
        </table>
        {loading ? (
          <TableSkeleton rows={6} cols={6} />
        ) : links.length === 0 ? (
          <EmptyState
            icon={<Link2 size={18} style={{ color: NAVY }} />}
            title="Nenhum link de pagamento encontrado"
            description="VocÃª ainda nÃ£o criou nenhum link de pagamento. Crie seu primeiro link para comeÃ§ar a cobrar e depois teste o checkout."
            primaryAction={{ label: 'Criar link', onClick: () => router.push('/links-pagamento/novo') }}
          />
        ) : null}
      </TableCard>
      {splitDialog}
    </div>
  )
}

export function CreateLinkScreen() {
  const router = useRouter()
  const { confirm, confirmDialog } = useConfirmDialog()
  const [pix, setPix] = useState(true)
  const [card, setCard] = useState(true)
  const [inst, setInst] = useState('12x sem juros')
  const [billingType, setBillingType] = useState<'one_time' | 'recurring'>('one_time')
  const [interval, setInterval] = useState<'monthly' | 'weekly' | 'yearly'>('monthly')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [amountBRL, setAmountBRL] = useState('')
  const [productImageUrl, setProductImageUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createAttempts, setCreateAttempts] = useState(0)
  const { openSplitDialog, splitDialog } = useSplitDialog({ setScreenError: setError, errorScope: 'NewPaymentLinkScreen' })
  const productImageInputRef = useRef<HTMLInputElement | null>(null)
  const inp: React.CSSProperties = { width: '100%', background: FAINT, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '11px 14px', fontFamily: F, fontSize: 13.5, color: TEXT, outline: 'none', boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { fontFamily: F, fontWeight: 600, fontSize: 12, color: NAVY, display: 'block', marginBottom: 6 }
  const box: React.CSSProperties = { background: 'white', borderRadius: 16, border: `1px solid ${BORDER}`, padding: '28px', boxShadow: '0 1px 4px rgba(2,27,91,.04)' }
  useEffect(() => {
    const typeParam = new URLSearchParams(window.location.search).get('type')
    if (typeParam === 'recurring') setBillingType('recurring')
  }, [])

  useEffect(() => {
    if (billingType !== 'recurring') return
    setPix(false)
    setCard(true)
    setInst('1x (à vista)')
  }, [billingType])

  const handleProductImageSelection = async (file: File | null | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Selecione uma imagem PNG, JPG, WEBP ou GIF.')
      emitAppToast({ tone: 'warning', title: 'Arquivo inválido', message: 'Selecione uma imagem compatível para o produto.' })
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('A imagem do produto deve ter no máximo 5 MB.')
      emitAppToast({ tone: 'warning', title: 'Imagem muito grande', message: 'Escolha um arquivo com até 5 MB.' })
      return
    }
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
        reader.onerror = () => reject(new Error('reader_failed'))
        reader.readAsDataURL(file)
      })
      if (!dataUrl) throw new Error('empty_image')
      setProductImageUrl(dataUrl)
      setError(null)
      emitAppToast({ tone: 'success', title: 'Imagem pronta', message: 'A imagem foi vinculada ao link de pagamento.' })
    } catch (e) {
      logError('CreateLinkScreen product image failed', e)
      setError('Não foi possível processar a imagem do produto.')
      emitAppToast({ tone: 'error', title: 'Imagem indisponível', message: 'Não foi possível processar a imagem do produto.' })
    }
  }

  const amountCents = amountBRL ? Number(onlyDigits(amountBRL)) : 0
  const maxInstallments = Number(inst.split('x')[0]) || 1
  const installmentSim = (n: number) => {
    const bps = 290 + Math.max(0, n - 1) * 60
    const feeCents = Math.round((amountCents * bps) / 10_000) + 39 * n
    const totalCents = Math.max(0, amountCents + feeCents)
    const per = Math.max(0, Math.round(totalCents / n))
    return { n, feeCents, totalCents, perCents: per }
  }

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={box}>
        <p style={{ fontFamily: F, fontWeight: 700, fontSize: 16, color: TEXT, marginBottom: 20 }}>Informações do produto</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={lbl}>Nome do produto</label>
            <input type="text" placeholder="Ex: Consultoria Premium" value={name} onChange={(e) => setName(e.target.value)} style={inp} />
            <p style={{ fontFamily: F, fontSize: 11.5, color: MUTED, marginTop: 6 }}>Use um nome simples para o cliente reconhecer facilmente esta cobrança.</p>
          </div>
          <div>
            <label style={lbl}>Descrição</label>
            <textarea rows={3} placeholder="Descreva o que está sendo oferecido..." value={description} onChange={(e) => setDescription(e.target.value)} style={{ ...inp, resize: 'none', lineHeight: 1.6 }} />
            <p style={{ fontFamily: F, fontSize: 11.5, color: MUTED, marginTop: 6 }}>Explique em poucas palavras o que o cliente está comprando.</p>
          </div>
          <div>
            <label style={lbl}>Valor (R$)</label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontFamily: F, fontWeight: 700, fontSize: 13.5, color: MUTED }}>R$</span>
              <input type="text" placeholder="0,00" value={amountBRL} onChange={(e) => setAmountBRL(maskBRLInput(e.target.value))} style={{ ...inp, paddingLeft: 42, fontWeight: 700 }} />
            </div>
            <p style={{ fontFamily: F, fontSize: 11.5, color: MUTED, marginTop: 6 }}>Informe o valor final que será cobrado do cliente.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={lbl}>Tipo de cobrança</label>
              <select
                value={billingType}
                onChange={(e) => setBillingType(e.target.value as any)}
                style={{ ...inp, cursor: 'pointer' }}
              >
                <option value="one_time">Avulsa</option>
                <option value="recurring">Recorrente</option>
              </select>
              <p style={{ fontFamily: F, fontSize: 11.5, color: MUTED, marginTop: 8 }}>
                {billingType === 'recurring'
                  ? 'A recorrência usa checkout interno, cartão obrigatório e 1 parcela por ciclo.'
                  : 'Use cobrança recorrente para criar uma assinatura com renovação automática.'}
              </p>
            </div>
            <div>
              <label style={lbl}>Periodicidade</label>
              <select value={interval} onChange={(e) => setInterval(e.target.value as any)} disabled={billingType !== 'recurring'} style={{ ...inp, cursor: billingType === 'recurring' ? 'pointer' : 'default', opacity: billingType === 'recurring' ? 1 : 0.6 }}>
                <option value="monthly">Mensal</option>
                <option value="weekly">Semanal</option>
                <option value="yearly">Anual</option>
              </select>
            </div>
          </div>
          <div>
            <label style={lbl}>Imagem do produto</label>
            <input
              ref={productImageInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
              style={{ display: 'none' }}
              onChange={(e) => void handleProductImageSelection(e.target.files?.[0])}
            />
            <div
              role="button"
              tabIndex={0}
              style={{ border: `2px dashed ${BORDER}`, borderRadius: 12, padding: '20px', textAlign: 'center', cursor: 'pointer', transition: 'border-color .2s', display: 'grid', gap: 12 }}
              onClick={() => productImageInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  productImageInputRef.current?.click()
                }
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                void handleProductImageSelection(e.dataTransfer.files?.[0])
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = MINT)}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'rgba(2,27,91,0.08)')}
            >
              {productImageUrl ? (
                <img src={productImageUrl} alt="Prévia do produto" style={{ width: '100%', maxHeight: 180, objectFit: 'cover', borderRadius: 12, border: `1px solid ${BORDER}` }} />
              ) : (
                <div>
                  <Upload size={20} style={{ color: MUTED, margin: '0 auto 8px' }} />
                  <p style={{ fontFamily: F, fontSize: 13, color: MUTED }}>Clique para enviar ou arraste aqui</p>
                  <p style={{ fontFamily: F, fontSize: 11, color: '#CBD5E1', marginTop: 4 }}>PNG, JPG, WEBP ou GIF até 5MB</p>
                </div>
              )}
              {productImageUrl ? (
                <div style={{ display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <GhostBtn onClick={() => productImageInputRef.current?.click()}>
                    <Upload size={13} /> Trocar imagem
                  </GhostBtn>
                  <GhostBtn
                    onClick={() => {
                      setProductImageUrl('')
                      setError(null)
                    }}
                  >
                    Remover
                  </GhostBtn>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
      <div style={box}>
        <p style={{ fontFamily: F, fontWeight: 700, fontSize: 16, color: TEXT, marginBottom: 20 }}>Métodos de pagamento</p>
        <div style={{ marginBottom: 16 }}>
          <label style={lbl}>Parcelamento máximo</label>
          <select value={inst} onChange={(e) => setInst(e.target.value)} disabled={billingType === 'recurring'} style={{ ...inp, cursor: billingType === 'recurring' ? 'default' : 'pointer', opacity: billingType === 'recurring' ? 0.6 : 1 }}>
            {['1x (à vista)', '2x sem juros', '3x sem juros', '6x sem juros', '12x sem juros'].map((v) => <option key={v}>{v}</option>)}
          </select>
        </div>
        {card && amountCents > 0 && (
          <div style={{ background: FAINT, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14, marginBottom: 12 }}>
            <p style={{ fontFamily: F, fontWeight: 800, fontSize: 12.5, color: TEXT, marginBottom: 8 }}>Simulação de parcelamento (Cartão)</p>
            <div style={{ display: 'grid', gap: 8 }}>
              {Array.from({ length: Math.max(1, Math.min(12, maxInstallments)) }).map((_, idx) => {
                const n = idx + 1
                const s = installmentSim(n)
                return (
                  <div key={n} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: 'white', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 12px' }}>
                    <div style={{ fontFamily: F, fontWeight: 800, color: NAVY, fontSize: 12.5 }}>{n === 1 ? '1x (à vista)' : `${n}x`}</div>
                    <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                      <div style={{ fontFamily: F, fontWeight: 800, color: TEXT, fontSize: 13 }}>{`${n}x de ${fmtBRL(s.perCents)}`}</div>
                      <div style={{ fontFamily: F, fontSize: 11.5, color: MUTED }}>{`Taxa (simulada): ${fmtBRL(s.feeCents)} · Total: ${fmtBRL(s.totalCents)}`}</div>
                    </div>
                  </div>
                )
              })}
            </div>
            <p style={{ fontFamily: F, fontSize: 11.5, color: MUTED, marginTop: 10 }}>
              {billingType === 'recurring'
                ? 'Na recorrência, a cobrança é feita exclusivamente no cartão e em uma parcela por ciclo.'
                : 'Taxa estimada, valor por parcela e total exibidos abaixo são simulações.'}
            </p>
          </div>
        )}
        {[
          { icon: QrCode, label: 'PIX', desc: 'Pagamento instantâneo, sem taxas', st: pix, fn: setPix, c: MINT_D },
          { icon: CreditCard, label: 'Cartão de crédito', desc: `Até ${inst}`, st: card, fn: setCard, c: NAVY },
        ].map(({ icon: Icon, label, desc, st, fn, c }) => {
          const disabled = billingType === 'recurring'
          return (
          <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 0', borderTop: `1px solid ${BORDER}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: FAINT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={16} style={{ color: c }} />
              </div>
              <div>
                <p style={{ fontFamily: F, fontWeight: 600, fontSize: 13.5, color: TEXT }}>{label}</p>
                <p style={{ fontFamily: F, fontSize: 11.5, color: MUTED }}>
                  {billingType === 'recurring' ? (label === 'PIX' ? 'PIX indisponível em cobranças recorrentes.' : 'Cartão obrigatório em cobranças recorrentes.') : desc}
                </p>
              </div>
            </div>
            <div style={{ opacity: disabled ? 0.55 : 1 }}>
              <Toggle on={billingType === 'recurring' ? label !== 'PIX' : st} set={disabled ? () => undefined : fn} />
            </div>
          </div>
          )
        })}
      </div>
      {error && <Notice>{error}</Notice>}
      <div style={{ display: 'flex', gap: 12 }}>
        <button onClick={() => router.push('/links-pagamento')} style={{ flex: 1, padding: '13px', borderRadius: 11, fontFamily: F, fontWeight: 700, fontSize: 14, color: MUTED, background: 'white', border: `1px solid ${BORDER}`, cursor: 'pointer' }}>
          Cancelar
        </button>
        <button
          disabled={loading}
          data-create-link-attempts={String(createAttempts)}
          onClick={async () => {
            setCreateAttempts((count) => count + 1)
            setError(null)
            if (!name || !amountBRL) {
              setError('Informe nome e valor do produto.')
              emitAppToast({ tone: 'warning', title: 'Campos obrigatÃ³rios', message: 'Preencha nome e valor do produto para continuar.' })
              return
            }
            setLoading(true)
            try {
              const res = await fetch('/api/payment-links', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                  name,
                  description,
                  amountBRL,
                  pix,
                  card,
                  maxInstallments,
                  type: billingType,
                  interval,
                  imageUrl: productImageUrl || undefined,
                }),
              })
              const json = await res.json().catch(() => null)
              if (!res.ok) {
                logError('NewPaymentLinkScreen: create link failed', { status: res.status, error: json?.error })
                setError(toUserFacingError(json?.error, 'Ocorreu um erro ao criar o link. Tente novamente.', '/api/payment-links'))
                return
              }
              emitAppToast({ tone: 'success', title: 'Link criado', message: 'Seu link foi criado com sucesso. Agora vocÃª jÃ¡ pode testar o checkout.' })
              const createdLink = json?.paymentLink
              if (createdLink?.id && (await confirm({ title: 'Configurar split agora?', description: 'VocÃª pode fazer isso depois em Links de Pagamento.', confirmLabel: 'Configurar', danger: false }))) {
                await openSplitDialog({ paymentLinkId: String(createdLink.id) })
              }
              const slug = json?.paymentLink?.slug
              if (!slug) {
                setError('Link criado, mas nÃ£o foi possÃ­vel obter o slug.')
                emitAppToast({ tone: 'warning', title: 'Link criado', message: 'O link foi criado, mas a URL final ainda nÃ£o pÃ´de ser exibida.' })
                return
              }
              router.push(`/checkout?slug=${slug}`)
            } finally {
              setLoading(false)
            }
          }}
          style={{ flex: 1, padding: '13px', borderRadius: 11, fontFamily: F, fontWeight: 800, fontSize: 14, color: NAVY, background: MINT, border: 'none', cursor: loading ? 'default' : 'pointer', boxShadow: `0 4px 16px ${MINT}40`, transition: 'background .15s', opacity: loading ? 0.75 : 1 }}
          onMouseEnter={(e) => {
            if (!loading) e.currentTarget.style.background = MINT_D
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = MINT
          }}
        >
          {loading ? 'Gerando...' : 'Gerar Link de Pagamento'}
        </button>
      </div>
      {confirmDialog}
      {splitDialog}
    </div>
  )
}

export function CheckoutScreen() {
  const router = useRouter()
  const pixPollFailuresRef = useRef(0)
  const [slug, setSlug] = useState<string | null>(null)
  const [method, setMethod] = useState<'pix' | 'card'>('pix')
  const [paid, setPaid] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pixPollingError, setPixPollingError] = useState<string | null>(null)
  const [link, setLink] = useState<any | null>(null)
  const [pixCopy, setPixCopy] = useState<string | null>(null)
  const [transactionId, setTransactionId] = useState<string | null>(null)
  const [transactionToken, setTransactionToken] = useState<string | null>(null)
  const [subscriptionId, setSubscriptionId] = useState<string | null>(null)
  const [customerName, setCustomerName] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerDoc, setCustomerDoc] = useState('')
  const [cardName, setCardName] = useState('')
  const [cardNumber, setCardNumber] = useState('')
  const [cardExp, setCardExp] = useState('')
  const [cardCvv, setCardCvv] = useState('')
  const [installments, setInstallments] = useState('1')
  const [pixStatus, setPixStatus] = useState<string | null>(null)
  const [pixQrCode, setPixQrCode] = useState<string | null>(null)
  const [pixQrCodeUrl, setPixQrCodeUrl] = useState<string | null>(null)
  const [pixQrCodeBase64, setPixQrCodeBase64] = useState<string | null>(null)
  const [pixQrImageSrc, setPixQrImageSrc] = useState<string | null>(null)
  const [pixExpiresAt, setPixExpiresAt] = useState<string | null>(null)
  const inp: React.CSSProperties = { width: '100%', background: FAINT, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '11px 14px', fontFamily: F, fontSize: 13.5, color: TEXT, outline: 'none', boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { fontFamily: F, fontWeight: 600, fontSize: 12, color: NAVY, display: 'block', marginBottom: 6 }
  const isRecurring = String(link?.type ?? 'one_time') === 'recurring'
  const allowPix = !isRecurring && link?.methods?.pix !== false
  const allowCard = link?.methods?.card !== false
  const legacyHostedCheckoutUrl = !isRecurring && typeof link?.provider_url === 'string' ? link.provider_url.trim() : ''
  const hasLegacyHostedReference = !isRecurring && Boolean(legacyHostedCheckoutUrl)
  const checkoutProviderId = normalizeProviderId(typeof link?.metadata?.provider_id === 'string' ? link.metadata.provider_id : null)
  const checkoutProviderName = checkoutProviderId ? getProviderLabel(checkoutProviderId) : 'provedor financeiro'
  const requiresPagarMeCardTokenization = checkoutProviderId === 'pagarme' && method === 'card'
  const productImageUrl = typeof link?.metadata?.image_url === 'string' ? link.metadata.image_url.trim() : ''
  const amountCents = Math.max(0, Number(link?.amount ?? 0))
  const maxInstallments = Math.max(1, Number(link?.max_installments ?? 1))
  const selectedInstallments = Math.max(1, Math.min(maxInstallments, Number(installments) || 1))
  const pixExpiresLabel = pixExpiresAt
    ? (() => {
        const dt = new Date(pixExpiresAt)
        return Number.isNaN(dt.getTime()) ? null : dt.toLocaleString('pt-BR')
      })()
    : null
  const pixStatusLabel =
    pixStatus === 'paid'
      ? 'Pagamento confirmado'
      : pixStatus === 'failed'
        ? 'Falha no pagamento'
        : pixStatus === 'canceled'
          ? 'Pagamento cancelado'
          : pixStatus === 'expired'
            ? 'PIX expirado'
            : transactionId
              ? 'Aguardando pagamento'
              : 'Aguardando geração da cobrança'

  const installmentSim = (n: number) => {
    const bps = 290 + Math.max(0, n - 1) * 60
    const feeCents = Math.round((amountCents * bps) / 10_000) + 39 * n
    const totalCents = Math.max(0, amountCents + feeCents)
    const perCents = Math.max(0, Math.round(totalCents / n))
    return { n, bps, feeCents, totalCents, perCents }
  }

  const cardSim = !isRecurring && method === 'card' && amountCents > 0 ? installmentSim(selectedInstallments) : null
  useEffect(() => {
    setSlug(new URLSearchParams(window.location.search).get('slug'))
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false
    const screenPath = typeof window !== 'undefined' ? window.location.pathname : '/checkout'
    const slugAtStart = slug
    const run = async () => {
      if (!slugAtStart) return
      setError(null)
      setLoading(true)
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const res = await fetch(`/api/payment-links?slug=${encodeURIComponent(slugAtStart)}`, {
            signal: controller.signal,
            keepalive: true,
          })
          const json = await res.json().catch(() => null)
          if (!res.ok) {
            setError(toUserFacingError(json?.error, 'Link indisponÃ­vel no momento. Verifique o endereÃ§o e tente novamente.', '/api/payment-links'))
            return
          }
          if (cancelled) return
          setLink(json?.paymentLink ?? null)
          const methods = json?.paymentLink?.methods ?? {}
          const type = String(json?.paymentLink?.type ?? 'one_time')
          if (type === 'recurring') {
            setMethod('card')
          } else if (methods?.pix === false && methods?.card !== false) {
            setMethod('card')
          }
          return
        } catch (e) {
          const navigatedAway =
            typeof window !== 'undefined' &&
            (window.location.pathname !== screenPath || new URLSearchParams(window.location.search).get('slug') !== slugAtStart)
          if (cancelled || controller.signal.aborted || navigatedAway || isAbortLikeError(e)) return
          if (attempt === 0) {
            await new Promise((resolve) => window.setTimeout(resolve, 250))
            continue
          }
          setError('Link indisponÃ­vel no momento. Verifique o endereÃ§o e tente novamente.')
          return
        } finally {
          if (!cancelled) setLoading(false)
        }
      }
    }
    void run()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [slug])

  useEffect(() => {
    if (!transactionId) {
      pixPollFailuresRef.current = 0
      setPixPollingError(null)
      setPixStatus(null)
      return
    }
    let active = true
    let timer: ReturnType<typeof setInterval> | null = null
    const poll = async () => {
      if (!active) return
      try {
        const qp = new URLSearchParams({ transactionId })
        if (transactionToken) qp.set('token', transactionToken)
        const res = await fetch(`/api/transactions?${qp.toString()}`)
        const json = await res.json().catch(() => null)
        if (!res.ok) {
          pixPollFailuresRef.current += 1
          if (pixPollFailuresRef.current >= 2) {
            setPixPollingError('Não foi possível atualizar o status do PIX em tempo real. Você pode aguardar alguns instantes ou recarregar a página.')
          }
          return
        }
        pixPollFailuresRef.current = 0
        setPixPollingError(null)
        const st = json?.transaction?.status
        const qrCode = json?.transaction?.pixQrCode
        const qrCodeUrl = json?.transaction?.pixQrCodeUrl
        const qrCodeBase64 = json?.transaction?.pixQrCodeBase64
        const copyPaste = json?.transaction?.pixCopyPaste
        const expiresAt = json?.transaction?.pixExpiresAt
        if (typeof st === 'string' && st) setPixStatus(st)
        if (typeof qrCode === 'string' && qrCode) setPixQrCode(qrCode)
        if (typeof qrCodeUrl === 'string' && qrCodeUrl) setPixQrCodeUrl(qrCodeUrl)
        if (typeof qrCodeBase64 === 'string' && qrCodeBase64) setPixQrCodeBase64(qrCodeBase64)
        if (typeof copyPaste === 'string' && copyPaste) setPixCopy(copyPaste)
        if (typeof expiresAt === 'string' && expiresAt) setPixExpiresAt(expiresAt)
        if (st === 'paid') setPaid(true)
        if (st === 'paid' || st === 'failed' || st === 'canceled' || st === 'expired') {
          active = false
          if (timer) clearInterval(timer)
        }
      } catch (e) {
        if (isAbortLikeError(e)) return
        pixPollFailuresRef.current += 1
        if (pixPollFailuresRef.current >= 2) {
          setPixPollingError('Não foi possível atualizar o status do PIX em tempo real. Você pode aguardar alguns instantes ou recarregar a página.')
        }
      }
    }
    timer = setInterval(() => void poll(), 2500)
    void poll()
    return () => {
      active = false
      if (timer) clearInterval(timer)
    }
  }, [transactionId, transactionToken])
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (pixQrCodeUrl) {
        setPixQrImageSrc(pixQrCodeUrl)
        return
      }
      if (pixQrCodeBase64) {
        setPixQrImageSrc(
          pixQrCodeBase64.startsWith('data:')
            ? pixQrCodeBase64
            : `data:image/png;base64,${pixQrCodeBase64.replace(/^data:image\/png;base64,/, '')}`,
        )
        return
      }
      if (pixQrCode) {
        try {
          const dataUrl = await QRCode.toDataURL(pixQrCode, { margin: 1, width: 256 })
          if (!cancelled) setPixQrImageSrc(dataUrl)
          return
        } catch (e) {
          logError('CheckoutPublic: QR fallback generation failed', e)
        }
      }
      if (!cancelled) setPixQrImageSrc(null)
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [pixQrCode, pixQrCodeBase64, pixQrCodeUrl])
  if (paid)
    return (
      <div style={{ minHeight: '100vh', background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: F }}>
        <div style={{ background: 'white', borderRadius: 24, border: `1px solid ${BORDER}`, boxShadow: '0 8px 40px rgba(2,27,91,.1)', padding: '52px 44px', maxWidth: 400, width: '100%', textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: `${MINT}18`, border: `2px solid ${MINT}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <CheckCircle2 size={30} style={{ color: MINT_D }} />
          </div>
          <h2 style={{ fontWeight: 800, fontSize: 22, color: TEXT, marginBottom: 8, letterSpacing: '-0.02em' }}>{subscriptionId ? 'Assinatura criada!' : 'Pagamento confirmado!'}</h2>
          <p style={{ color: MUTED, fontSize: 13.5, lineHeight: 1.7, marginBottom: 28 }}>
            {subscriptionId ? 'Sua assinatura estÃ¡ ativa e as prÃ³ximas cobranÃ§as serÃ£o automÃ¡ticas.' : 'Sua compra foi processada com sucesso.'}
          </p>
          <button
            onClick={() => {
              setPaid(false)
              const qs = new URLSearchParams()
              if (slug) qs.set('slug', slug)
              if (transactionId) qs.set('transactionId', transactionId)
              if (subscriptionId) qs.set('subscriptionId', subscriptionId)
              router.push(`/checkout/success?${qs.toString()}`)
            }}
            style={{ width: '100%', padding: '13px', background: MINT, color: NAVY, fontFamily: F, fontWeight: 800, fontSize: 14.5, borderRadius: 11, border: 'none', cursor: 'pointer', boxShadow: `0 4px 16px ${MINT}40` }}
          >
            Voltar ao inÃ­cio
          </button>
        </div>
      </div>
    )
  return (
    <div style={{ minHeight: '100vh', display: 'flex', fontFamily: F, background: 'white' }}>
      <div style={{ width: 440, background: NAVY, padding: '52px 48px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flexShrink: 0 }}>
        <WordMark dark />
        <div>
          <div style={{ width: '100%', aspectRatio: '16/9', borderRadius: 16, background: 'rgba(57,240,174,.08)', border: `1px solid ${MINT}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 28, overflow: 'hidden' }}>
            {productImageUrl ? (
              <img src={productImageUrl} alt={link?.name ?? 'Produto'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{ textAlign: 'center' }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: `${MINT}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px' }}>
                  <Zap size={22} style={{ color: MINT }} />
                </div>
                <p style={{ color: 'rgba(255,255,255,.25)', fontSize: 11 }}>Imagem do produto</p>
              </div>
            )}
          </div>
          <p style={{ color: 'rgba(255,255,255,.4)', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Produto</p>
          <h2 style={{ color: 'white', fontWeight: 800, fontSize: 26, letterSpacing: '-0.02em', marginBottom: 10 }}>{link?.name ?? 'Pagamento'}</h2>
          <p style={{ color: 'rgba(255,255,255,.42)', fontSize: 13.5, lineHeight: 1.7, marginBottom: 32 }}>{link?.description ?? 'Finalize sua compra com seguranÃ§a.'}</p>
          <div style={{ background: 'rgba(255,255,255,.05)', borderRadius: 14, padding: '20px 22px' }}>
            <p style={{ color: 'rgba(255,255,255,.4)', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>Total</p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
              <span style={{ color: 'white', fontSize: 48, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1 }}>{fmtBRL(Number(link?.amount ?? 0)).replace('R$', '').trim()}</span>
            </div>
            <p style={{ color: 'rgba(255,255,255,.28)', fontSize: 12, marginTop: 4 }}>
              {link?.max_installments ? `ou em atÃ© ${link.max_installments}x` : 'Pagamento Ã  vista'}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'rgba(255,255,255,.2)' }}>
          <Shield size={13} />
          <p style={{ fontSize: 12 }}>Pagamento seguro Â· SSL Â· PCI-DSS</p>
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48, background: BG }}>
        <div style={{ width: '100%', maxWidth: 440, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <h2 style={{ fontWeight: 800, fontSize: 22, color: TEXT, letterSpacing: '-0.02em', marginBottom: 4 }}>Finalizar pagamento</h2>
            <p style={{ color: MUTED, fontSize: 13.5 }}>
              Escolha sua forma de pagamento preferida
            </p>
          </div>
          {error && <Notice>{error}</Notice>}
          {hasLegacyHostedReference ? (
            <Notice tone="info">
              {`Este link possui uma referência legada de checkout hospedado em ${checkoutProviderName}, mas o pagamento agora permanece integralmente no checkout da Connekt Pay.`}
            </Notice>
          ) : null}
          <>
            <div style={{ background: 'white', borderRadius: 13, border: `1px solid ${BORDER}`, padding: 4, display: 'flex' }}>
              {[
                ...(allowPix ? [{ id: 'pix' as const, label: 'PIX', icon: QrCode }] : []),
                ...(allowCard ? [{ id: 'card' as const, label: isRecurring ? 'CartÃ£o (assinatura)' : 'CartÃ£o de crÃ©dito', icon: CreditCard }] : []),
              ].map(({ id, label, icon: Icon }) => (
                <button key={id} onClick={() => setMethod(id)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '10px', borderRadius: 10, fontFamily: F, fontWeight: 700, fontSize: 13.5, border: 'none', cursor: 'pointer', transition: 'all .2s', background: method === id ? NAVY : 'transparent', color: method === id ? 'white' : MUTED }}>
                  <Icon size={15} /> {label}
                </button>
              ))}
            </div>
            <div style={{ background: 'white', borderRadius: 16, border: `1px solid ${BORDER}`, padding: '22px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={lbl}>Nome</label>
                <input type="text" placeholder="Seu nome" value={customerName} onChange={(e) => setCustomerName(e.target.value)} style={inp} />
              </div>
              <div>
                <label style={lbl}>E-mail</label>
                <input type="email" placeholder="voce@exemplo.com" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} style={inp} />
              </div>
              <div>
                <label style={lbl}>CPF/CNPJ</label>
                <input type="text" placeholder="000.000.000-00" value={customerDoc} onChange={(e) => applyMaskKeepingCaret(e, setCustomerDoc, maskCpfCnpj)} style={inp} />
              </div>
              <div>
                <label style={lbl}>Telefone</label>
                <input type="tel" placeholder="(11) 99999-0000" value={customerPhone} onChange={(e) => applyMaskKeepingCaret(e, setCustomerPhone, maskPhoneBR)} style={inp} />
              </div>
            </div>
            {method === 'pix' ? (
              <div style={{ background: 'white', borderRadius: 16, border: `1px solid ${BORDER}`, padding: '28px', textAlign: 'center' }}>
                <p style={{ fontFamily: F, fontSize: 13.5, color: MUTED, marginBottom: 20 }}>Escaneie o QR Code com o app do seu banco</p>
                <div style={{ width: 168, height: 168, borderRadius: 16, background: FAINT, border: `2px dashed ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                  {pixQrImageSrc ? (
                    <img src={pixQrImageSrc} alt="QR Code Pix" style={{ width: 160, height: 160, objectFit: 'contain', borderRadius: 12, background: 'white' }} />
                  ) : (
                    <div style={{ padding: '0 16px', textAlign: 'center' }}>
                      <QrCode size={54} style={{ color: NAVY, opacity: 0.35, marginBottom: 8 }} />
                      <p style={{ fontFamily: F, fontSize: 11.5, color: MUTED, lineHeight: 1.4 }}>
                        A cobrança será exibida aqui após a criação do Pix.
                      </p>
                    </div>
                  )}
                </div>
                <div style={{ background: FAINT, borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <code style={{ flex: 1, fontFamily: MONO, fontSize: 10.5, color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pixCopy ?? 'Gerar cobranÃ§a para exibir o PIX Copia e Cola...'}</code>
                  <button
                    disabled={!pixCopy}
                    onClick={async () => {
                      if (!pixCopy) return
                      await copyWithFeedback(pixCopy, 'Código PIX copiado com sucesso.')
                    }}
                    style={{ background: 'none', border: 'none', cursor: pixCopy ? 'pointer' : 'default', color: MINT_D, opacity: pixCopy ? 1 : 0.5 }}
                  >
                    <Copy size={14} />
                  </button>
                </div>
                {pixPollingError ? <Notice tone="warning">{pixPollingError}</Notice> : null}
                <div style={{ background: FAINT, borderRadius: 12, padding: '12px 14px', textAlign: 'left', marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontFamily: F, fontSize: 12.5 }}>
                    <span style={{ color: MUTED }}>Valor</span>
                    <strong style={{ color: TEXT }}>{fmtBRL(amountCents)}</strong>
                  </div>
                  <div style={{ height: 8 }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontFamily: F, fontSize: 12.5 }}>
                    <span style={{ color: MUTED }}>Status</span>
                    <strong style={{ color: TEXT }}>{pixStatusLabel}</strong>
                  </div>
                  {pixExpiresLabel ? (
                    <>
                      <div style={{ height: 8 }} />
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontFamily: F, fontSize: 12.5 }}>
                        <span style={{ color: MUTED }}>Expira em</span>
                        <strong style={{ color: TEXT }}>{pixExpiresLabel}</strong>
                      </div>
                    </>
                  ) : null}
                </div>
                <p style={{ fontFamily: F, fontSize: 12.5, color: MUTED }}>
                  {transactionId ? (
                    <>
                      Aguardando confirmaÃ§Ã£o em tempo real <strong style={{ color: TEXT }}>#{transactionId.slice(0, 6)}</strong>
                    </>
                  ) : (
                    <>
                      Clique em <strong style={{ color: TEXT }}>Finalizar pagamento</strong> para gerar a cobranÃ§a
                    </>
                  )}
                </p>
                <p style={{ fontFamily: F, fontSize: 12, color: MUTED, marginTop: 10 }}>
                  Abra o aplicativo do seu banco, escaneie o QR Code ou cole o código Pix para concluir o pagamento.
                </p>
              </div>
            ) : (
              <div style={{ background: 'white', borderRadius: 16, border: `1px solid ${BORDER}`, padding: '28px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={lbl}>Nome no cartÃ£o</label>
                  <input type="text" placeholder="ANA L SILVA" value={cardName} onChange={(e) => setCardName(e.target.value)} style={inp} />
                </div>
                <div>
                  <label style={lbl}>NÃºmero do cartÃ£o</label>
                  <input type="text" placeholder="0000 0000 0000 0000" value={cardNumber} onChange={(e) => setCardNumber(maskCardNumber(e.target.value))} style={inp} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={lbl}>Validade</label>
                    <input type="text" placeholder="MM/AA" value={cardExp} onChange={(e) => setCardExp(maskCardExp(e.target.value))} style={inp} />
                  </div>
                  <div>
                    <label style={lbl}>CVV</label>
                    <input type="text" placeholder="123" value={cardCvv} onChange={(e) => setCardCvv(onlyDigits(e.target.value).slice(0, 4))} style={inp} />
                  </div>
                </div>
                {!isRecurring && (
                  <div>
                    <label style={lbl}>Parcelamento</label>
                    <select value={installments} onChange={(e) => setInstallments(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
                      {Array.from({ length: maxInstallments }, (_, i) => i + 1).map((n) => {
                        const sim = installmentSim(n)
                        return (
                        <option key={n} value={String(n)}>
                          {`${n}x de ${fmtBRL(sim.perCents)} Â· Total ${fmtBRL(sim.totalCents)} Â· Taxa est. ${fmtBRL(sim.feeCents)}`}
                        </option>
                        )
                      })}
                    </select>
                    {cardSim && (
                      <div style={{ marginTop: 10, background: FAINT, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '10px 12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontFamily: F, fontSize: 12.5 }}>
                          <span style={{ color: MUTED }}>Parcela</span>
                          <span style={{ fontWeight: 800, color: TEXT }}>{`${cardSim.n}x de ${fmtBRL(cardSim.perCents)}`}</span>
                        </div>
                        <div style={{ height: 6 }} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontFamily: F, fontSize: 12.5 }}>
                          <span style={{ color: MUTED }}>Taxa (estimada)</span>
                          <span style={{ fontWeight: 800, color: TEXT }}>{fmtBRL(cardSim.feeCents)}</span>
                        </div>
                        <div style={{ height: 6 }} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontFamily: F, fontSize: 12.5 }}>
                          <span style={{ color: MUTED }}>Total (estimado)</span>
                          <span style={{ fontWeight: 900, color: NAVY }}>{fmtBRL(cardSim.totalCents)}</span>
                        </div>
                        <p style={{ marginTop: 8, fontFamily: F, fontSize: 11.5, color: MUTED, lineHeight: 1.4 }}>
                          Taxas e valores finais podem variar conforme parcelamento, bandeira e regras do emissor.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
          <button
            disabled={loading || !slug}
            onClick={async () => {
              if (!slug) return
              setError(null)
              const customerValidation = validateCheckoutCustomer({
                name: customerName,
                email: customerEmail,
                phone: customerPhone,
                document: customerDoc,
              }, { requirePhone: method === 'pix' })
              if (!customerValidation.ok) {
                setError(customerValidation.message)
                return
              }
              const customer = customerValidation.customer
              setLoading(true)
              setSubscriptionId(null)
              setTransactionId(null)
              setTransactionToken(null)
              setPixCopy(null)
              setPixStatus(null)
              setPixQrCode(null)
              setPixQrCodeUrl(null)
              setPixQrCodeBase64(null)
              setPixQrImageSrc(null)
              setPixExpiresAt(null)
              try {
                const expMonth = cardExp.split('/')[0]?.trim()
                const expYear = cardExp.split('/')[1]?.trim()
                let cardPayload:
                  | {
                      holderName?: string
                      number?: string
                      expMonth?: string
                      expYear?: string
                      cvv?: string
                      token?: string
                      brand?: string
                      last4?: string
                    }
                  | undefined

                if (method === 'card') {
                  if (!expMonth || !expYear) {
                    setError('Validade invÃ¡lida.')
                    return
                  }
                  if (!cardName.trim()) {
                    setError('Informe o nome impresso no cartÃ£o.')
                    return
                  }
                  if (requiresPagarMeCardTokenization) {
                    const tokenizedCard = await tokenizePagarMeCardInBrowser({
                      number: cardNumber,
                      holderName: cardName,
                      holderDocument: customer.document,
                      expMonth,
                      expYear,
                      cvv: cardCvv,
                      label: typeof link?.name === 'string' ? link.name : 'Connekt Pay',
                    })
                    cardPayload = {
                      holderName: cardName.trim(),
                      token: tokenizedCard.token,
                      expMonth: tokenizedCard.expMonth,
                      expYear: tokenizedCard.expYear,
                      brand: tokenizedCard.brand,
                      last4: tokenizedCard.last4,
                    }
                  } else {
                    cardPayload = {
                      holderName: cardName,
                      number: cardNumber.replace(/\s+/g, ''),
                      expMonth,
                      expYear,
                      cvv: cardCvv,
                    }
                  }
                }

                const res = isRecurring
                  ? await fetch('/api/subscriptions', {
                      method: 'POST',
                      headers: { 'content-type': 'application/json' },
                      body: JSON.stringify({
                        planSlug: slug,
                        interval: link?.metadata?.interval ?? 'monthly',
                        customer,
                        card: cardPayload,
                      }),
                    })
                  : await fetch('/api/payments', {
                      method: 'POST',
                      headers: { 'content-type': 'application/json' },
                      body: JSON.stringify({
                        paymentLinkSlug: slug,
                        method,
                        customer,
                        installments: method === 'card' ? Number(installments) : undefined,
                        card: cardPayload,
                      }),
                    })
                const json = await res.json().catch(() => null)
                if (!res.ok) {
                  setError(
                    toUserFacingError(
                      json?.error,
                      isRecurring ? 'NÃ£o foi possÃ­vel criar a assinatura. Tente novamente.' : 'NÃ£o foi possÃ­vel criar o pagamento. Tente novamente.',
                      isRecurring ? '/api/subscriptions' : '/api/payments'
                    )
                  )
                  return
                }
                if (isRecurring) {
                  setSubscriptionId(json?.subscription?.id ?? null)
                  setPaid(true)
                  return
                }
                setTransactionId(json?.transactionId ?? null)
                setTransactionToken(json?.transactionPublicToken ?? null)
                if (typeof json?.payment?.status === 'string') setPixStatus(json.payment.status)
                if (typeof json?.payment?.pix?.qrCode === 'string') setPixQrCode(json.payment.pix.qrCode)
                if (typeof json?.payment?.pix?.qrCodeUrl === 'string') setPixQrCodeUrl(json.payment.pix.qrCodeUrl)
                if (typeof json?.payment?.pix?.qrCodeBase64 === 'string') setPixQrCodeBase64(json.payment.pix.qrCodeBase64)
                const copyPaste = json?.payment?.pix?.copyPaste
                if (typeof copyPaste === 'string') setPixCopy(copyPaste)
                const expiresAt = json?.payment?.pix?.expiresAt
                if (typeof expiresAt === 'string') setPixExpiresAt(expiresAt)
                if (json?.payment?.status === 'paid') setPaid(true)
              } finally {
                setLoading(false)
              }
            }}
            style={{ padding: '15px', background: MINT, color: NAVY, fontFamily: F, fontWeight: 800, fontSize: 15, borderRadius: 12, border: 'none', cursor: loading ? 'default' : 'pointer', boxShadow: `0 6px 20px ${MINT}45`, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'background .15s', opacity: loading ? 0.8 : 1 }}
            onMouseEnter={(e) => {
              if (!loading) e.currentTarget.style.background = MINT_D
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = MINT
            }}
          >
            <Shield size={16} /> {loading ? 'Processando...' : isRecurring ? `Assinar Â· ${fmtBRL(Number(link?.amount ?? 0))}` : `Finalizar pagamento Â· ${fmtBRL(Number(link?.amount ?? 0))}`}
          </button>
          <p style={{ textAlign: 'center', fontFamily: F, fontSize: 11.5, color: MUTED, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
            <Shield size={11} /> Pagamento criptografado pela Connekt Pay
          </p>
        </div>
      </div>
    </div>
  )
}

export function SubscriptionsScreen() {
  const router = useRouter()
  const { confirm, confirmDialog } = useConfirmDialog()
  const cachedSubscriptions = useMemo(
    () => readScreenCache<{ subs: any[]; mrrCents: number; churnRate: number; nextChargeAt: string | null; role: string | null }>('subscriptions:list'),
    [],
  )
  const [loading, setLoading] = useState(cachedSubscriptions == null)
  const [error, setError] = useState<string | null>(null)
  const [subs, setSubs] = useState<any[]>(cachedSubscriptions?.subs ?? [])
  const [mrrCents, setMrrCents] = useState<number>(cachedSubscriptions?.mrrCents ?? 0)
  const [churnRate, setChurnRate] = useState<number>(cachedSubscriptions?.churnRate ?? 0)
  const [nextChargeAt, setNextChargeAt] = useState<string | null>(cachedSubscriptions?.nextChargeAt ?? null)
  const [menuSubId, setMenuSubId] = useState<string | null>(null)
  const [role, setRole] = useState<string | null>(cachedSubscriptions?.role ?? null)

  const reload = useCallback(async () => {
    const cached = readScreenCache<{ subs: any[]; mrrCents: number; churnRate: number; nextChargeAt: string | null; role: string | null }>('subscriptions:list')
    if (cached) {
      setSubs(cached.subs)
      setMrrCents(cached.mrrCents)
      setChurnRate(cached.churnRate)
      setNextChargeAt(cached.nextChargeAt)
      setRole(cached.role)
      setLoading(false)
    } else {
      setLoading(true)
    }
    setError(null)
    const snapshot = readScreenCacheSnapshot<{ subs: any[]; mrrCents: number; churnRate: number; nextChargeAt: string | null; role: string | null }>('subscriptions:list')
    const remainingMs = snapshot?.expiresAt ? snapshot.expiresAt - Date.now() : 0
    if (cached && remainingMs > 30_000) return
    try {
      const [res, me] = await Promise.all([fetch('/api/subscriptions', { method: 'GET' }), getMeCached().catch(() => null)])
      const json = await res.json().catch(() => null)
      const nextRole = typeof me?.role === 'string' ? String(me.role) : null
      if (nextRole) setRole(nextRole)
      if (!res.ok) {
        logError('SubscriptionsScreen: /api/subscriptions failed', { status: res.status, error: json?.error })
        setError(toUserFacingError(json?.error, 'Ocorreu um erro ao carregar assinaturas. Tente novamente.', '/api/subscriptions'))
        setSubs([])
        setMrrCents(0)
        setChurnRate(0)
        setNextChargeAt(null)
        return
      }
      setSubs(Array.isArray(json?.subscriptions) ? json.subscriptions : [])
      const nextSubs = Array.isArray(json?.subscriptions) ? json.subscriptions : []
      const nextMrrCents = typeof json?.mrrCents === 'number' ? json.mrrCents : 0
      const nextChurnRate = typeof json?.churnRate === 'number' ? json.churnRate : 0
      const nextCharge = typeof json?.nextChargeAt === 'string' ? json.nextChargeAt : null
      setSubs(nextSubs)
      setMrrCents(nextMrrCents)
      setChurnRate(nextChurnRate)
      setNextChargeAt(nextCharge)
      writeScreenCache('subscriptions:list', {
        subs: nextSubs,
        mrrCents: nextMrrCents,
        churnRate: nextChurnRate,
        nextChargeAt: nextCharge,
        role: nextRole,
      })
    } catch (e) {
      logError('SubscriptionsScreen reload failed', e)
      setError('Ocorreu um erro ao carregar assinaturas. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!menuSubId) return
    const onDoc = (ev: MouseEvent) => {
      const t = ev.target as HTMLElement | null
      if (!t) return
      const root = t.closest('[data-sub-menu-root]')
      if (!root) setMenuSubId(null)
    }
    document.addEventListener('click', onDoc)
    return () => document.removeEventListener('click', onDoc)
  }, [menuSubId])

  useEffect(() => {
    void reload()
  }, [reload])

  const activeSubs = subs.filter((s) => String(s.status ?? '').toLowerCase().includes('active'))
  const canCreatePlans = role ? ['owner', 'admin', 'super_admin'].includes(role) : true

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,auto)', gap: 12 }}>
          {[
            { l: 'MRR', v: loading ? 'â€”' : fmtBRL(mrrCents), bg: NAVY, fg: 'white', sh: `0 4px 20px rgba(2,27,91,.3)` },
            { l: 'Assinaturas ativas', v: loading ? 'â€”' : activeSubs.length.toLocaleString('pt-BR'), bg: MINT, fg: NAVY, sh: `0 4px 14px ${MINT}50` },
            { l: 'Churn mensal', v: loading ? 'â€”' : `${Math.round(churnRate * 100)}%`, bg: 'white', fg: TEXT, sh: '0 1px 4px rgba(2,27,91,.04)' },
            { l: 'PrÃ³xima cobranÃ§a', v: nextChargeAt ? new Date(nextChargeAt).toLocaleDateString('pt-BR') : 'â€”', bg: 'white', fg: TEXT, sh: '0 1px 4px rgba(2,27,91,.04)' },
          ].map(({ l, v, bg, fg, sh }) => (
            <div key={l} style={{ background: bg, borderRadius: 12, border: bg === 'white' ? `1px solid ${BORDER}` : 'none', padding: '14px 20px', boxShadow: sh }}>
              <p style={{ fontFamily: F, fontSize: 11, color: bg === 'white' ? MUTED : bg === MINT ? `${NAVY}90` : 'rgba(255,255,255,.5)', marginBottom: 3 }}>{l}</p>
              <p style={{ fontFamily: F, fontWeight: 800, fontSize: 20, color: fg, letterSpacing: '-0.02em' }}>{v}</p>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <GhostBtn disabled={loading || subs.length === 0} onClick={() => void downloadFromApi('/api/subscriptions?format=csv', 'subscriptions.csv', 'Assinaturas exportadas com sucesso.')}>
            <Download size={13} /> Exportar CSV
          </GhostBtn>
          <PrimaryBtn disabled={!canCreatePlans} onClick={() => router.push('/subscriptions/plans')}>
            <Plus size={15} /> Criar plano
          </PrimaryBtn>
        </div>
      </div>
      {!canCreatePlans && <Notice>CriaÃ§Ã£o de planos disponÃ­vel apenas para Owner/Admin.</Notice>}
      {error && <Notice>{error}</Notice>}
      <TableCard>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#FAFBFD' }}>{['Cliente', 'Plano', 'Valor', 'PrÃ³xima cobranÃ§a', 'Status', ''].map((h) => <Th key={h}>{h}</Th>)}</tr>
          </thead>
          <tbody>
            {(!loading ? subs : []).map((sub) => (
              <tr key={sub.id} className="group" style={{ transition: 'background .12s' }} onMouseEnter={(e) => (e.currentTarget.style.background = FAINT)} onMouseLeave={(e) => (e.currentTarget.style.background = '')}>
                <td style={{ padding: '14px 20px', borderBottom: `1px solid ${BORDER}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Avi name={sub.pagador?.name ?? sub.pagador?.email ?? 'â€”'} size={32} />
                    <span style={{ fontFamily: F, fontWeight: 600, fontSize: 13.5, color: TEXT }}>{sub.pagador?.name ?? sub.pagador?.email ?? 'â€”'}</span>
                  </div>
                </td>
                <td style={{ padding: '14px 20px', borderBottom: `1px solid ${BORDER}` }}>
                  <span style={{ fontFamily: F, fontWeight: 600, fontSize: 12, padding: '4px 10px', borderRadius: 6, background: '#EEF2FF', color: '#4338CA' }}>{sub.plano?.name ?? 'Plano'}</span>
                </td>
                <Td>
                  <span style={{ fontWeight: 700 }}>{fmtBRL(Number(sub.plano?.amount_centavos ?? 0))}</span>
                  <span style={{ fontFamily: F, fontSize: 11, color: MUTED }}>{sub.plano?.cycle === 'weekly' ? '/semana' : sub.plano?.cycle === 'yearly' ? '/ano' : '/mÃªs'}</span>
                </Td>
                <Td>
                  <span style={{ color: MUTED }}>{sub.next_charge_at ? new Date(sub.next_charge_at as string).toLocaleDateString('pt-BR') : 'â€”'}</span>
                </Td>
                <td style={{ padding: '14px 20px', borderBottom: `1px solid ${BORDER}` }}>
                  <Badge status={String(sub.status ?? 'â€”')} />
                </td>
                <td style={{ padding: '14px 20px', borderBottom: `1px solid ${BORDER}`, opacity: 0 }} className="group-hover:opacity-100">
                  <div data-sub-menu-root style={{ position: 'relative', display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => setMenuSubId((prev) => (prev === sub.id ? null : sub.id))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, padding: 4, borderRadius: 8 }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = FAINT)}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <MoreHorizontal size={15} />
                    </button>
                    {menuSubId === sub.id && (
                      <div
                        style={{
                          position: 'absolute',
                          right: 0,
                          top: 28,
                          background: 'white',
                          border: `1px solid ${BORDER}`,
                          borderRadius: 12,
                          boxShadow: '0 10px 30px rgba(0,0,0,.12)',
                          overflow: 'hidden',
                          minWidth: 200,
                          zIndex: 5,
                        }}
                      >
                        <button
                          onClick={() => {
                            setMenuSubId(null)
                            router.push(`/subscriptions/${sub.id}`)
                          }}
                          style={{ width: '100%', textAlign: 'left', background: 'white', border: 'none', cursor: 'pointer', padding: '10px 12px', fontFamily: F, fontSize: 12.5, color: TEXT }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = FAINT)}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'white')}
                        >
                          Ver detalhes
                        </button>
                        <button
                          disabled={String(sub.status ?? '').toLowerCase().includes('canceled')}
                          onClick={async () => {
                            const ok = await confirm({
                              title: 'Cancelar assinatura?',
                              description: 'A assinatura serÃ¡ cancelada e nÃ£o terÃ¡ novas cobranÃ§as.',
                              confirmLabel: 'Cancelar',
                              danger: true,
                            })
                            if (!ok) return
                            setMenuSubId(null)
                            setError(null)
                            try {
                              const res = await fetch(`/api/subscriptions/${sub.id}/cancel`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason: 'Cancelled from UI' }) })
                              const json = await res.json().catch(() => null)
                              if (!res.ok) {
                                logError('SubscriptionsScreen: cancel failed', { id: sub.id, status: res.status, error: json?.error })
                                setError(toUserFacingError(json?.error, 'Ocorreu um erro ao cancelar a assinatura. Tente novamente.', `/api/subscriptions/${sub.id}/cancel`))
                                return
                              }
                              await reload()
                            } catch (e) {
                              logError('SubscriptionsScreen cancel failed', e)
                              setError('Ocorreu um erro ao cancelar a assinatura. Tente novamente.')
                            }
                          }}
                          style={{
                            width: '100%',
                            textAlign: 'left',
                            background: 'white',
                            border: 'none',
                            cursor: String(sub.status ?? '').toLowerCase().includes('canceled') ? 'default' : 'pointer',
                            padding: '10px 12px',
                            fontFamily: F,
                            fontSize: 12.5,
                            color: '#DC2626',
                            opacity: String(sub.status ?? '').toLowerCase().includes('canceled') ? 0.55 : 1,
                          }}
                          onMouseEnter={(e) => {
                            if (!String(sub.status ?? '').toLowerCase().includes('canceled')) e.currentTarget.style.background = '#FEF2F2'
                          }}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'white')}
                        >
                          Cancelar
                        </button>
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading ? (
          <TableSkeleton rows={7} cols={6} />
        ) : subs.length === 0 ? (
          <EmptyState
            icon={<RefreshCw size={18} style={{ color: NAVY }} />}
            title="Nenhuma assinatura encontrada"
            description="Crie um plano e inicie assinaturas para ver os registros aqui."
            primaryAction={{ label: 'Ver planos', onClick: () => router.push('/subscriptions/plans') }}
          />
        ) : null}
      </TableCard>
      {confirmDialog}
    </div>
  )
}

export function SubscriptionPlansScreen() {
  const router = useRouter()
  const { prompt, promptDialog } = usePromptDialog()
  const cachedPlans = useMemo(() => readScreenCache<{ plans: any[]; receivers: any[] }>('subscription-plans:list'), [])
  const [loading, setLoading] = useState(cachedPlans == null)
  const [error, setError] = useState<string | null>(null)
  const [plans, setPlans] = useState<any[]>(cachedPlans?.plans ?? [])
  const [receivers, setReceivers] = useState<any[]>(cachedPlans?.receivers ?? [])

  useEffect(() => {
    const run = async () => {
      const cached = readScreenCache<{ plans: any[]; receivers: any[] }>('subscription-plans:list')
      if (cached) {
        setPlans(cached.plans)
        setReceivers(cached.receivers)
        setLoading(false)
      } else {
        setLoading(true)
      }
      setError(null)
      try {
        const [r1, r2] = await Promise.all([fetch('/api/plans', { method: 'GET' }), fetch('/api/receivers', { method: 'GET' })])
        const j1 = await r1.json().catch(() => null)
        const j2 = await r2.json().catch(() => null)
        if (!r1.ok) {
          logError('SubscriptionPlansScreen: /api/plans failed', { status: r1.status, error: j1?.error })
          setError(toUserFacingError(j1?.error, 'Ocorreu um erro ao carregar planos. Tente novamente.', '/api/plans'))
          setPlans([])
          setReceivers([])
          return
        }
        if (!r2.ok) {
          logError('SubscriptionPlansScreen: /api/receivers failed', { status: r2.status, error: j2?.error })
          setError(toUserFacingError(j2?.error, 'Ocorreu um erro ao carregar recebedores. Tente novamente.', '/api/receivers'))
          setPlans(Array.isArray(j1?.plans) ? j1.plans : [])
          setReceivers([])
          return
        }
        const nextPlans = Array.isArray(j1?.plans) ? j1.plans : []
        const nextReceivers = Array.isArray(j2?.receivers) ? j2.receivers : []
        setPlans(nextPlans)
        setReceivers(nextReceivers)
        writeScreenCache('subscription-plans:list', { plans: nextPlans, receivers: nextReceivers })
      } catch (e) {
        logError('SubscriptionPlansScreen load failed', e)
        setError('Ocorreu um erro ao carregar planos. Tente novamente.')
      } finally {
        setLoading(false)
      }
    }
    void run()
  }, [])

  const approvedReceivers = receivers.filter((r) => String(r.kyc_status ?? 'pending') === 'approved' && String(r.status ?? 'active') === 'active')
  const canCreatePlan = approvedReceivers.length > 0

  const createPlan = async () => {
    setError(null)
    const receiverId = approvedReceivers[0]?.id as string | undefined
    if (!receiverId) {
      setError('Cadastre e aprove um recebedor (KYC) antes de criar planos.')
      return
    }
    const name = await prompt({ title: 'Criar plano', label: 'Nome do plano', placeholder: 'Ex: Plano Premium', requiredMessage: 'Informe o nome do plano.' })
    if (!name) return
    const amountBRL = await prompt({
      title: 'Criar plano',
      label: 'Valor (R$)',
      placeholder: 'Ex: 99,90',
      normalize: maskBRLInput,
      requiredMessage: 'Informe o valor do plano.',
    })
    if (!amountBRL) return
    const amountCents = Number(onlyDigits(amountBRL))
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      setError('Informe um valor vÃ¡lido para o plano.')
      return
    }
    const cycle = ((await prompt({ title: 'Criar plano', label: 'Ciclo (monthly|yearly|weekly)', defaultValue: 'monthly' })) ?? 'monthly').trim()
    const trialDaysRaw = await prompt({ title: 'Criar plano', label: 'Trial days', defaultValue: '0', placeholder: '0' })
    const trialDays = Number(trialDaysRaw ?? '0')
    const paymentMethod = ((await prompt({ title: 'Criar plano', label: 'MÃ©todo (card|pix_auto)', defaultValue: 'card' })) ?? 'card').trim()

    setLoading(true)
    try {
      const res = await fetch('/api/plans', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ receiverId, name, description: null, amountCents, cycle, trialDays, paymentMethod }),
      })
      const j = await res.json().catch(() => null)
      if (!res.ok) {
        logError('SubscriptionPlansScreen: create plan failed', { status: res.status, error: j?.error })
        setError(toUserFacingError(j?.error, 'Ocorreu um erro ao criar o plano. Tente novamente.', '/api/plans'))
        return
      }
      const list = await fetch('/api/plans', { method: 'GET' })
      const listJson = await list.json().catch(() => null)
      if (list.ok) setPlans(Array.isArray(listJson?.plans) ? listJson.plans : [])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontFamily: F, fontWeight: 900, fontSize: 18, color: TEXT, marginBottom: 4 }}>Planos</h2>
          <p style={{ fontFamily: F, fontSize: 12.5, color: MUTED }}>Estruture sua oferta recorrente com planos claros, valores previsÃ­veis e operaÃ§Ã£o simples.</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <GhostBtn disabled={loading || plans.length === 0} onClick={() => void downloadFromApi('/api/plans?format=csv', 'plans.csv', 'Planos exportados com sucesso.')}>
            <Download size={13} /> Exportar CSV
          </GhostBtn>
          <GhostBtn onClick={() => router.push('/subscriptions')}>
            Voltar
          </GhostBtn>
          <PrimaryBtn disabled={!canCreatePlan} loading={loading} onClick={createPlan}>
            <Plus size={15} /> Criar plano
          </PrimaryBtn>
        </div>
      </div>
      {!loading && !canCreatePlan && (
        <Notice>
          Para criar planos, Ã© necessÃ¡rio ter ao menos um recebedor com KYC aprovado. Cadastre um recebedor e conclua o KYC antes de continuar.{' '}
          <button onClick={() => router.push('/recebedores')} style={{ background: 'none', border: 'none', padding: 0, margin: 0, color: NAVY, fontFamily: F, fontWeight: 800, cursor: 'pointer' }}>
            Ir para Recebedores
          </button>
        </Notice>
      )}
      {error && <Notice>{error}</Notice>}
      <TableCard>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#FAFBFD' }}>{['Plano', 'Valor', 'Ciclo', 'MÃ©todo', 'Status', ''].map((h) => <Th key={h}>{h}</Th>)}</tr>
          </thead>
          <tbody>
            {(!loading ? plans : []).map((p) => (
              <tr key={p.id} className="group" style={{ transition: 'background .12s' }} onMouseEnter={(e) => (e.currentTarget.style.background = FAINT)} onMouseLeave={(e) => (e.currentTarget.style.background = '')}>
                <Td>{p.name}</Td>
                <Td>
                  <span style={{ fontWeight: 700 }}>{fmtBRL(Number(p.amount_centavos ?? 0))}</span>
                </Td>
                <Td>{String(p.cycle ?? 'monthly')}</Td>
                <Td>
                  <span style={{ fontFamily: MONO, fontSize: 12, color: MUTED }}>{String(p.payment_method ?? 'card')}</span>
                </Td>
                <Td>
                  <Badge status={String(p.status ?? 'active')} />
                </Td>
                <td style={{ padding: '14px 20px', borderBottom: `1px solid ${BORDER}`, opacity: 0 }} className="group-hover:opacity-100">
                  <button
                    aria-label="Alternar status do plano"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED }}
                    onClick={async () => {
                      setError(null)
                      setLoading(true)
                      try {
                        const nextStatus = String(p.status ?? 'active') === 'active' ? 'inactive' : 'active'
                        const res = await fetch(`/api/plans/${p.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: nextStatus }) })
                        const j = await res.json().catch(() => null)
                        if (!res.ok) {
                          logError('SubscriptionPlansScreen: update plan failed', { id: p.id, status: res.status, error: j?.error })
                          setError(toUserFacingError(j?.error, 'Ocorreu um erro ao atualizar o plano. Tente novamente.', `/api/plans/${p.id}`))
                          return
                        }
                        const list = await fetch('/api/plans', { method: 'GET' })
                        const listJson = await list.json().catch(() => null)
                        if (list.ok) setPlans(Array.isArray(listJson?.plans) ? listJson.plans : [])
                      } finally {
                        setLoading(false)
                      }
                    }}
                  >
                    <MoreHorizontal size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading ? (
          <TableSkeleton rows={6} cols={6} />
        ) : plans.length === 0 ? (
          <EmptyState
            icon={<RefreshCw size={18} style={{ color: NAVY }} />}
            title="Nenhum plano encontrado"
            description={canCreatePlan ? 'Crie um plano para permitir assinaturas recorrentes.' : 'Para criar um plano, primeiro cadastre um recebedor com KYC aprovado.'}
            primaryAction={canCreatePlan ? { label: 'Criar plano', onClick: () => void createPlan(), loading } : { label: 'Ir para Recebedores', onClick: () => router.push('/recebedores') }}
          />
        ) : null}
      </TableCard>
      {promptDialog}
    </div>
  )
}

export function NewSubscriptionScreen() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [plans, setPlans] = useState<any[]>([])
  const [subscriptionProviderId, setSubscriptionProviderId] = useState<string | null>(null)
  const [requiresClientCardTokenization, setRequiresClientCardTokenization] = useState(false)
  const [planId, setPlanId] = useState<string>('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [document, setDocument] = useState('')
  const [phone, setPhone] = useState('')
  const [cardName, setCardName] = useState('')
  const [cardNumber, setCardNumber] = useState('')
  const [cardExp, setCardExp] = useState('')
  const [cardCvv, setCardCvv] = useState('')

  useEffect(() => {
    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        const [plansRes, subscriptionsRes] = await Promise.all([
          fetch('/api/plans', { method: 'GET' }),
          fetch('/api/subscriptions', { method: 'GET' }),
        ])
        const plansJson = await plansRes.json().catch(() => null)
        const subscriptionsJson = await subscriptionsRes.json().catch(() => null)
        if (!plansRes.ok) {
          logError('NewSubscriptionScreen: /api/plans failed', { status: plansRes.status, error: plansJson?.error })
          setError(toUserFacingError(plansJson?.error, 'Ocorreu um erro ao carregar planos. Tente novamente.', '/api/plans'))
          setPlans([])
          return
        }
        const list = Array.isArray(plansJson?.plans) ? plansJson.plans : []
        setPlans(list)
        setPlanId(list[0]?.id ?? '')
        if (subscriptionsRes.ok) {
          const providerId = typeof subscriptionsJson?.providerId === 'string' ? subscriptionsJson.providerId : null
          setSubscriptionProviderId(providerId)
          setRequiresClientCardTokenization(Boolean(subscriptionsJson?.requiresClientCardTokenization))
        } else {
          setSubscriptionProviderId(null)
          setRequiresClientCardTokenization(false)
        }
      } catch (e) {
        logError('NewSubscriptionScreen load plans failed', e)
        setError('Ocorreu um erro ao carregar planos. Tente novamente.')
      } finally {
        setLoading(false)
      }
    }
    void run()
  }, [])

  const inp = { width: '100%', padding: '12px 12px', borderRadius: 12, border: `1px solid ${BORDER}`, fontFamily: F, fontSize: 13.5, outline: 'none' } as const
  const lbl = { fontFamily: F, fontSize: 12, color: MUTED, marginBottom: 6 } as const

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontFamily: F, fontWeight: 900, fontSize: 18, color: TEXT, marginBottom: 4 }}>Nova assinatura</h2>
          <p style={{ fontFamily: F, fontSize: 12.5, color: MUTED }}>O fluxo segue a política de tokenização do provedor financeiro ativo, sem persistir PAN/CVV na Connekt Pay.</p>
        </div>
        <PrimaryBtn onClick={() => router.push('/subscriptions')}>
          Voltar
        </PrimaryBtn>
      </div>

      {error && <Notice>{error}</Notice>}

      <div style={{ background: 'white', borderRadius: 16, border: `1px solid ${BORDER}`, padding: 18, boxShadow: '0 1px 4px rgba(2,27,91,.04)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label style={lbl}>Plano</label>
          <select value={planId} onChange={(e) => setPlanId(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} Â· {fmtBRL(Number(p.amount_centavos ?? 0))}/{String(p.cycle ?? 'monthly')}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={lbl}>Nome</label>
            <input value={name} onChange={(e) => setName(e.target.value)} style={inp} />
          </div>
          <div>
            <label style={lbl}>Email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} style={inp} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={lbl}>Documento</label>
            <input value={document} onChange={(e) => setDocument(maskCpfCnpj(e.target.value))} style={inp} />
          </div>
          <div>
            <label style={lbl}>Telefone</label>
            <input value={phone} onChange={(e) => setPhone(maskPhoneBR(e.target.value))} style={inp} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={lbl}>Nome no cartÃ£o</label>
            <input value={cardName} onChange={(e) => setCardName(e.target.value)} style={inp} />
          </div>
          <div>
            <label style={lbl}>NÃºmero</label>
            <input value={cardNumber} onChange={(e) => setCardNumber(maskCardNumber(e.target.value))} style={inp} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={lbl}>Validade (MM/AA)</label>
            <input value={cardExp} onChange={(e) => setCardExp(maskCardExp(e.target.value))} style={inp} />
          </div>
          <div>
            <label style={lbl}>CVV</label>
            <input value={cardCvv} onChange={(e) => setCardCvv(onlyDigits(e.target.value).slice(0, 4))} style={inp} />
          </div>
        </div>

        <PrimaryBtn
          disabled={loading}
          onClick={async () => {
            if (loading) return
            setError(null)
            if (!planId) {
              setError('Selecione um plano.')
              return
            }
            const expMonth = cardExp.split('/')[0]?.trim()
            const expYear = cardExp.split('/')[1]?.trim()
            if (!expMonth || !expYear) {
              setError('Validade invÃ¡lida.')
              return
            }
            if (requiresClientCardTokenization && !PAGARME_BROWSER_TOKENIZATION_READY) {
              setError('Tokenização client-side da Pagar.me indisponível neste ambiente.')
              return
            }
            setLoading(true)
            try {
              const cardPayload =
                requiresClientCardTokenization && PAGARME_BROWSER_TOKENIZATION_READY
                  ? await tokenizePagarMeCardInBrowser({
                      number: cardNumber,
                      holderName: cardName,
                      holderDocument: document,
                      expMonth,
                      expYear,
                      cvv: cardCvv,
                      label: 'Connekt Pay',
                    }).then((tokenizedCard) => ({
                      holderName: cardName.trim(),
                      token: tokenizedCard.token,
                      expMonth: tokenizedCard.expMonth,
                      expYear: tokenizedCard.expYear,
                      brand: tokenizedCard.brand,
                      last4: tokenizedCard.last4,
                    }))
                  : {
                      holderName: cardName,
                      number: cardNumber.replace(/\s+/g, ''),
                      expMonth,
                      expYear,
                      cvv: cardCvv,
                    }

              const res = await fetch('/api/subscriptions', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                  planId,
                  customer: { name, email, document, phone },
                  card: cardPayload,
                }),
              })
              const j = await res.json().catch(() => null)
              if (!res.ok) {
                setError(toUserFacingError(j?.error, 'NÃ£o foi possÃ­vel criar a assinatura. Tente novamente.', '/api/subscriptions'))
                return
              }
              const id = j?.subscription?.id ?? null
              if (id) router.push(`/subscriptions/${id}`)
              else router.push('/subscriptions')
            } finally {
              setLoading(false)
            }
          }}
        >
          {loading ? 'Processando...' : 'Criar assinatura'}
        </PrimaryBtn>
        {requiresClientCardTokenization && !PAGARME_BROWSER_TOKENIZATION_READY && (
          <p style={{ fontFamily: F, fontSize: 11.5, color: MUTED }}>
            Tokenização client-side exigida para o provedor atual, mas as variáveis públicas da Pagar.me ainda não estão disponíveis neste ambiente.
          </p>
        )}
        {subscriptionProviderId === 'pagarme' && (
          <p style={{ fontFamily: F, fontSize: 11.5, color: MUTED }}>
            O backend recebe apenas `card.token` e dados operacionais; PAN e CVV ficam restritos ao navegador durante a tokenização.
          </p>
        )}
      </div>
    </div>
  )
}

export function SubscriptionDetailScreen({ id }: { id: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sub, setSub] = useState<any | null>(null)
  const [events, setEvents] = useState<any[]>([])

  useEffect(() => {
    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/subscriptions/${id}`, { method: 'GET' })
        const j = await res.json().catch(() => null)
        if (!res.ok) {
          logError('SubscriptionDetailScreen: load failed', { id, status: res.status, error: j?.error })
          setError(toUserFacingError(j?.error, 'Ocorreu um erro ao carregar a assinatura. Tente novamente.', `/api/subscriptions/${id}`))
          setSub(null)
          setEvents([])
          return
        }
        setSub(j?.subscription ?? null)
        setEvents(Array.isArray(j?.events) ? j.events : [])
      } catch (e) {
        logError('SubscriptionDetailScreen: load failed', e)
        setError(toUserFacingError(e instanceof Error ? e.message : String(e), 'Ocorreu um erro ao carregar a assinatura. Tente novamente.', `/api/subscriptions/${id}`))
      } finally {
        setLoading(false)
      }
    }
    void run()
  }, [id])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <PrimaryBtn onClick={() => router.push('/subscriptions')}>Voltar</PrimaryBtn>
        <div style={{ display: 'flex', gap: 10 }}>
          <PrimaryBtn
            disabled={loading}
            onClick={async () => {
              if (loading) return
              setError(null)
              setLoading(true)
              try {
                const res = await fetch(`/api/subscriptions/${id}/cancel`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason: 'user_request' }) })
                const j = await res.json().catch(() => null)
                if (!res.ok) {
                  logError('SubscriptionDetailScreen: cancel failed', { id, status: res.status, error: j?.error })
                  setError(toUserFacingError(j?.error, 'Ocorreu um erro ao cancelar. Tente novamente.', `/api/subscriptions/${id}/cancel`))
                  return
                }
                const detail = await fetch(`/api/subscriptions/${id}`, { method: 'GET' })
                const dj = await detail.json().catch(() => null)
                if (detail.ok) {
                  setSub(dj?.subscription ?? null)
                  setEvents(Array.isArray(dj?.events) ? dj.events : [])
                }
              } finally {
                setLoading(false)
              }
            }}
          >
            Cancelar
          </PrimaryBtn>
        </div>
      </div>

      {error && <Notice>{error}</Notice>}

      <div style={{ background: 'white', borderRadius: 16, border: `1px solid ${BORDER}`, padding: 18, boxShadow: '0 1px 4px rgba(2,27,91,.04)' }}>
        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i}>
                <Skeleton width={120} height={10} radius={8} />
                <div style={{ height: 10 }} />
                <Skeleton width={i % 2 === 0 ? 160 : 120} height={14} radius={8} />
              </div>
            ))}
          </div>
        ) : sub ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            {[
              { l: 'Status', v: String(sub.status ?? 'â€”') },
              { l: 'PrÃ³xima cobranÃ§a', v: sub.next_charge_at ? new Date(sub.next_charge_at as string).toLocaleDateString('pt-BR') : 'â€”' },
              { l: 'Tentativas falhas', v: String(sub.attempts_failed ?? 0) },
              { l: 'Plano', v: String(sub.plano?.name ?? 'Plano') },
            ].map((x) => (
              <div key={x.l}>
                <p style={{ fontFamily: F, fontSize: 11, color: MUTED, marginBottom: 2 }}>{x.l}</p>
                <p style={{ fontFamily: F, fontWeight: 800, color: TEXT }}>{x.v}</p>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontFamily: F, color: MUTED }}>NÃ£o encontrado.</div>
        )}
      </div>

      <TableCard>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#FAFBFD' }}>{['Evento', 'Data'].map((h) => <Th key={h}>{h}</Th>)}</tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id}>
                <Td>{String(e.event_type ?? 'â€”')}</Td>
                <Td>{e.created_at ? new Date(e.created_at as string).toLocaleString('pt-BR') : 'â€”'}</Td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading ? <TableSkeleton rows={6} cols={2} /> : events.length === 0 ? <EmptyState icon={<Activity size={18} style={{ color: NAVY }} />} title="Sem eventos" description="Ainda nÃ£o hÃ¡ eventos para esta assinatura." /> : null}
      </TableCard>
    </div>
  )
}

export function RecipientsScreen() {
  const { prompt, promptDialog } = usePromptDialog()
  const cachedRecipients = useMemo(() => readScreenCache<{ receivers: any[] }>('receivers:list'), [])
  const [loading, setLoading] = useState(cachedRecipients == null)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<null | { id: number; tone: 'loading' | 'success' | 'error'; message: string }>(null)
  const [receivers, setReceivers] = useState<any[]>(cachedRecipients?.receivers ?? [])
  const [active, setActive] = useState<any | null>(null)
  const [saving, setSaving] = useState(false)
  const [kycId, setKycId] = useState<string | null>(null)
  const [docs, setDocs] = useState<any[]>([])
  const [uploading, setUploading] = useState(false)
  const [startingKyc, setStartingKyc] = useState(false)

  const [type, setType] = useState<'pf' | 'pj'>('pf')
  const [name, setName] = useState('')
  const [legalName, setLegalName] = useState('')
  const [tradeName, setTradeName] = useState('')
  const [document, setDocument] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [legalResponsibleName, setLegalResponsibleName] = useState('')
  const [legalResponsibleDocument, setLegalResponsibleDocument] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')

  const [addrZip, setAddrZip] = useState('')
  const [addrStreet, setAddrStreet] = useState('')
  const [addrNumber, setAddrNumber] = useState('')
  const [addrComplement, setAddrComplement] = useState('')
  const [addrCity, setAddrCity] = useState('')
  const [addrState, setAddrState] = useState('')

  const [bankCode, setBankCode] = useState('')
  const [bankAgency, setBankAgency] = useState('')
  const [bankAccount, setBankAccount] = useState('')
  const [bankAccountDigit, setBankAccountDigit] = useState('')
  const [bankAccountType, setBankAccountType] = useState('corrente')
  const [pixKey, setPixKey] = useState('')

  const loadReceivers = useCallback(async (signal?: AbortSignal) => {
    const res = await fetch('/api/receivers', { method: 'GET', signal })
    const json = await res.json().catch(() => null)
    if (!res.ok) {
      logError('RecipientsScreen: /api/receivers failed', { status: res.status, error: json?.error })
      setError(toUserFacingError(json?.error, 'Ocorreu um erro ao carregar recebedores. Tente novamente.', '/api/receivers'))
      setReceivers([])
      return []
    }
    const nextReceivers = Array.isArray(json?.receivers) ? json.receivers : []
    setReceivers(nextReceivers)
    writeScreenCache('receivers:list', { receivers: nextReceivers })
    return nextReceivers
  }, [])

  const syncActiveReceiver = useCallback((nextReceivers: any[], receiverId?: string | null) => {
    const targetId =
      typeof receiverId === 'string' && receiverId
        ? receiverId
        : typeof active?.id === 'string'
          ? String(active.id)
          : null
    if (!targetId) return
    const nextActive = nextReceivers.find((receiver) => String(receiver.id) === targetId)
    if (nextActive) setActive(nextActive)
  }, [active?.id])

  useEffect(() => {
    const controller = new AbortController()
    const run = async () => {
      const cached = readScreenCache<{ receivers: any[] }>('receivers:list')
      if (cached) {
        setReceivers(cached.receivers)
        setLoading(false)
      } else {
        setLoading(true)
      }
      setError(null)
      try {
        await loadReceivers(controller.signal)
      } catch (e) {
        if (e instanceof TypeError && String(e.message).toLowerCase().includes('failed to fetch')) {
          await Promise.resolve()
        }
        if (controller.signal.aborted || isAbortLikeError(e)) return
        logError('RecipientsScreen load failed', e)
        setError('Ocorreu um erro ao carregar recebedores. Tente novamente.')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void run()
    return () => controller.abort()
  }, [loadReceivers])

  useEffect(() => {
    if (!active) return
    setKycId(typeof active.current_kyc_request_id === 'string' ? active.current_kyc_request_id : null)
    setDocs([])
    setType(String(active.type ?? 'pf') === 'pj' ? 'pj' : 'pf')
    setName(String(active.name ?? ''))
    setLegalName(String(active.legal_name ?? ''))
    setTradeName(String(active.trade_name ?? ''))
    setDocument(String(active.document ?? ''))
    setBirthDate(String(active.birth_date ?? ''))
    setLegalResponsibleName(String(active.legal_responsible_name ?? ''))
    setLegalResponsibleDocument(String(active.legal_responsible_document ?? ''))
    setEmail(String(active.email ?? ''))
    setPhone(String(active.phone ?? ''))

    const address = typeof active.address === 'object' && active.address ? active.address : {}
    setAddrZip(String((address as any).zip ?? ''))
    setAddrStreet(String((address as any).street ?? ''))
    setAddrNumber(String((address as any).number ?? ''))
    setAddrComplement(String((address as any).complement ?? ''))
    setAddrCity(String((address as any).city ?? ''))
    setAddrState(String((address as any).state ?? ''))

    const bank = typeof active.bank_account === 'object' && active.bank_account ? active.bank_account : {}
    setBankCode(String((bank as any).bank_code ?? ''))
    setBankAgency(String((bank as any).agency ?? ''))
    setBankAccount(String((bank as any).account ?? ''))
    setBankAccountDigit(String((bank as any).account_digit ?? ''))
    setBankAccountType(String((bank as any).account_type ?? 'corrente'))
    setPixKey(String((bank as any).pix_key ?? ''))
  }, [active])

  const requiredDocuments = useMemo(() => getRequiredDocumentTypes(type), [type])
  const hasRequiredDocuments = useMemo(() => requiredDocuments.every((docType) => docs.some((doc) => String(doc.doc_type ?? '') === docType)), [docs, requiredDocuments])
  const receiverProgress = useMemo(() => {
    const hasProfile = !!name.trim() && validateDocument(document) && validateEmail(email)
    return countReceiverKycChecklist({
      personType: type,
      hasProfileComplete: hasProfile,
      hasRequiredDocuments,
      kycStatus: active?.kyc_status ?? active?.current_kyc_request_status,
      providerReference: active?.provider_reference,
      isBlocked: String(active?.status ?? '') === 'blocked',
    })
  }, [active?.current_kyc_request_status, active?.kyc_status, active?.provider_reference, active?.status, document, email, hasRequiredDocuments, name, type])
  const activeKycStatus = String(active?.current_kyc_request_status ?? active?.kyc_status ?? 'pending')
  const activeInternalStatus = String(active?.internal_status ?? 'draft')
  const activeKycLabel = mapKycStatusToPortuguese(activeKycStatus)
  const activeInternalStatusLabel = mapInternalStatusToPortuguese(activeInternalStatus)
  const canStartInternalReview = !!active?.id && (activeKycStatus === 'pending' || !kycId)
  const nextStepMessage =
    !validateDocument(document) || !validateEmail(email) || !name.trim()
      ? 'Revise os dados principais do recebedor para continuar.'
      : !hasRequiredDocuments
        ? 'Envie todos os documentos obrigatÃ³rios para liberar a anÃ¡lise interna.'
        : activeKycStatus === 'approved'
          ? 'A aprovação interna foi concluída. A sincronização com o provedor financeiro será habilitada depois.'
          : activeKycStatus === 'under_review'
            ? 'A documentaÃ§Ã£o estÃ¡ em anÃ¡lise interna pela equipe da Connekt Pay.'
            : 'Inicie a anÃ¡lise interna quando todos os documentos estiverem prontos.'

  useEffect(() => {
    if (!toast) return
    if (toast.tone === 'loading') return
    const timeout = window.setTimeout(() => setToast((current) => (current?.id === toast.id ? null : current)), 4200)
    return () => window.clearTimeout(timeout)
  }, [toast])

  const pushToast = useCallback((message: string, tone: 'loading' | 'success' | 'error', id?: number) => {
    setToast({ id: id ?? Date.now(), tone, message })
  }, [])

  const startKyc = async () => {
    if (!active?.id) return
    if (startingKyc) return kycId
    setError(null)
    setStartingKyc(true)
    const toastId = Date.now()
    pushToast('Iniciando KYC...', 'loading', toastId)
    try {
      const res = await fetch('/api/kyc-requests', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ receiverId: active.id, evidence: {} }) })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        logError('RecipientsScreen: startKyc failed', { status: res.status, error: json?.error })
        const message = toUserFacingError(json?.error, 'Ocorreu um erro ao iniciar o KYC. Tente novamente.', '/api/kyc-requests')
        setError(message)
        pushToast(message, 'error', toastId)
        return null
      }
      const id = String(json?.kycRequest?.id ?? '')
      const nextId = id || null
      const nextStatus = typeof json?.kycRequest?.status === 'string' ? String(json.kycRequest.status) : 'under_review'
      setKycId(nextId)
      setReceivers((current) =>
        current.map((receiver) =>
          receiver.id === active.id
            ? {
                ...receiver,
                kyc_status: nextStatus,
                current_kyc_request_id: nextId,
                current_kyc_request_status: nextStatus,
              }
            : receiver,
        ),
      )
      setActive((prev: any) =>
        prev?.id === active.id
          ? {
              ...prev,
              kyc_status: nextStatus,
              current_kyc_request_id: nextId,
              current_kyc_request_status: nextStatus,
            }
          : prev,
      )
      const nextReceivers = await loadReceivers()
      syncActiveReceiver(nextReceivers, String(active.id))
      pushToast('KYC iniciado com sucesso. Agora envie os documentos para anÃ¡lise.', 'success', toastId)
      return nextId
    } finally {
      setStartingKyc(false)
    }
  }

  const loadDocs = useCallback(async (id: string) => {
    const res = await fetch(`/api/kyc-requests/${id}/documents`, { method: 'GET' })
    const json = await res.json().catch(() => null)
    if (!res.ok) {
      logError('RecipientsScreen: loadDocs failed', { id, status: res.status, error: json?.error })
      const message = toUserFacingError(json?.error, 'Ocorreu um erro ao carregar documentos. Tente novamente.', `/api/kyc-requests/${id}/documents`)
      setError(message)
      pushToast(message, 'error')
      return
    }
    setDocs(Array.isArray(json?.documents) ? json.documents : [])
  }, [pushToast])

  useEffect(() => {
    if (!active?.id || !kycId) return
    void loadDocs(kycId)
  }, [active?.id, kycId, loadDocs])

  const uploadDoc = async (docType: string, file: File) => {
    if (!active?.id) return
    setUploading(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.set('receiverId', String(active.id))
      if (kycId) fd.set('kycRequestId', String(kycId))
      fd.set('docType', docType)
      fd.set('file', file)
      const res = await fetch('/api/kyc/upload', { method: 'POST', body: fd })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        logError('RecipientsScreen: uploadDoc failed', { status: res.status, error: json?.error })
        const message = toUserFacingError(json?.error, 'Ocorreu um erro ao enviar o documento. Tente novamente.', '/api/kyc/upload')
        setError(message)
        pushToast(message, 'error')
        return
      }
      const next = (json?.document ?? null) as any
      if (next) setDocs((p) => [next, ...p])
      if (kycId) await loadDocs(kycId)
      const nextReceivers = await loadReceivers()
      syncActiveReceiver(nextReceivers, String(active.id))
      pushToast(kycId ? 'Documento enviado com sucesso. Agora aguarde a anÃ¡lise do KYC.' : 'Documento enviado com sucesso. Continue enviando os demais arquivos e depois inicie a anÃ¡lise interna.', 'success')
    } finally {
      setUploading(false)
    }
  }

  const removeDoc = async (id: string) => {
    const confirmed = window.confirm('Deseja remover este documento?')
    if (!confirmed) return
    setUploading(true)
    setError(null)
    try {
      const res = await fetch(`/api/kyc-documents/${id}`, { method: 'DELETE' })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        const message = toUserFacingError(json?.error, 'NÃ£o foi possÃ­vel remover o documento. Tente novamente.', `/api/kyc-documents/${id}`)
        setError(message)
        pushToast(message, 'error')
        return
      }
      setDocs((current) => current.filter((doc) => doc.id !== id))
      if (kycId) await loadDocs(kycId)
      const nextReceivers = await loadReceivers()
      syncActiveReceiver(nextReceivers, String(active?.id ?? ''))
      pushToast('Documento removido com sucesso.', 'success')
    } finally {
      setUploading(false)
    }
  }

  const saveReceiver = async () => {
    if (!active?.id) return
    const nameTrim = name.trim()
    if (nameTrim.length < 2) {
      const message = 'Informe o nome do recebedor.'
      setError(message)
      emitAppToast({ tone: 'warning', title: 'Erro de validaÃ§Ã£o', message })
      return
    }
    const inferred = inferPersonTypeFromDocument(document)
    if (!validateDocument(document)) {
      const message = 'Documento invÃ¡lido. Informe um CPF/CNPJ vÃ¡lido.'
      setError(message)
      emitAppToast({ tone: 'warning', title: 'Erro de validaÃ§Ã£o', message })
      return
    }
    if (inferred && inferred !== type) {
      const message = 'Tipo incompatÃ­vel com o documento. Ajuste para PF/PJ conforme CPF/CNPJ.'
      setError(message)
      emitAppToast({ tone: 'warning', title: 'Erro de validaÃ§Ã£o', message })
      return
    }
    const emailTrim = email.trim()
    if (!validateEmail(emailTrim)) {
      const message = 'E-mail invÃ¡lido.'
      setError(message)
      emitAppToast({ tone: 'warning', title: 'Erro de validaÃ§Ã£o', message })
      return
    }
    const phoneDigits = onlyDigits(phone)
    if (phoneDigits && phoneDigits.length < 10) {
      const message = 'Telefone invÃ¡lido.'
      setError(message)
      emitAppToast({ tone: 'warning', title: 'Erro de validaÃ§Ã£o', message })
      return
    }
    if (birthDate && !validateBirthDate(birthDate)) {
      const message = 'Data de nascimento invÃ¡lida.'
      setError(message)
      emitAppToast({ tone: 'warning', title: 'Erro de validaÃ§Ã£o', message })
      return
    }
    if (legalResponsibleDocument && !validateDocument(legalResponsibleDocument)) {
      const message = 'CPF do responsÃ¡vel legal invÃ¡lido.'
      setError(message)
      emitAppToast({ tone: 'warning', title: 'Erro de validaÃ§Ã£o', message })
      return
    }
    const bankCodeDigits = onlyDigits(bankCode)
    const bankAgencyDigits = onlyDigits(bankAgency)
    const bankAccountDigits = onlyDigits(bankAccount)
    const bankAccountDigitDigits = onlyDigits(bankAccountDigit)
    const hasAnyBankField = [bankCodeDigits, bankAgencyDigits, bankAccountDigits, bankAccountDigitDigits, pixKey.trim()].some(Boolean)
    if (hasAnyBankField && bankCodeDigits.length !== 3) {
      const message = 'Banco invÃ¡lido. Informe o cÃ³digo com 3 dÃ­gitos.'
      setError(message)
      emitAppToast({ tone: 'warning', title: 'Erro de validaÃ§Ã£o', message })
      return
    }
    if (hasAnyBankField && !bankAgencyDigits) {
      const message = 'AgÃªncia invÃ¡lida.'
      setError(message)
      emitAppToast({ tone: 'warning', title: 'Erro de validaÃ§Ã£o', message })
      return
    }
    if (hasAnyBankField && !bankAccountDigits) {
      const message = 'Conta invÃ¡lida.'
      setError(message)
      emitAppToast({ tone: 'warning', title: 'Erro de validaÃ§Ã£o', message })
      return
    }
    if (bankAccountDigitDigits && bankAccountDigitDigits.length > 2) {
      const message = 'DÃ­gito da conta invÃ¡lido.'
      setError(message)
      emitAppToast({ tone: 'warning', title: 'Erro de validaÃ§Ã£o', message })
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/receivers/${active.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type,
          name: nameTrim,
          legalName: legalName || null,
          tradeName: tradeName || null,
          document,
          birthDate: birthDate || null,
          legalResponsibleName: legalResponsibleName || null,
          legalResponsibleDocument: legalResponsibleDocument || null,
          email: emailTrim || null,
          phone: phone || null,
          address: { zip: addrZip, street: addrStreet, number: addrNumber, complement: addrComplement, city: addrCity, state: addrState },
          bankAccount: { bank_code: bankCodeDigits || null, agency: bankAgencyDigits || null, account: bankAccountDigits || null, account_digit: bankAccountDigitDigits || null, account_type: bankAccountType || null, pix_key: pixKey || null },
        }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        logError('RecipientsScreen: saveReceiver failed', { id: active.id, status: res.status, error: json?.error })
        setError(toUserFacingError(json?.error, 'Ocorreu um erro ao salvar o recebedor. Tente novamente.', `/api/receivers/${active.id}`))
        return
      }
      const nextReceivers = await loadReceivers()
      syncActiveReceiver(nextReceivers, String(active.id))
      pushToast('Dados do recebedor salvos. Agora vocÃª jÃ¡ pode seguir com o KYC.', 'success')
      emitAppToast({ tone: 'success', title: 'Recebedor salvo', message: 'Dados do recebedor salvos. Agora vocÃª jÃ¡ pode seguir com o KYC.' })
    } finally {
      setSaving(false)
    }
  }

  const createReceiver = useCallback(async () => {
    setError(null)
    const name = await prompt({ title: 'Adicionar recebedor', label: 'Nome do recebedor', placeholder: 'Ex: JoÃ£o da Silva', requiredMessage: 'Informe o nome do recebedor.' })
    if (!name) return
    const document = await prompt({
      title: 'Adicionar recebedor',
      label: 'CPF/CNPJ do recebedor',
      placeholder: '000.000.000-00',
      normalize: maskCpfCnpj,
      requiredMessage: 'Informe o CPF/CNPJ do recebedor.',
    })
    if (!document) return
    if (name.trim().length < 2) {
      const message = 'Informe um nome vÃ¡lido.'
      setError(message)
      emitAppToast({ tone: 'warning', title: 'Erro de validaÃ§Ã£o', message })
      return
    }
    if (!validateDocument(document)) {
      const message = 'Documento invÃ¡lido. Informe um CPF/CNPJ vÃ¡lido.'
      setError(message)
      emitAppToast({ tone: 'warning', title: 'Erro de validaÃ§Ã£o', message })
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/receivers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, document, bankAccount: {} }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        logError('RecipientsScreen: create receiver failed', { status: res.status, error: json?.error })
        setError(toUserFacingError(json?.error, 'Ocorreu um erro ao criar o recebedor. Tente novamente.', '/api/receivers'))
        return
      }
      await loadReceivers()
      pushToast('Recebedor criado com sucesso. O prÃ³ximo passo Ã© revisar os dados e iniciar o KYC.', 'success')
      emitAppToast({ tone: 'success', title: 'Recebedor criado', message: 'Recebedor criado com sucesso. O prÃ³ximo passo Ã© revisar os dados e iniciar o KYC.' })
    } finally {
      setLoading(false)
    }
  }, [loadReceivers, prompt, pushToast])

  const ReceiversGrid = useMemo(() => {
    return memo(function ReceiversGridImpl({
      receivers,
      loading,
      onSelect,
      onCreate,
    }: {
      receivers: any[]
      loading: boolean
      onSelect: (r: any) => void
      onCreate: () => void
    }) {
      return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
          {(!loading ? receivers : []).map((r) => {
            const internalStatus = String(r.internal_status ?? '')
            const statusLabel = internalStatus ? mapInternalStatusToPortuguese(internalStatus) : String(r.current_kyc_request_status ?? r.kyc_status ?? 'Pendente')
            const bank = typeof r.bank_account === 'object' && r.bank_account ? r.bank_account : null
            const bankStatus = bank && ((bank as any).bank_code || (bank as any).account || (bank as any).pix_key) ? 'Conta informada' : 'Conta pendente'
            return (
              <div
                key={r.id}
                style={{ background: 'linear-gradient(180deg, rgba(255,255,255,1) 0%, rgba(249,251,255,1) 100%)', borderRadius: 18, border: `1px solid ${BORDER}`, padding: '22px', boxShadow: '0 10px 26px rgba(2,27,91,.05)', cursor: 'pointer', transition: 'box-shadow .2s, transform .2s' }}
                onMouseEnter={(e) => { ;((e.currentTarget as HTMLElement).style.boxShadow = '0 16px 34px rgba(2,27,91,.1)'); ((e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)') }}
                onMouseLeave={(e) => { ;((e.currentTarget as HTMLElement).style.boxShadow = '0 10px 26px rgba(2,27,91,.05)'); ((e.currentTarget as HTMLElement).style.transform = 'translateY(0)') }}
                onClick={() => onSelect(r)}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{ width: 46, height: 46, borderRadius: 14, background: NAVY, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: F, fontWeight: 800, fontSize: 14, color: MINT, boxShadow: '0 10px 18px rgba(2,27,91,.16)' }}>
                    {initials(r.name ?? 'R')}
                  </div>
                  <Badge status={statusLabel} />
                </div>
                <p style={{ fontFamily: F, fontWeight: 700, fontSize: 14, color: TEXT, marginBottom: 2, lineHeight: 1.3 }}>{r.name}</p>
                <p style={{ fontFamily: MONO, fontSize: 11, color: MUTED, marginBottom: 10 }}>{r.document}</p>
                <p style={{ fontFamily: F, fontSize: 11, color: MUTED, marginBottom: 2 }}>PrÃ³ximo passo</p>
                <p style={{ fontFamily: F, fontSize: 12, color: TEXT, fontWeight: 600, marginBottom: 14 }}>{statusLabel}</p>
                <p style={{ fontFamily: F, fontSize: 11, color: MUTED, marginBottom: 2 }}>LiquidaÃ§Ã£o bancÃ¡ria</p>
                <p style={{ fontFamily: F, fontSize: 12, color: TEXT, fontWeight: 600, marginBottom: 14 }}>{bankStatus}</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, paddingTop: 14, borderTop: `1px solid ${BORDER}` }}>
                  <div>
                    <p style={{ fontFamily: F, fontSize: 11, color: MUTED, marginBottom: 2 }}>Saldo disponÃ­vel</p>
                    <p style={{ fontFamily: F, fontWeight: 800, fontSize: 17, color: TEXT, letterSpacing: '-0.02em' }}>{fmtBRL(0)}</p>
                  </div>
                  <div>
                    <p style={{ fontFamily: F, fontSize: 11, color: MUTED, marginBottom: 2 }}>Volume processado</p>
                    <p style={{ fontFamily: F, fontWeight: 700, fontSize: 14, color: NAVY }}>{fmtBRL(0)}</p>
                  </div>
                </div>
              </div>
            )
          })}
          {loading ? (
            <div style={{ gridColumn: '1/-1' }}>
              <TableSkeleton rows={6} cols={3} />
            </div>
          ) : receivers.length === 0 ? (
            <div style={{ gridColumn: '1/-1' }}>
              <EmptyState
                icon={<Users size={18} style={{ color: NAVY }} />}
                title="Nenhum recebedor cadastrado"
                description="Cadastre os dados de quem receberÃ¡ os valores da sua operaÃ§Ã£o. Depois disso, envie os documentos para anÃ¡lise interna."
                primaryAction={{ label: 'Adicionar recebedor', onClick: () => void onCreate(), loading }}
              />
            </div>
          ) : null}
        </div>
      )
    })
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {toast ? <Toast tone={toast.tone}>{toast.message}</Toast> : null}
      <Notice>{buildReceiverEducationMessage()}</Notice>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
        <GhostBtn disabled={loading || receivers.length === 0} onClick={() => void downloadFromApi('/api/receivers?format=csv', 'receivers.csv', 'Os recebedores foram exportados com os filtros atuais da organizacao.')}>
          <Download size={14} /> Exportar CSV
        </GhostBtn>
        <PrimaryBtn loading={loading} onClick={createReceiver}>
          <Plus size={15} /> Adicionar recebedor
        </PrimaryBtn>
      </div>
      {error && <Notice>{error}</Notice>}
      <ReceiversGrid receivers={receivers} loading={loading} onSelect={setActive} onCreate={createReceiver} />
      {active && (
        <Modal
          open={true}
          title="Recebedor e KYC interno"
          description="Complete os dados, envie os documentos e acompanhe a anÃ¡lise interna da Connekt Pay."
          onClose={() => setActive(null)}
          maxWidth={960}
          footer={
            <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontFamily: F, fontSize: 12.5, color: MUTED }}>{uploading ? 'Enviando...' : kycId ? `KYC: ${kycId}` : 'KYC nÃ£o iniciado'}</span>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <GhostBtn onClick={() => setActive(null)}>Fechar</GhostBtn>
                {kycId && <GhostBtn onClick={() => void loadDocs(kycId)}>Atualizar lista</GhostBtn>}
                <PrimaryBtn loading={saving} disabled={uploading || startingKyc} onClick={() => void saveReceiver()}>
                  {saving ? 'Salvando...' : 'Salvar dados'}
                </PrimaryBtn>
                {canStartInternalReview ? (
                  <button
                    disabled={startingKyc}
                    onClick={() => void startKyc()}
                    style={{
                      padding: '10px 14px',
                      borderRadius: 10,
                      border: 'none',
                      background: NAVY,
                      color: 'white',
                      fontFamily: F,
                      fontWeight: 800,
                      cursor: startingKyc ? 'default' : 'pointer',
                      opacity: startingKyc ? 0.7 : 1,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    {startingKyc ? <RefreshCw size={15} className="animate-spin" /> : null}
                    {startingKyc ? 'Iniciando...' : 'Iniciar anÃ¡lise interna'}
                  </button>
                ) : null}
              </div>
            </div>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            <div style={{ marginBottom: 18, padding: 14, borderRadius: 14, background: '#FAFBFD', border: `1px solid ${BORDER}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
                <div>
                  <p style={{ fontFamily: F, fontWeight: 800, fontSize: 13, color: TEXT, marginBottom: 4 }}>Progresso da configuracao</p>
                  <p style={{ fontFamily: F, fontSize: 12.5, color: MUTED }}>{receiverProgress.completed} de {receiverProgress.total} etapas concluidas</p>
                </div>
                <Badge status={activeInternalStatusLabel} />
              </div>
              <div style={{ width: '100%', height: 8, borderRadius: 999, background: '#E2E8F0', overflow: 'hidden', marginBottom: 10 }}>
                <div style={{ width: `${receiverProgress.percent}%`, height: '100%', background: NAVY, borderRadius: 999 }} />
              </div>
              <Notice style={{ marginBottom: 0 }}>{buildKycEducationMessage()}</Notice>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginTop: 12 }}>
                <div style={{ background: 'white', borderRadius: 12, border: `1px solid ${BORDER}`, padding: 12 }}>
                  <p style={{ fontFamily: F, fontSize: 11.5, color: MUTED, marginBottom: 4 }}>Status interno</p>
                  <p style={{ fontFamily: F, fontWeight: 800, fontSize: 13.5, color: TEXT }}>{activeInternalStatusLabel}</p>
                </div>
                <div style={{ background: 'white', borderRadius: 12, border: `1px solid ${BORDER}`, padding: 12 }}>
                  <p style={{ fontFamily: F, fontSize: 11.5, color: MUTED, marginBottom: 4 }}>AnÃ¡lise documental</p>
                  <p style={{ fontFamily: F, fontWeight: 800, fontSize: 13.5, color: TEXT }}>{activeKycLabel}</p>
                </div>
                <div style={{ background: 'white', borderRadius: 12, border: `1px solid ${BORDER}`, padding: 12 }}>
                  <p style={{ fontFamily: F, fontSize: 11.5, color: MUTED, marginBottom: 4 }}>PrÃ³ximo passo</p>
                  <p style={{ fontFamily: F, fontWeight: 700, fontSize: 13, color: TEXT, lineHeight: 1.45 }}>{nextStepMessage}</p>
                </div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
              <div>
                <p style={{ fontFamily: F, fontWeight: 700, fontSize: 12, color: NAVY, marginBottom: 6 }}>Tipo</p>
                <select value={type} onChange={(e) => setType(e.target.value === 'pj' ? 'pj' : 'pf')} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${BORDER}`, fontFamily: F, fontWeight: 700 }}>
                  <option value="pf">Pessoa FÃ­sica</option>
                  <option value="pj">Pessoa JurÃ­dica</option>
                </select>
              </div>
              <div>
                <p style={{ fontFamily: F, fontWeight: 700, fontSize: 12, color: NAVY, marginBottom: 6 }}>Nome</p>
                <input placeholder="Ex: JoÃ£o da Silva" value={name} onChange={(e) => setName(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${BORDER}`, fontFamily: F, fontWeight: 700 }} />
              </div>
              <div>
                <p style={{ fontFamily: F, fontWeight: 700, fontSize: 12, color: NAVY, marginBottom: 6 }}>RazÃ£o social</p>
                <input placeholder="Preencha se o recebedor for empresa" value={legalName} onChange={(e) => setLegalName(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${BORDER}`, fontFamily: F, fontWeight: 700 }} />
              </div>
              <div>
                <p style={{ fontFamily: F, fontWeight: 700, fontSize: 12, color: NAVY, marginBottom: 6 }}>Nome fantasia</p>
                <input placeholder="Preencha se o recebedor for empresa" value={tradeName} onChange={(e) => setTradeName(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${BORDER}`, fontFamily: F, fontWeight: 700 }} />
              </div>
              <div>
                <p style={{ fontFamily: F, fontWeight: 700, fontSize: 12, color: NAVY, marginBottom: 6 }}>CPF/CNPJ</p>
                <input
                  placeholder="Informe o documento do recebedor"
                  value={document}
                  onChange={(e) =>
                    applyMaskKeepingCaret(e, (v) => {
                      setDocument(v)
                      const inferred = inferPersonTypeFromDocument(v)
                      if (inferred) setType(inferred)
                    }, maskCpfCnpj)
                  }
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${BORDER}`, fontFamily: MONO, fontWeight: 700 }}
                />
              </div>
              <div>
                <p style={{ fontFamily: F, fontWeight: 700, fontSize: 12, color: NAVY, marginBottom: 6 }}>E-mail</p>
                <input placeholder="recebedor@empresa.com" value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${BORDER}`, fontFamily: F, fontWeight: 700 }} />
              </div>
              <div>
                <p style={{ fontFamily: F, fontWeight: 700, fontSize: 12, color: NAVY, marginBottom: 6 }}>Telefone</p>
                <input placeholder="(11) 99999-0000" value={phone} onChange={(e) => applyMaskKeepingCaret(e, setPhone, maskPhoneBR)} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${BORDER}`, fontFamily: F, fontWeight: 700 }} />
              </div>
              {type === 'pf' ? (
                <div>
                  <p style={{ fontFamily: F, fontWeight: 700, fontSize: 12, color: NAVY, marginBottom: 6 }}>Data de nascimento</p>
                  <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${BORDER}`, fontFamily: F, fontWeight: 700 }} />
                </div>
              ) : (
                <>
                  <div>
                    <p style={{ fontFamily: F, fontWeight: 700, fontSize: 12, color: NAVY, marginBottom: 6 }}>ResponsÃ¡vel legal</p>
                    <input placeholder="Nome completo do responsÃ¡vel" value={legalResponsibleName} onChange={(e) => setLegalResponsibleName(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${BORDER}`, fontFamily: F, fontWeight: 700 }} />
                  </div>
                  <div>
                    <p style={{ fontFamily: F, fontWeight: 700, fontSize: 12, color: NAVY, marginBottom: 6 }}>CPF do responsÃ¡vel</p>
                    <input value={legalResponsibleDocument} onChange={(e) => applyMaskKeepingCaret(e, setLegalResponsibleDocument, maskCpfCnpj)} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${BORDER}`, fontFamily: MONO, fontWeight: 700 }} />
                  </div>
                </>
              )}
            </div>
            <div style={{ paddingTop: 18, marginTop: 18, borderTop: `1px solid ${BORDER}` }}>
              <p style={{ fontFamily: F, fontWeight: 800, color: TEXT, fontSize: 13, marginBottom: 10 }}>EndereÃ§o</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                <div>
                  <p style={{ fontFamily: F, fontWeight: 700, fontSize: 12, color: NAVY, marginBottom: 6 }}>CEP</p>
                  <input value={addrZip} onChange={(e) => applyMaskKeepingCaret(e, setAddrZip, (v) => onlyDigits(v).slice(0, 8))} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${BORDER}`, fontFamily: MONO, fontWeight: 700 }} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <p style={{ fontFamily: F, fontWeight: 700, fontSize: 12, color: NAVY, marginBottom: 6 }}>Rua</p>
                  <input value={addrStreet} onChange={(e) => setAddrStreet(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${BORDER}`, fontFamily: F, fontWeight: 700 }} />
                </div>
                <div>
                  <p style={{ fontFamily: F, fontWeight: 700, fontSize: 12, color: NAVY, marginBottom: 6 }}>NÃºmero</p>
                  <input value={addrNumber} onChange={(e) => setAddrNumber(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${BORDER}`, fontFamily: F, fontWeight: 700 }} />
                </div>
                <div>
                  <p style={{ fontFamily: F, fontWeight: 700, fontSize: 12, color: NAVY, marginBottom: 6 }}>Complemento</p>
                  <input value={addrComplement} onChange={(e) => setAddrComplement(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${BORDER}`, fontFamily: F, fontWeight: 700 }} />
                </div>
                <div>
                  <p style={{ fontFamily: F, fontWeight: 700, fontSize: 12, color: NAVY, marginBottom: 6 }}>Cidade</p>
                  <input value={addrCity} onChange={(e) => setAddrCity(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${BORDER}`, fontFamily: F, fontWeight: 700 }} />
                </div>
                <div>
                  <p style={{ fontFamily: F, fontWeight: 700, fontSize: 12, color: NAVY, marginBottom: 6 }}>UF</p>
                  <input value={addrState} onChange={(e) => setAddrState(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${BORDER}`, fontFamily: MONO, fontWeight: 700 }} />
                </div>
              </div>
            </div>
            <div style={{ paddingTop: 18, marginTop: 18, borderTop: `1px solid ${BORDER}` }}>
              <p style={{ fontFamily: F, fontWeight: 800, color: TEXT, fontSize: 13, marginBottom: 10 }}>Dados bancÃ¡rios</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                <div>
                  <p style={{ fontFamily: F, fontWeight: 700, fontSize: 12, color: NAVY, marginBottom: 6 }}>Banco</p>
                  <input placeholder="Ex: 001" value={bankCode} onChange={(e) => applyMaskKeepingCaret(e, setBankCode, (v) => onlyDigits(v).slice(0, 3))} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${BORDER}`, fontFamily: MONO, fontWeight: 700 }} />
                </div>
                <div>
                  <p style={{ fontFamily: F, fontWeight: 700, fontSize: 12, color: NAVY, marginBottom: 6 }}>AgÃªncia</p>
                  <input placeholder="Informe a agÃªncia" value={bankAgency} onChange={(e) => applyMaskKeepingCaret(e, setBankAgency, (v) => onlyDigits(v).slice(0, 6))} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${BORDER}`, fontFamily: MONO, fontWeight: 700 }} />
                </div>
                <div>
                  <p style={{ fontFamily: F, fontWeight: 700, fontSize: 12, color: NAVY, marginBottom: 6 }}>Conta</p>
                  <input placeholder="Informe os dados bancÃ¡rios para recebimento" value={bankAccount} onChange={(e) => applyMaskKeepingCaret(e, setBankAccount, (v) => onlyDigits(v).slice(0, 14))} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${BORDER}`, fontFamily: MONO, fontWeight: 700 }} />
                </div>
                <div>
                  <p style={{ fontFamily: F, fontWeight: 700, fontSize: 12, color: NAVY, marginBottom: 6 }}>DÃ­gito</p>
                  <input value={bankAccountDigit} onChange={(e) => applyMaskKeepingCaret(e, setBankAccountDigit, (v) => onlyDigits(v).slice(0, 2))} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${BORDER}`, fontFamily: MONO, fontWeight: 700 }} />
                </div>
                <div>
                  <p style={{ fontFamily: F, fontWeight: 700, fontSize: 12, color: NAVY, marginBottom: 6 }}>Tipo de conta</p>
                  <select value={bankAccountType} onChange={(e) => setBankAccountType(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${BORDER}`, fontFamily: F, fontWeight: 700 }}>
                    <option value="corrente">Conta corrente</option>
                    <option value="poupanca">Conta poupanca</option>
                    <option value="pagamento">Conta de pagamento</option>
                  </select>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <p style={{ fontFamily: F, fontWeight: 700, fontSize: 12, color: NAVY, marginBottom: 6 }}>Chave PIX</p>
                  <input value={pixKey} onChange={(e) => setPixKey(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${BORDER}`, fontFamily: F, fontWeight: 700 }} />
                </div>
              </div>
            </div>
            <div style={{ paddingTop: 18, marginTop: 18, borderTop: `1px solid ${BORDER}` }}>
              <p style={{ fontFamily: F, fontWeight: 800, color: TEXT, fontSize: 13, marginBottom: 10 }}>Documentos</p>
              <p style={{ fontFamily: F, fontSize: 12, color: MUTED, marginBottom: 12 }}>
                Esta análise é interna da Connekt Pay. A sincronização com o provedor financeiro será habilitada após a homologação da integração.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
                {requiredDocuments.map((docType) => (
                  <div key={docType} style={{ background: FAINT, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14 }}>
                    <p style={{ fontFamily: F, fontWeight: 700, color: TEXT, fontSize: 12.5, marginBottom: 8 }}>
                      {getKycDocumentLabel(docType)}
                    </p>
                    <p style={{ fontFamily: F, fontSize: 11.5, color: MUTED, marginBottom: 10 }}>Aceita PDF, JPG, PNG ou WEBP com atÃ© 10 MB.</p>
                    <input
                      type="file"
                      disabled={uploading}
                      accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                      style={{ width: '100%', maxWidth: '100%' }}
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (!f) return
                        void uploadDoc(docType, f)
                      }}
                    />
                  </div>
                ))}
              </div>
              {docs.length > 0 && (
                <div style={{ marginTop: 14, background: 'white', borderRadius: 12, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
                  <div style={{ padding: '10px 12px', borderBottom: `1px solid ${BORDER}`, fontFamily: F, fontWeight: 800, color: TEXT, fontSize: 12.5 }}>Arquivos enviados</div>
                  <div style={{ padding: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
                    {docs.slice(0, 8).map((d) => (
                      <div key={d.id} style={{ background: FAINT, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 10 }}>
                        <p style={{ fontFamily: F, fontSize: 11.5, color: MUTED, marginBottom: 6 }}>{getKycDocumentLabel(d.doc_type)}</p>
                        <p style={{ fontFamily: F, fontSize: 12.5, color: TEXT, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(d.original_filename ?? d.storage_path ?? '')}</p>
                        <p style={{ fontFamily: MONO, fontSize: 10.5, color: MUTED, marginTop: 6 }}>{String(d.status ?? 'uploaded')}</p>
                        <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {typeof d.signed_url === 'string' && d.signed_url ? (
                            <GhostBtn
                              disabled={uploading}
                              onClick={() => {
                                window.open(String(d.signed_url), '_blank', 'noopener,noreferrer')
                              }}
                            >
                              <Eye size={12} /> Visualizar
                            </GhostBtn>
                          ) : null}
                          <GhostBtn disabled={uploading} onClick={() => void removeDoc(String(d.id))}>
                            Remover
                          </GhostBtn>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}
      {promptDialog}
    </div>
  )
}

export function LedgerScreen() {
  const tc = (t: string) =>
    ['Venda', 'AntecipaÃ§Ã£o'].includes(t)
      ? { bg: '#ECFDF5', text: '#059669' }
      : ['Taxa Connekt', 'Split', 'Repasse', 'Estorno'].includes(t)
        ? { bg: '#FEF2F2', text: '#DC2626' }
        : { bg: FAINT, text: MUTED }
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [balance, setBalance] = useState(0)
  const [entries, setEntries] = useState<any[]>([])

  useEffect(() => {
    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch('/api/ledger', { method: 'GET' })
        const json = await res.json().catch(() => null)
        if (!res.ok) {
          setError(toUserFacingError(json?.error, 'Ocorreu um erro ao carregar o ledger. Tente novamente.', '/api/ledger'))
          setEntries([])
          setBalance(0)
          return
        }
        setBalance(Number(json?.balance ?? 0))
        setEntries(Array.isArray(json?.ledgerEntries) ? json.ledgerEntries : [])
      } catch (e) {
        logError('LedgerScreen load failed', e)
        setError('Ocorreu um erro ao carregar o ledger. Tente novamente.')
      } finally {
        setLoading(false)
      }
    }
    void run()
  }, [])

  const credits = entries.filter((e) => e.direction === 'credit').reduce((acc, e) => acc + Number(e.amount ?? 0), 0)
  const debits = entries.filter((e) => e.direction === 'debit').reduce((acc, e) => acc + Number(e.amount ?? 0), 0)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
        {[
          { l: 'Saldo atual', v: loading ? 'â€”' : fmtBRL(balance), sub: 'Atualizado agora', accent: true },
          { l: 'CrÃ©ditos', v: loading ? 'â€”' : fmtBRL(credits), sub: 'Total de entradas', accent: false },
          { l: 'DÃ©bitos', v: loading ? 'â€”' : fmtBRL(debits), sub: 'Total de saÃ­das', accent: false },
        ].map(({ l, v, sub, accent }) => (
          <div key={l} style={{ background: accent ? NAVY : 'white', borderRadius: 16, border: accent ? 'none' : `1px solid ${BORDER}`, padding: '22px 24px', boxShadow: accent ? `0 4px 20px rgba(2,27,91,.28)` : '0 1px 4px rgba(2,27,91,.04)' }}>
            <p style={{ fontFamily: F, fontSize: 12, color: accent ? 'rgba(255,255,255,.5)' : MUTED, marginBottom: 6 }}>{l}</p>
            <p style={{ fontFamily: F, fontWeight: 800, fontSize: 22, color: accent ? 'white' : TEXT, letterSpacing: '-0.02em' }}>{v}</p>
            <p style={{ fontFamily: F, fontSize: 11, color: accent ? 'rgba(255,255,255,.3)' : '#94A3B8', marginTop: 4 }}>{sub}</p>
          </div>
        ))}
      </div>
      {error && <Notice>{error}</Notice>}
      <TableCard>
        <div style={{ padding: '18px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <p style={{ fontFamily: F, fontWeight: 700, fontSize: 15, color: TEXT }}>Extrato completo</p>
          <button
            disabled={loading || entries.length === 0}
            onClick={() => {
              const rows = entries.map((e: any) => ({
                occurred_at: e.occurred_at ?? null,
                type: e.type ?? null,
                direction: e.direction ?? null,
                amount_cents: e.amount ?? null,
                balance_after_cents: e.balance_after ?? null,
                origin: e.origin ?? null,
              }))
              downloadCsv('ledger.csv', rows)
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              borderRadius: 9,
              fontFamily: F,
              fontWeight: 600,
              fontSize: 12.5,
              color: MUTED,
              background: 'white',
              border: `1px solid ${BORDER}`,
              cursor: loading || entries.length === 0 ? 'default' : 'pointer',
              opacity: loading || entries.length === 0 ? 0.6 : 1,
            }}
          >
            <Download size={13} /> Exportar CSV
          </button>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#FAFBFD' }}>{['Data', 'Tipo', 'CrÃ©dito', 'DÃ©bito', 'Saldo apÃ³s', 'Origem'].map((h) => <Th key={h}>{h}</Th>)}</tr>
          </thead>
          <tbody>
            {(!loading ? entries : []).map((row, i) => {
              const typeLabel = String(row.type ?? 'â€”')
              const c = tc(typeLabel)
              const occurred = row.occurred_at ? new Date(row.occurred_at as string).toLocaleString('pt-BR') : 'â€”'
              const credit = row.direction === 'credit' ? Number(row.amount ?? 0) : 0
              const debit = row.direction === 'debit' ? Number(row.amount ?? 0) : 0
              return (
                <tr key={i} style={{ transition: 'background .12s' }} onMouseEnter={(e) => (e.currentTarget.style.background = FAINT)} onMouseLeave={(e) => (e.currentTarget.style.background = '')}>
                  <Td mono>
                    <span style={{ color: MUTED }}>{occurred}</span>
                  </Td>
                  <td style={{ padding: '13px 20px', borderBottom: `1px solid ${BORDER}` }}>
                    <span style={{ fontFamily: F, fontWeight: 600, fontSize: 12, padding: '3px 9px', borderRadius: 6, background: c.bg, color: c.text }}>{typeLabel}</span>
                  </td>
                  <td style={{ padding: '13px 20px', borderBottom: `1px solid ${BORDER}`, fontFamily: MONO, fontSize: 13 }}>
                    {credit ? <span style={{ color: '#059669', fontWeight: 700 }}>+ {fmtBRL(credit)}</span> : <span style={{ color: '#CBD5E1' }}>â€”</span>}
                  </td>
                  <td style={{ padding: '13px 20px', borderBottom: `1px solid ${BORDER}`, fontFamily: MONO, fontSize: 13 }}>
                    {debit ? <span style={{ color: '#DC2626', fontWeight: 700 }}>âˆ’ {fmtBRL(debit)}</span> : <span style={{ color: '#CBD5E1' }}>â€”</span>}
                  </td>
                  <Td>
                    <span style={{ fontFamily: MONO, fontWeight: 700 }}>{fmtBRL(Number(row.balance_after ?? 0))}</span>
                  </Td>
                  <td style={{ padding: '13px 20px', borderBottom: `1px solid ${BORDER}` }}>
                    <span style={{ fontFamily: MONO, fontSize: 11.5, color: MUTED }}>{String(row.origin ?? 'â€”')}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {loading ? (
          <TableSkeleton rows={7} cols={6} />
        ) : entries.length === 0 ? (
          <EmptyState icon={<Database size={18} style={{ color: NAVY }} />} title="Nenhum lanÃ§amento encontrado" description="Quando houver movimentaÃ§Ã£o, o extrato aparecerÃ¡ aqui." />
        ) : null}
      </TableCard>
    </div>
  )
}

export function AnticipationScreen() {
  const { confirm, confirmDialog } = useConfirmDialog()
  const [requestOpen, setRequestOpen] = useState(false)
  const [confirmationOpen, setConfirmationOpen] = useState(false)
  const [confirmation, setConfirmation] = useState<null | { requestedCents: number; feeCents: number; netCents: number; receiverLabel: string; simulated: boolean }>(null)
  const [submitting, setSubmitting] = useState(false)
  const [cancelingId, setCancelingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [amountBRL, setAmountBRL] = useState('')
  const [list, setList] = useState<any[]>([])
  const [receivers, setReceivers] = useState<any[]>([])
  const [receiverId, setReceiverId] = useState<string>('')
  const [availableCents, setAvailableCents] = useState<number>(0)
  const [balanceCents, setBalanceCents] = useState<number>(0)
  const [reservedCents, setReservedCents] = useState<number>(0)
  const [feeBps, setFeeBps] = useState<number>(400)
  const [feeCents, setFeeCents] = useState<number>(0)
  const [netCents, setNetCents] = useState<number>(0)

  const parseAmountBRL = (input: string) => {
    const normalized = input.replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, '')
    const value = Number(normalized)
    if (!Number.isFinite(value) || value <= 0) return null
    return Math.round(value * 100)
  }

  useEffect(() => {
    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        const [listRes, availRes, recRes] = await Promise.all([
          fetch('/api/anticipation', { method: 'GET' }),
          fetch('/api/anticipation/simulate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) }),
          fetch('/api/receivers', { method: 'GET' }),
        ])
        const listJson = await listRes.json().catch(() => null)
        const availJson = await availRes.json().catch(() => null)
        const recJson = await recRes.json().catch(() => null)
        if (!listRes.ok) {
          setError(toUserFacingError(listJson?.error, 'Ocorreu um erro ao carregar antecipaÃ§Ãµes. Tente novamente.', '/api/anticipation'))
          setList([])
        } else {
          setList(Array.isArray(listJson?.anticipations) ? listJson.anticipations : [])
        }
        if (availRes.ok) {
          setAvailableCents(Number(availJson?.availableCents ?? 0))
          setBalanceCents(Number(availJson?.balanceCents ?? 0))
          setReservedCents(Number(availJson?.reservedCents ?? 0))
          setFeeBps(typeof availJson?.feeBpsDefault === 'number' ? Number(availJson.feeBpsDefault) : 400)
        }
        if (recRes.ok) {
          const rs = Array.isArray(recJson?.receivers) ? recJson.receivers : []
          const approved = rs.filter((r: any) => String(r.status ?? 'active') === 'active' && String(r.kyc_status ?? 'pending') === 'approved')
          setReceivers(approved)
          setReceiverId(approved[0]?.id ?? '')
        }
      } catch (e) {
        logError('AnticipationScreen load failed', e)
        setError('Ocorreu um erro ao carregar antecipaÃ§Ãµes. Tente novamente.')
      } finally {
        setLoading(false)
      }
    }
    void run()
  }, [])

  useEffect(() => {
    if (!requestOpen) return
    const req = parseAmountBRL(amountBRL)
    if (!req) {
      setFeeCents(0)
      setNetCents(0)
      return
    }
    const fee = Math.round((req * feeBps) / 10_000)
    setFeeCents(fee)
    setNetCents(Math.max(0, req - fee))
  }, [amountBRL, feeBps, requestOpen])

  const requested = parseAmountBRL(amountBRL)
  const canOpenRequest = !loading && receivers.length > 0 && availableCents > 0
  const canConfirm = !!requested && requested > 0 && requested <= availableCents && !!receiverId && receivers.length > 0 && !loading && !submitting
  const selectedReceiver = receivers.find((r: any) => r.id === receiverId) ?? null
  const receiverLabel = selectedReceiver ? `${selectedReceiver?.name ?? ''} Â· ${selectedReceiver?.document ?? ''}` : ''
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          <KpiCard label="Saldo disponÃ­vel" value={fmtBRL(balanceCents)} sub="Saldo consolidado em conta" icon={Wallet} loading={loading} />
          <KpiCard label="Valor antecipÃ¡vel" value={fmtBRL(availableCents)} sub={`Reservado: ${fmtBRL(reservedCents)}`} icon={TrendingUp} loading={loading} />
          <KpiCard label="Taxa aplicada" value={`${(feeBps / 100).toFixed(2).replace('.', ',')}%`} sub="ReferÃªncia atual da operaÃ§Ã£o" icon={Zap} loading={loading} />
          <KpiCard label="Valor lÃ­quido estimado" value={requestOpen ? fmtBRL(netCents) : 'â€”'} sub="ApÃ³s desconto da taxa" icon={CheckCircle2} trend="up" />
        </div>
        <div style={{ background: 'white', borderRadius: 16, border: `1px solid ${BORDER}`, padding: '28px', boxShadow: '0 1px 4px rgba(2,27,91,.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div>
              <p style={{ fontFamily: F, fontWeight: 700, fontSize: 16, color: TEXT }}>Simular antecipaÃ§Ã£o</p>
              <p style={{ fontFamily: F, fontSize: 13, color: MUTED, marginTop: 3 }}>Revise o valor lÃ­quido estimado antes de enviar uma solicitaÃ§Ã£o. Este fluxo serÃ¡ liberado assim que a configuraÃ§Ã£o financeira estiver concluÃ­da.</p>
            </div>
            <PrimaryBtn
              disabled={!canOpenRequest}
              onClick={() => {
                if (!canOpenRequest) return
                const initialAmount = availableCents > 0 ? maskBRLInput((availableCents / 100).toFixed(2).replace('.', ',')) : ''
                setAmountBRL(initialAmount)
                setRequestOpen(true)
              }}
            >
              <Zap size={15} /> Simular antecipaÃ§Ã£o
            </PrimaryBtn>
          </div>
          {error && <Notice style={{ marginBottom: 12 }}>{error}</Notice>}
          {!loading && !canOpenRequest ? (
            <Notice style={{ marginBottom: 12 }}>
              {receivers.length === 0
                ? 'Cadastre um recebedor com KYC aprovado para liberar este fluxo assim que a configuraÃ§Ã£o financeira estiver concluÃ­da.'
                : 'No momento nÃ£o hÃ¡ valor disponÃ­vel para simulaÃ§Ã£o. Este fluxo serÃ¡ liberado assim que a configuraÃ§Ã£o financeira estiver concluÃ­da.'}
            </Notice>
          ) : null}
          <TableCard>
            <div style={{ padding: '14px 20px', borderBottom: `1px solid ${BORDER}` }}>
              <p style={{ fontFamily: F, fontWeight: 600, fontSize: 14, color: TEXT }}>HistÃ³rico de solicitaÃ§Ãµes</p>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#FAFBFD' }}>{['Data', 'Valor solicitado', 'Valor lÃ­quido', 'Taxa', 'Status', 'AÃ§Ã£o'].map((h) => <Th key={h}>{h}</Th>)}</tr>
              </thead>
              <tbody>
                {(!loading ? list : []).map((a, i) => (
                  <tr key={i} style={{ transition: 'background .12s' }} onMouseEnter={(e) => (e.currentTarget.style.background = FAINT)} onMouseLeave={(e) => (e.currentTarget.style.background = '')}>
                    <Td mono>
                      <span style={{ color: MUTED }}>{new Date(a.created_at).toLocaleString('pt-BR')}</span>
                    </Td>
                    <Td>
                      <span style={{ fontWeight: 700 }}>{fmtBRL(Number(a.requested_amount_centavos ?? 0))}</span>
                    </Td>
                    <Td>
                      <span style={{ fontWeight: 700, color: '#059669' }}>{fmtBRL(Number(a.net_amount_centavos ?? 0))}</span>
                    </Td>
                    <Td>
                      <span style={{ fontFamily: MONO, color: MUTED }}>{`${(Number(a.fee_bps ?? 0) / 100).toFixed(2).replace('.', ',')}%`}</span>
                    </Td>
                    <td style={{ padding: '13px 20px', borderBottom: `1px solid ${BORDER}` }}>
                      <Badge status={(a as any)?.simulated ? 'Simulação interna' : String(a.status ?? 'â€”')} />
                    </td>
                    <td style={{ padding: '13px 20px', borderBottom: `1px solid ${BORDER}` }}>
                      {!(a as any)?.simulated && ['pending', 'approved', 'processing'].includes(String(a.status ?? '')) ? (
                        <button
                          onClick={async () => {
                            if (cancelingId) return
                            const ok = await confirm({
                              title: 'Cancelar antecipaÃ§Ã£o?',
                              description: 'A solicitaÃ§Ã£o serÃ¡ cancelada e deixarÃ¡ de ser processada.',
                              confirmLabel: 'Cancelar',
                              danger: true,
                            })
                            if (!ok) return
                            setError(null)
                            setCancelingId(String(a.id))
                            try {
                              const res = await fetch(`/api/anticipation/${a.id}/cancel`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) })
                              const json = await res.json().catch(() => null)
                              if (!res.ok) {
                                setError(toUserFacingError(json?.error, 'NÃ£o foi possÃ­vel cancelar a antecipaÃ§Ã£o. Tente novamente.', `/api/anticipation/${a.id}/cancel`))
                                return
                              }
                              const listRes = await fetch('/api/anticipation', { method: 'GET' })
                              const listJson = await listRes.json().catch(() => null)
                              if (listRes.ok) setList(Array.isArray(listJson?.anticipations) ? listJson.anticipations : [])
                            } finally {
                              setCancelingId(null)
                            }
                          }}
                          disabled={cancelingId === String(a.id)}
                          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 9, fontFamily: F, fontWeight: 700, fontSize: 12, color: NAVY, background: FAINT, border: `1px solid ${BORDER}`, cursor: cancelingId === String(a.id) ? 'default' : 'pointer', opacity: cancelingId === String(a.id) ? 0.7 : 1 }}
                        >
                          {cancelingId === String(a.id) ? <span className="inline-block w-4 h-4 rounded-full border-2 border-[#94A3B8] border-t-transparent animate-spin" /> : <XCircle size={12} />}
                          {cancelingId === String(a.id) ? 'Cancelandoâ€¦' : 'Cancelar'}
                        </button>
                      ) : (
                        <span style={{ fontFamily: F, fontSize: 12, color: MUTED }}>â€”</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {loading ? (
              <TableSkeleton rows={6} cols={6} />
            ) : list.length === 0 ? (
              <EmptyState icon={<Zap size={18} style={{ color: NAVY }} />} title="Nenhuma solicitaÃ§Ã£o registrada" description="Assim que houver simulaÃ§Ãµes ou envios de antecipaÃ§Ã£o, o histÃ³rico operacional aparecerÃ¡ aqui." />
            ) : null}
          </TableCard>
        </div>
      </div>
      <Modal
        open={requestOpen}
        title="Simular antecipaÃ§Ã£o"
        description="Simule o valor líquido antes do envio. Disponível após homologação da integração com o provedor financeiro."
        onClose={() => {
          if (submitting) return
          setRequestOpen(false)
        }}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
            <GhostBtn
              disabled={submitting}
              onClick={() => {
                setRequestOpen(false)
              }}
            >
              Cancelar
            </GhostBtn>
            <PrimaryBtn
              loading={submitting}
              disabled={!canConfirm}
              onClick={async () => {
                if (!canConfirm) return
                const requestedAmount = parseAmountBRL(amountBRL)
                if (!requestedAmount) return
                setError(null)
                setSubmitting(true)
                try {
                  const simRes = await fetch('/api/anticipation/simulate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ requestedAmountCents: requestedAmount }) })
                  const simJson = await simRes.json().catch(() => null)
                  if (!simRes.ok) {
                    setError(toUserFacingError(simJson?.error, 'Ocorreu um erro ao simular antecipaÃ§Ã£o. Tente novamente.', '/api/anticipation/simulate'))
                    return
                  }
                  const nextFeeBps = Number(simJson?.feeBps ?? feeBps)
                  const nextFeeCents = Number(simJson?.feeCents ?? 0)
                  const nextNetCents = Number(simJson?.netCents ?? 0)
                  setAvailableCents(Number(simJson?.availableAmountCents ?? availableCents))
                  setFeeBps(nextFeeBps)
                  setFeeCents(nextFeeCents)
                  setNetCents(nextNetCents)

                  const res = await fetch('/api/anticipation', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ requestedAmountCents: requestedAmount, recebedorId: receiverId || null, feeBps: nextFeeBps }) })
                  const json = await res.json().catch(() => null)
                  if (!res.ok) {
                    setError(toUserFacingError(json?.error, 'Ocorreu um erro ao solicitar antecipaÃ§Ã£o. Tente novamente.', '/api/anticipation'))
                    return
                  }
                  const listRes = await fetch('/api/anticipation', { method: 'GET' })
                  const listJson = await listRes.json().catch(() => null)
                  if (listRes.ok) setList(Array.isArray(listJson?.anticipations) ? listJson.anticipations : [])
                  setConfirmation({ requestedCents: requestedAmount, feeCents: nextFeeCents, netCents: nextNetCents, receiverLabel, simulated: false })
                  setConfirmationOpen(true)
                  setRequestOpen(false)
                } finally {
                  setSubmitting(false)
                }
              }}
            >
              Confirmar
            </PrimaryBtn>
          </div>
        }
      >
        <div style={{ display: 'grid', gap: 12 }}>
          <div>
            <ModalFieldLabel>Recebedor</ModalFieldLabel>
            <select
              value={receiverId}
              onChange={(e) => setReceiverId(e.target.value)}
              style={{ width: '100%', padding: '10px 14px', fontFamily: F, fontSize: 13.5, fontWeight: 700, background: 'white', border: `1px solid ${BORDER}`, borderRadius: 10, outline: 'none' }}
            >
              {receivers.map((r: any) => (
                <option key={r.id} value={r.id}>
                  {r.name} Â· {r.document}
                </option>
              ))}
            </select>
            {!loading && receivers.length === 0 && <p style={{ fontFamily: F, fontSize: 12, color: '#B45309', marginTop: 8 }}>Nenhum recebedor com KYC aprovado disponÃ­vel para antecipaÃ§Ã£o.</p>}
          </div>
          <div>
            <ModalFieldLabel>Valor a antecipar (R$)</ModalFieldLabel>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontFamily: F, fontWeight: 700, color: MUTED, fontSize: 13.5 }}>R$</span>
              <input
                type="text"
                value={amountBRL}
                onChange={(e) => applyMaskKeepingCaret(e, setAmountBRL, maskBRLInput)}
                style={{ width: '100%', paddingLeft: 40, paddingRight: 14, paddingTop: 10, paddingBottom: 10, fontFamily: F, fontSize: 13.5, fontWeight: 700, background: 'white', border: `1px solid ${BORDER}`, borderRadius: 10, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            {!!requested && requested > availableCents && <p style={{ fontFamily: F, fontSize: 12, color: '#DC2626', marginTop: 8 }}>Valor solicitado maior que o antecipÃ¡vel.</p>}
          </div>
          <div style={{ background: FAINT, borderRadius: 12, padding: '12px 14px', border: `1px solid ${BORDER}` }}>
            <p style={{ fontFamily: F, fontSize: 11.5, color: MUTED }}>Resumo da simulaÃ§Ã£o</p>
            <div style={{ height: 8 }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <span style={{ fontFamily: F, fontSize: 12.5, color: MUTED }}>Taxa</span>
              <span style={{ fontFamily: F, fontSize: 12.5, fontWeight: 800, color: TEXT }}>
                {(feeBps / 100).toFixed(2).replace('.', ',')}% Â· {fmtBRL(feeCents)}
              </span>
            </div>
            <div style={{ height: 6 }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <span style={{ fontFamily: F, fontSize: 12.5, color: MUTED }}>LÃ­quido estimado</span>
              <span style={{ fontFamily: F, fontSize: 12.5, fontWeight: 900, color: NAVY }}>{fmtBRL(netCents)}</span>
            </div>
          </div>
          <Notice>
            Taxas e valores finais podem variar. Enquanto a integração externa não estiver homologada, esta etapa permanece como simulação interna sem liquidação real no provedor.
          </Notice>
        </div>
      </Modal>
      <Modal
        open={confirmationOpen}
        title={confirmation?.simulated ? 'SolicitaÃ§Ã£o registrada (simulaÃ§Ã£o)' : 'SolicitaÃ§Ã£o enviada'}
        description={confirmation?.simulated ? 'Fluxo disponível para validação interna. A solicitação não representa liquidação real no provedor enquanto a integração externa permanecer desabilitada.' : 'A solicitação foi enviada. A confirmação financeira pode levar alguns instantes.'}
        onClose={() => {
          setConfirmationOpen(false)
          setConfirmation(null)
        }}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <PrimaryBtn
              onClick={() => {
                setConfirmationOpen(false)
                setConfirmation(null)
              }}
            >
              Fechar
            </PrimaryBtn>
          </div>
        }
      >
        <div style={{ display: 'grid', gap: 10, fontFamily: F, fontSize: 13, color: TEXT }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <span style={{ color: MUTED }}>Recebedor</span>
            <span style={{ fontWeight: 700, textAlign: 'right' }}>{confirmation?.receiverLabel ?? 'â€”'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <span style={{ color: MUTED }}>Valor solicitado</span>
            <span style={{ fontWeight: 800 }}>{confirmation ? fmtBRL(confirmation.requestedCents) : 'â€”'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <span style={{ color: MUTED }}>Taxa</span>
            <span style={{ fontWeight: 800 }}>{confirmation ? fmtBRL(confirmation.feeCents) : 'â€”'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <span style={{ color: MUTED }}>LÃ­quido estimado</span>
            <span style={{ fontWeight: 900, color: NAVY }}>{confirmation ? fmtBRL(confirmation.netCents) : 'â€”'}</span>
          </div>
          <div style={{ background: FAINT, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '10px 12px' }}>
            <p style={{ fontSize: 12.5, color: MUTED, marginBottom: 6 }}>Status</p>
            <p style={{ fontWeight: 900, color: confirmation?.simulated ? '#B45309' : TEXT }}>{confirmation?.simulated ? 'Confirmação financeira: simulação interna' : 'Em processamento'}</p>
          </div>
        </div>
      </Modal>
      {confirmDialog}
    </>
  )
}

function StatusDot({ ok, warn, label }: { ok?: boolean; warn?: boolean; label: string }) {
  const color = ok ? '#10B981' : warn ? '#F59E0B' : '#EF4444'
  const bg = ok ? '#ECFDF5' : warn ? '#FFFBEB' : '#FEF2F2'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, boxShadow: `0 0 0 3px ${color}22`, flexShrink: 0 }} />
      <span style={{ fontFamily: F, fontSize: 13, color: TEXT, flex: 1 }}>{label}</span>
      <span style={{ fontFamily: F, fontWeight: 600, fontSize: 11, padding: '2px 8px', borderRadius: 5, background: bg, color }}>
        {ok ? 'Operacional' : warn ? 'Degradado' : 'Offline'}
      </span>
    </div>
  )
}

export function AdminScreen() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadNonce, setReloadNonce] = useState(0)
  const [txs, setTxs] = useState<any[]>([])
  const [kyc, setKyc] = useState<any[]>([])
  const [receiversCount, setReceiversCount] = useState<number | null>(null)
  const [alerts, setAlerts] = useState<any[]>([])
  const [alertsUnreadCount, setAlertsUnreadCount] = useState(0)
  const [markingAlertsRead, setMarkingAlertsRead] = useState(false)
  const [alertActionId, setAlertActionId] = useState<string | null>(null)

  const applyAlertsPayload = useCallback((payload: any) => {
    setAlerts(Array.isArray(payload?.notifications) ? payload.notifications : [])
    setAlertsUnreadCount(Number(payload?.unreadCount ?? 0))
  }, [])

  const formatAlertTime = useCallback((value: string | null | undefined) => {
    if (!value) return 'Agora'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return 'Agora'
    return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false
    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        const [txRes, kycRes, recRes, notifRes] = await Promise.all([
          fetch('/api/transactions', { method: 'GET', signal: controller.signal, keepalive: true }),
          fetch('/api/kyc-requests', { method: 'GET', signal: controller.signal, keepalive: true }),
          fetch('/api/receivers', { method: 'GET', signal: controller.signal, keepalive: true }),
          fetch('/api/notifications?limit=6', { method: 'GET', signal: controller.signal, keepalive: true }),
        ])
        const txJson = await txRes.json().catch(() => null)
        const kycJson = await kycRes.json().catch(() => null)
        const recJson = await recRes.json().catch(() => null)
        const notifJson = await notifRes.json().catch(() => null)
        const partialErrors = [
          !txRes.ok ? toUserFacingError(txJson?.error, 'Nao foi possivel exibir as transacoes do painel agora. Tente novamente.', '/api/transactions') : null,
          !kycRes.ok ? toUserFacingError(kycJson?.error, 'Nao foi possivel carregar a fila de KYC agora. Tente novamente.', '/api/kyc-requests') : null,
          !recRes.ok ? toUserFacingError(recJson?.error, 'Nao foi possivel carregar os recebedores agora. Tente novamente.', '/api/receivers') : null,
          !notifRes.ok ? toUserFacingError(notifJson?.error, 'Nao foi possivel carregar os alertas agora. Tente novamente.', '/api/notifications') : null,
        ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0)

        if (!cancelled) {
          setError(partialErrors.length > 0 ? partialErrors[0] : null)
          setTxs(txRes.ok && Array.isArray(txJson?.transactions) ? txJson.transactions : [])
          setKyc(kycRes.ok && Array.isArray(kycJson?.kycRequests) ? kycJson.kycRequests : [])
          setReceiversCount(recRes.ok && Array.isArray(recJson?.receivers) ? recJson.receivers.length : null)
          applyAlertsPayload(notifRes.ok ? notifJson : null)
        }
      } catch (e) {
        if (cancelled || isAbortLikeError(e)) return
        logError('AdminScreen load failed', e)
        setError('Nao foi possivel exibir os dados do painel agora. Tente novamente.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [applyAlertsPayload, reloadNonce])

  const markAllAlertsAsRead = async () => {
    if (markingAlertsRead || alertsUnreadCount === 0) return
    setMarkingAlertsRead(true)
    try {
      const res = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ markAllRead: true }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setError(toUserFacingError(json?.error, 'Nao foi possivel atualizar os alertas agora. Tente novamente.', '/api/notifications'))
        return
      }
      applyAlertsPayload(json)
      emitAppToast({ tone: 'success', title: 'Alertas atualizados', message: 'Todos os alertas foram marcados como lidos.' })
    } catch (e) {
      if (isAbortLikeError(e)) return
      logError('AdminScreen markAllAlertsAsRead failed', e)
      setError('Nao foi possivel atualizar os alertas agora. Tente novamente.')
    } finally {
      setMarkingAlertsRead(false)
    }
  }

  const openAlert = async (alert: any) => {
    if (!alert?.read && alert?.id) {
      setAlertActionId(String(alert.id))
      try {
        const res = await fetch('/api/notifications', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ notificationId: alert.id }),
        })
        const json = await res.json().catch(() => null)
        if (!res.ok) {
          setError(toUserFacingError(json?.error, 'Nao foi possivel atualizar este alerta agora. Tente novamente.', '/api/notifications'))
          return
        }
        applyAlertsPayload(json)
      } catch (e) {
        if (isAbortLikeError(e)) return
        logError('AdminScreen openAlert failed', e)
        setError('Nao foi possivel atualizar este alerta agora. Tente novamente.')
        return
      } finally {
        setAlertActionId(null)
      }
    }
    if (typeof alert?.href === 'string' && alert.href) router.push(alert.href)
  }

  const paid = txs.filter((t) => String(t.status ?? '').toLowerCase() === 'paid')
  const tpv = paid.reduce((acc, t) => acc + Number(t.amount ?? 0), 0)
  const settled = paid.reduce((acc, t) => acc + Number(t.amount ?? 0), 0)
  const pendingKyc = kyc.filter((k) => String(k.status ?? '') === 'pending')
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
        {[
          { label: 'TPV total', value: loading ? 'â€”' : fmtBRL(tpv), sub: 'Pagos (amostra)', icon: TrendingUp, accent: true },
          { label: 'Alertas nÃ£o lidos', value: loading ? 'â€”' : alertsUnreadCount.toLocaleString('pt-BR'), sub: 'NotificaÃ§Ãµes internas', icon: AlertCircle, accent: false },
          { label: 'Recebedores', value: loading ? 'â€”' : receiversCount == null ? 'â€”' : receiversCount.toLocaleString('pt-BR'), sub: 'Cadastrados', icon: Building2, accent: false },
          { label: 'Volume liquidado', value: loading ? 'â€”' : fmtBRL(settled), sub: 'Pagos (amostra)', icon: Wallet, accent: false },
        ].map((p) => (
          <KpiCard key={p.label} {...p} />
        ))}
      </div>
      {error ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Notice style={{ flex: 1 }}>{error}</Notice>
          <GhostBtn disabled={loading} onClick={() => setReloadNonce((current) => current + 1)}>
            <RotateCcw size={13} /> Tentar novamente
          </GhostBtn>
        </div>
      ) : null}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <TableCard>
          <div style={{ padding: '18px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <p style={{ fontFamily: F, fontWeight: 700, fontSize: 15, color: TEXT }}>KYC Pendentes</p>
            <button onClick={() => router.push('/admin/aprovacao-kyc')} style={{ fontFamily: F, fontWeight: 700, fontSize: 12, color: NAVY, background: 'none', border: 'none', cursor: 'pointer' }}>
              Ver todos â†’
            </button>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#FAFBFD' }}>{['Empresa', 'Risco', 'Status', ''].map((h) => <Th key={h}>{h}</Th>)}</tr>
            </thead>
            <tbody>
              {(!loading ? pendingKyc : []).slice(0, 6).map((k: any) => {
                  const risk = String(k.risk ?? 'â€”')
                  const rc = risk === 'low' ? { bg: '#ECFDF5', text: '#059669' } : risk === 'medium' ? { bg: '#FFFBEB', text: '#D97706' } : { bg: '#FEF2F2', text: '#DC2626' }
                  return (
                    <tr key={k.id} style={{ transition: 'background .12s' }} onMouseEnter={(e) => (e.currentTarget.style.background = FAINT)} onMouseLeave={(e) => (e.currentTarget.style.background = '')}>
                      <td style={{ padding: '12px 20px', borderBottom: `1px solid ${BORDER}` }}>
                        <p style={{ fontFamily: F, fontWeight: 600, fontSize: 13, color: TEXT }}>{k.receiver?.name ?? 'â€”'}</p>
                        <p style={{ fontFamily: MONO, fontSize: 10.5, color: MUTED }}>{k.receiver?.document ?? 'â€”'}</p>
                      </td>
                      <td style={{ padding: '12px 20px', borderBottom: `1px solid ${BORDER}` }}>
                        <span style={{ fontFamily: F, fontWeight: 700, fontSize: 11, padding: '3px 8px', borderRadius: 5, background: rc.bg, color: rc.text }}>{risk}</span>
                      </td>
                      <td style={{ padding: '12px 20px', borderBottom: `1px solid ${BORDER}` }}>
                        <Badge status="Pendente" />
                      </td>
                      <td style={{ padding: '12px 20px', borderBottom: `1px solid ${BORDER}` }}>
                        <button onClick={() => router.push('/admin/aprovacao-kyc')} style={{ fontFamily: F, fontWeight: 700, fontSize: 12, color: NAVY, background: 'none', border: 'none', cursor: 'pointer' }}>
                          Revisar
                        </button>
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
          {loading ? (
            <TableSkeleton rows={5} cols={4} />
          ) : pendingKyc.length === 0 ? (
            <EmptyState icon={<Users size={18} style={{ color: NAVY }} />} title="Nenhum KYC pendente" description="Quando houver solicitaÃ§Ãµes aguardando anÃ¡lise, elas aparecerÃ£o aqui." />
          ) : null}
        </TableCard>
        <div style={{ background: 'white', borderRadius: 16, border: `1px solid ${BORDER}`, boxShadow: '0 1px 4px rgba(2,27,91,.04)', overflow: 'hidden' }}>
          <div style={{ padding: '18px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <p style={{ fontFamily: F, fontWeight: 700, fontSize: 15, color: TEXT }}>Alertas do sistema</p>
            <button
              onClick={() => void markAllAlertsAsRead()}
              disabled={markingAlertsRead || alertsUnreadCount === 0}
              style={{
                fontFamily: F,
                fontWeight: 600,
                fontSize: 11.5,
                color: alertsUnreadCount === 0 ? MUTED : NAVY,
                background: 'none',
                border: 'none',
                cursor: markingAlertsRead || alertsUnreadCount === 0 ? 'default' : 'pointer',
                opacity: markingAlertsRead || alertsUnreadCount === 0 ? 0.65 : 1,
              }}
            >
              {markingAlertsRead ? 'Atualizando...' : 'Marcar como lidos'}
            </button>
          </div>
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {!loading && alerts.length === 0 ? (
              <EmptyState icon={<CheckCircle2 size={18} style={{ color: NAVY }} />} title="Nenhum alerta operacional" description="Quando houver eventos que exigem acompanhamento, eles aparecerÃ£o aqui." />
            ) : (
              alerts.map((alert) => {
                const tone = alert?.severity === 'warning' ? 'warning' : alert?.severity === 'error' ? 'error' : 'info'
                return (
                  <button
                    key={String(alert.id)}
                    type="button"
                    onClick={() => void openAlert(alert)}
                    style={{
                      background: tone === 'warning' ? '#FFFBEB' : tone === 'error' ? '#FEF2F2' : '#EFF6FF',
                      border: `1px solid ${tone === 'warning' ? '#FDE68A' : tone === 'error' ? '#FECACA' : '#BFDBFE'}`,
                      borderRadius: 10,
                      padding: '12px 14px',
                      display: 'flex',
                      gap: 10,
                      width: '100%',
                      textAlign: 'left',
                      cursor: 'pointer',
                      opacity: alert?.read ? 0.82 : 1,
                    }}
                  >
                    <div style={{ flexShrink: 0, marginTop: 1 }}>
                      {tone === 'warning' ? <AlertCircle size={14} style={{ color: '#D97706' }} /> : tone === 'error' ? <XCircle size={14} style={{ color: '#DC2626' }} /> : <CheckCircle2 size={14} style={{ color: '#2563EB' }} />}
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontFamily: F, fontWeight: 600, fontSize: 12.5, color: TEXT, lineHeight: 1.45 }}>{alert?.title ?? 'Alerta do sistema'}</p>
                      <p style={{ fontFamily: F, fontSize: 11.5, color: MUTED, marginTop: 4 }}>{alert?.message ?? 'Sem detalhes adicionais.'}</p>
                      <p style={{ fontFamily: F, fontSize: 11, color: MUTED, marginTop: 6 }}>
                        {alertActionId === String(alert.id) ? 'Atualizando...' : formatAlertTime(alert?.createdAt)}
                      </p>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>
      </div>
      <TableCard>
        <div style={{ padding: '18px 20px', borderBottom: `1px solid ${BORDER}` }}>
          <p style={{ fontFamily: F, fontWeight: 700, fontSize: 15, color: TEXT }}>Ãšltimas transaÃ§Ãµes â€” visÃ£o global</p>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#FAFBFD' }}>{['ID', 'Cliente', 'Valor', 'MÃ©todo', 'Status', 'Data'].map((h) => <Th key={h}>{h}</Th>)}</tr>
          </thead>
          <tbody>
            {(!loading ? txs : []).slice(0, 10).map((tx: any) => (
              <tr key={tx.id} style={{ transition: 'background .12s' }} onMouseEnter={(e) => (e.currentTarget.style.background = FAINT)} onMouseLeave={(e) => (e.currentTarget.style.background = '')}>
                <Td mono>{tx.id}</Td>
                <Td>{tx.customer?.name ?? tx.customer?.email ?? 'â€”'}</Td>
                <Td>
                  <span style={{ fontWeight: 700 }}>{fmtBRL(Number(tx.amount ?? 0))}</span>
                </Td>
                <Td>
                  <span style={{ color: MUTED }}>{String(tx.method ?? 'â€”')}</span>
                </Td>
                <td style={{ padding: '13px 20px', borderBottom: `1px solid ${BORDER}` }}>
                  <Badge status={String(tx.status ?? 'â€”')} />
                </td>
                <Td>
                  <span style={{ color: MUTED }}>{tx.created_at ? new Date(tx.created_at as string).toLocaleString('pt-BR') : 'â€”'}</span>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading ? (
          <TableSkeleton rows={6} cols={6} />
        ) : txs.length === 0 ? (
          <EmptyState icon={<ArrowUpDown size={18} style={{ color: NAVY }} />} title="Nenhuma transaÃ§Ã£o encontrada" description="Quando houver movimentaÃ§Ã£o, as transaÃ§Ãµes aparecerÃ£o aqui." />
        ) : null}
      </TableCard>
    </div>
    </>
  )
}

export function KycApprovalScreen() {
  const { prompt, promptDialog } = usePromptDialog()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<any[]>([])
  const [actionId, setActionId] = useState<string | null>(null)
  const [docsOpen, setDocsOpen] = useState(false)
  const [docsLoading, setDocsLoading] = useState(false)
  const [docsError, setDocsError] = useState<string | null>(null)
  const [docs, setDocs] = useState<any[]>([])
  const [docUrl, setDocUrl] = useState<string | null>(null)
  const [docsFor, setDocsFor] = useState<{ id: string; name: string | null; document: string | null } | null>(null)

  const closeDocs = () => {
    setDocsOpen(false)
    setDocs([])
    setDocUrl(null)
    setDocsFor(null)
    setDocsError(null)
  }

  const loadQueue = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/kyc-requests', { method: 'GET', signal })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setError(toUserFacingError(json?.error, 'NÃ£o foi possÃ­vel exibir a fila de KYC agora. Tente novamente.', '/api/kyc-requests'))
        setItems([])
        return
      }
      setItems(Array.isArray(json?.kycRequests) ? json.kycRequests : [])
    } catch (e) {
      if (e instanceof TypeError && String(e.message).toLowerCase().includes('failed to fetch')) {
        await Promise.resolve()
      }
      if (signal?.aborted || isAbortLikeError(e)) return
      logError('KycApprovalScreen load failed', e)
      setError('NÃ£o foi possÃ­vel exibir a fila de KYC agora. Tente novamente.')
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void loadQueue(controller.signal)
    return () => controller.abort()
  }, [loadQueue])

  const approve = async (id: string) => {
    setError(null)
    setActionId(id)
    try {
      const res = await fetch(`/api/kyc-requests/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'approved', risk: 'low' }) })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setError(toUserFacingError(json?.error, 'NÃ£o foi possÃ­vel aprovar este KYC. Tente novamente.', `/api/kyc-requests/${id}`))
        return
      }
      await loadQueue()
      emitAppToast({ tone: 'success', title: 'KYC aprovado', message: 'A analise interna foi concluida com sucesso.' })
    } catch (e) {
      if (isAbortLikeError(e)) return
      logError('KycApprovalScreen approve failed', e)
      setError(toUserFacingError(e instanceof Error ? e.message : String(e), 'Nao foi possivel aprovar este KYC. Tente novamente.', `/api/kyc-requests/${id}`))
    } finally {
      setActionId(null)
    }
  }

  const startReview = async (id: string) => {
    setError(null)
    setActionId(id)
    try {
      const res = await fetch(`/api/kyc-requests/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'under_review', risk: 'medium' }) })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setError(toUserFacingError(json?.error, 'NÃ£o foi possÃ­vel iniciar a anÃ¡lise. Tente novamente.', `/api/kyc-requests/${id}`))
        return
      }
      await loadQueue()
      emitAppToast({ tone: 'success', title: 'Analise iniciada', message: 'A solicitacao foi movida para analise interna.' })
    } catch (e) {
      if (isAbortLikeError(e)) return
      logError('KycApprovalScreen startReview failed', e)
      setError(toUserFacingError(e instanceof Error ? e.message : String(e), 'Nao foi possivel iniciar a analise. Tente novamente.', `/api/kyc-requests/${id}`))
    } finally {
      setActionId(null)
    }
  }

  const reject = async (id: string) => {
    setError(null)
    const reason =
      (await prompt({
        title: 'Rejeitar KYC',
        label: 'Motivo da rejeiÃ§Ã£o',
        placeholder: 'Ex.: Documento ilegÃ­vel, divergÃªncia de dados, selfie invÃ¡lidaâ€¦',
        multiline: true,
      })) ?? ''
    if (!reason.trim()) {
      setError('Informe um motivo para reprovar esta solicitacao.')
      emitAppToast({ tone: 'warning', title: 'Motivo obrigatorio', message: 'Explique a justificativa antes de reprovar o KYC.' })
      return
    }
    setActionId(id)
    try {
      const res = await fetch(`/api/kyc-requests/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'rejected', risk: 'high', decisionReason: reason }) })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setError(toUserFacingError(json?.error, 'NÃ£o foi possÃ­vel rejeitar este KYC. Tente novamente.', `/api/kyc-requests/${id}`))
        return
      }
      await loadQueue()
      emitAppToast({ tone: 'success', title: 'KYC reprovado', message: 'A justificativa foi registrada na analise interna.' })
    } catch (e) {
      if (isAbortLikeError(e)) return
      logError('KycApprovalScreen reject failed', e)
      setError(toUserFacingError(e instanceof Error ? e.message : String(e), 'Nao foi possivel rejeitar este KYC. Tente novamente.', `/api/kyc-requests/${id}`))
    } finally {
      setActionId(null)
    }
  }

  const pending = items.filter((k) => k.status === 'pending' || k.status === 'under_review').length
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Notice>
        Esta análise é interna da Connekt Pay. A sincronização com o provedor financeiro será habilitada após a homologação da integração.
      </Notice>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
        {[
          { l: 'Total na fila', v: loading ? 'â€”' : String(items.length), icon: Users },
          { l: 'Aguardando', v: loading ? 'â€”' : String(pending), icon: Clock },
          { l: 'Aprovados', v: loading ? 'â€”' : String(items.filter((k) => k.status === 'approved').length), icon: CheckCircle2 },
          { l: 'Rejeitados', v: loading ? 'â€”' : String(items.filter((k) => k.status === 'rejected').length), icon: XCircle },
        ].map(({ l, v, icon: Icon }) => (
          <div key={l} style={{ background: 'white', borderRadius: 16, border: `1px solid ${BORDER}`, padding: '20px 22px', boxShadow: '0 1px 4px rgba(2,27,91,.04)' }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: FAINT, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <Icon size={17} style={{ color: NAVY }} />
            </div>
            <p style={{ fontFamily: F, fontSize: 12, color: MUTED, marginBottom: 3 }}>{l}</p>
            <p style={{ fontFamily: F, fontWeight: 800, fontSize: 22, color: TEXT }}>{v}</p>
          </div>
        ))}
      </div>
      {error && <Notice>{error}</Notice>}
      {docsOpen && (
        <Modal
          open={true}
          title={`Documentos KYC${docsFor?.name ? ` Â· ${docsFor.name}` : ''}`}
          description={docsFor?.document ?? 'Selecione um documento para visualizar.'}
          onClose={closeDocs}
          maxWidth={980}
          dismissOnBackdrop={true}
          dismissOnEscape={true}
          footer={
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <GhostBtn onClick={closeDocs}>
                Fechar
              </GhostBtn>
            </div>
          }
        >
          <div
            className="grid grid-cols-1 md:grid-cols-[320px_1fr]"
            style={{ minHeight: 0, maxHeight: 'calc(100dvh - 220px)', overflow: 'hidden' }}
          >
            <div style={{ borderRight: `1px solid ${BORDER}`, padding: 12, background: '#FAFBFD', overflowY: 'auto', minHeight: 220 }}>
              {docsLoading ? (
                <div style={{ padding: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: F, fontSize: 13, color: MUTED }}>
                    <span className="inline-block w-4 h-4 rounded-full border-2 border-[#94A3B8] border-t-transparent animate-spin" />
                    Carregando documentosâ€¦
                  </div>
                  <div style={{ height: 14 }} />
                  <div style={{ display: 'grid', gap: 10 }}>
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} style={{ background: 'white', border: `1px solid ${BORDER}`, borderRadius: 12, padding: 10 }}>
                        <Skeleton height={10} radius={8} width="70%" />
                        <div style={{ height: 8 }} />
                        <Skeleton height={9} radius={8} width="45%" />
                      </div>
                    ))}
                  </div>
                </div>
              ) : docs.length === 0 ? (
                <EmptyState icon={<FileText size={18} style={{ color: NAVY }} />} title="Nenhum documento disponÃ­vel" description="Este KYC ainda nÃ£o possui documentos anexados." />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {docs.map((d: any) => {
                    const url = typeof d.signed_url === 'string' ? d.signed_url : null
                    const active = !!url && url === docUrl
                    return (
                      <div key={d.id} style={{ background: active ? '#FAFBFD' : 'white', border: `1px solid ${BORDER}`, borderRadius: 12, padding: 10 }}>
                        <p style={{ fontFamily: F, fontWeight: 800, fontSize: 12.5, color: TEXT, marginBottom: 2 }}>{d.original_filename ?? d.doc_type ?? 'Documento'}</p>
                        <p style={{ fontFamily: MONO, fontSize: 10.5, color: MUTED, marginBottom: 10 }}>{d.mime_type ?? ''}</p>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button
                            disabled={!url}
                            onClick={() => setDocUrl(url)}
                            style={{ padding: '7px 10px', borderRadius: 10, border: `1px solid ${BORDER}`, background: active ? NAVY : 'white', color: active ? 'white' : NAVY, fontFamily: F, fontWeight: 800, fontSize: 12, cursor: url ? 'pointer' : 'default', opacity: url ? 1 : 0.6 }}
                          >
                            Visualizar
                          </button>
                          <button
                            disabled={!url}
                            onClick={() => {
                              if (!url) return
                              window.open(url, '_blank', 'noopener,noreferrer')
                            }}
                            style={{ padding: '7px 10px', borderRadius: 10, border: `1px solid ${BORDER}`, background: 'white', color: NAVY, fontFamily: F, fontWeight: 800, fontSize: 12, cursor: url ? 'pointer' : 'default', opacity: url ? 1 : 0.6 }}
                          >
                            Abrir documento
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
              {docsError ? <Notice>{docsError}</Notice> : null}
            </div>
            <div style={{ padding: 12, background: 'white', overflowY: 'auto', minHeight: 220 }}>
              {docUrl ? (
                <iframe title="KYC Document" src={docUrl} style={{ width: '100%', height: '100%', minHeight: 320, border: 'none', borderRadius: 12, background: '#FAFBFD' }} />
              ) : (
                <div style={{ height: '100%', minHeight: 320, borderRadius: 12, border: `1px dashed ${BORDER}`, background: '#FAFBFD', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: F, fontSize: 13, color: MUTED }}>
                  Selecione um documento para visualizar
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}
      <TableCard>
        <div style={{ padding: '18px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <p style={{ fontFamily: F, fontWeight: 700, fontSize: 15, color: TEXT }}>Fila de aprovaÃ§Ã£o KYC</p>
          <GhostBtn
            disabled={loading || items.length === 0}
            onClick={() =>
              downloadCsv(
                'kyc-approval.csv',
                items.map((item) => ({
                  id: item.id ?? '',
                  receiver_name: item.receiver?.name ?? '',
                  receiver_document: item.receiver?.document ?? '',
                  submitted_at: item.submitted_at ?? '',
                  reviewed_at: item.reviewed_at ?? '',
                  risk: item.risk ?? '',
                  status: item.status ?? '',
                  reviewer_name: item.reviewer?.full_name ?? item.reviewer?.email ?? '',
                  decision_reason: item.decision_reason ?? '',
                }))
              )
            }
          >
            <Download size={13} /> Exportar CSV
          </GhostBtn>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#FAFBFD' }}>{['Empresa', 'Documento', 'Data envio', 'Risco', 'Status', 'AÃ§Ãµes'].map((h) => <Th key={h}>{h}</Th>)}</tr>
          </thead>
          <tbody>
            {(!loading ? items : []).map((k) => {
              const risk = String(k.risk ?? 'â€”')
              const rc = risk === 'low' ? { bg: '#ECFDF5', text: '#059669' } : risk === 'medium' ? { bg: '#FFFBEB', text: '#D97706' } : { bg: '#FEF2F2', text: '#DC2626' }
              const done = k.status === 'approved' || k.status === 'rejected'
              const checklist = typeof k.checklist === 'object' && k.checklist ? k.checklist : {}
              const hasRequiredDocuments = Boolean(checklist.required_documents_sent)
              const canStartReview = canTransitionInternalKycStatus({ nextStatus: 'under_review', hasRequiredDocuments })
              const canApprove = canTransitionInternalKycStatus({ nextStatus: 'approved', hasRequiredDocuments })
              const canReject = canTransitionInternalKycStatus({ nextStatus: 'rejected', hasRequiredDocuments })
              const reviewerName =
                typeof k.reviewer?.full_name === 'string' && k.reviewer.full_name
                  ? String(k.reviewer.full_name)
                  : typeof k.reviewer?.email === 'string' && k.reviewer.email
                    ? String(k.reviewer.email)
                    : null
              return (
                <tr key={k.id} style={{ transition: 'background .12s' }} onMouseEnter={(e) => (e.currentTarget.style.background = FAINT)} onMouseLeave={(e) => (e.currentTarget.style.background = '')}>
                  <td style={{ padding: '14px 20px', borderBottom: `1px solid ${BORDER}` }}>
                    <p style={{ fontFamily: F, fontWeight: 600, fontSize: 13.5, color: TEXT }}>{k.receiver?.name ?? 'â€”'}</p>
                    <p style={{ fontFamily: F, fontSize: 11.5, color: MUTED, marginTop: 4 }}>{mapInternalStatusToPortuguese(k.receiver?.internal_status ?? 'draft')}</p>
                  </td>
                  <td style={{ padding: '14px 20px', borderBottom: `1px solid ${BORDER}`, fontFamily: MONO, fontSize: 12, color: MUTED }}>{k.receiver?.document ?? 'â€”'}</td>
                  <Td mono>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ color: MUTED }}>{k.submitted_at ? new Date(k.submitted_at as string).toLocaleDateString('pt-BR') : 'â€”'}</span>
                      <span style={{ color: '#94A3B8', fontSize: 11 }}>{k.reviewed_at ? `Analisado em ${new Date(k.reviewed_at as string).toLocaleDateString('pt-BR')}` : 'Sem conclusÃ£o interna'}</span>
                    </div>
                  </Td>
                  <td style={{ padding: '14px 20px', borderBottom: `1px solid ${BORDER}` }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <span style={{ fontFamily: F, fontWeight: 700, fontSize: 11, padding: '3px 9px', borderRadius: 6, background: rc.bg, color: rc.text, width: 'fit-content' }}>{risk}</span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <span style={{ fontFamily: F, fontSize: 11, color: MUTED }}>
                          Cadastro: {checklist.profile_complete ? 'completo' : 'pendente'}
                        </span>
                        <span style={{ fontFamily: F, fontSize: 11, color: MUTED }}>
                          Documentos: {checklist.required_documents_sent ? 'completos' : 'pendentes'}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '14px 20px', borderBottom: `1px solid ${BORDER}` }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <Badge status={k.status === 'approved' ? 'Aprovado' : k.status === 'rejected' ? 'Rejeitado' : k.status === 'under_review' ? 'Em anÃ¡lise' : 'Pendente'} />
                      <span style={{ fontFamily: F, fontSize: 11, color: MUTED }}>{mapKycStatusToPortuguese(k.status)}</span>
                    </div>
                  </td>
                  <td style={{ padding: '14px 20px', borderBottom: `1px solid ${BORDER}` }}>
                    {done ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <span style={{ fontFamily: F, fontSize: 12, color: MUTED }}>ConcluÃ­do</span>
                        {reviewerName ? <span style={{ fontFamily: F, fontSize: 11, color: '#94A3B8' }}>Analista: {reviewerName}</span> : null}
                        {typeof k.decision_reason === 'string' && k.decision_reason ? (
                          <span style={{ fontFamily: F, fontSize: 11, color: '#94A3B8', lineHeight: 1.45 }}>Motivo: {k.decision_reason}</span>
                        ) : null}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                        <GhostBtn disabled={loading || !canStartReview} loading={actionId === k.id} onClick={() => void startReview(k.id)}>
                          <Clock size={12} /> Analisar
                        </GhostBtn>
                        <button
                          disabled={loading || actionId === k.id || !canApprove}
                          onClick={() => void approve(k.id)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 5,
                            padding: '6px 12px',
                            borderRadius: 8,
                            background: '#ECFDF5',
                            color: '#059669',
                            border: '1px solid #A7F3D0',
                            fontFamily: F,
                            fontWeight: 700,
                            fontSize: 12,
                            cursor: loading || actionId === k.id ? 'default' : 'pointer',
                            opacity: loading || actionId === k.id || !canApprove ? 0.65 : 1,
                          }}
                        >
                          {actionId === k.id ? <span className="inline-block w-4 h-4 rounded-full border-2 border-[#059669] border-t-transparent animate-spin" /> : <CheckCircle2 size={12} />}
                          {actionId === k.id ? 'Aprovandoâ€¦' : 'Aprovar'}
                        </button>
                        <DangerBtn disabled={loading || !canReject} loading={actionId === k.id} onClick={() => void reject(k.id)}>
                          <XCircle size={12} /> Rejeitar
                        </DangerBtn>
                        <GhostBtn
                          disabled={docsLoading || loading || actionId === k.id}
                          onClick={async () => {
                            setError(null)
                            setDocsOpen(true)
                            setDocsLoading(true)
                            setDocsError(null)
                            setDocsFor({ id: k.id, name: k.receiver?.name ?? null, document: k.receiver?.document ?? null })
                            setDocs([])
                            setDocUrl(null)
                            try {
                              const res = await fetch(`/api/kyc-requests/${k.id}/documents`, { method: 'GET' })
                              const json = await res.json().catch(() => null)
                              if (!res.ok) {
                                const message = toUserFacingError(json?.error, 'Nao foi possivel carregar os documentos. Tente novamente.', `/api/kyc-requests/${k.id}/documents`)
                                setError(message)
                                setDocsError(message)
                                return
                              }
                              const list = Array.isArray(json?.documents) ? json.documents : []
                              setDocs(list)
                              const firstUrl = typeof list.find((d: any) => typeof d?.signed_url === 'string' && d.signed_url)?.signed_url === 'string' ? list.find((d: any) => typeof d?.signed_url === 'string' && d.signed_url)?.signed_url : null
                              setDocUrl(firstUrl)
                              if (list.length > 0 && !firstUrl) {
                                setDocsError('Os documentos foram localizados, mas a visualizacao segura nao esta disponivel no momento.')
                              }
                            } catch (e) {
                              if (isAbortLikeError(e)) return
                              logError('KycApprovalScreen load docs failed', e)
                              const message = toUserFacingError(e instanceof Error ? e.message : String(e), 'Nao foi possivel carregar os documentos. Tente novamente.', `/api/kyc-requests/${k.id}/documents`)
                              setError(message)
                              setDocsError(message)
                            } finally {
                              setDocsLoading(false)
                            }
                          }}
                        >
                          <Eye size={12} /> Docs
                        </GhostBtn>
                        </div>
                        {!hasRequiredDocuments ? (
                          <span style={{ fontFamily: F, fontSize: 11, color: MUTED }}>Envie todos os documentos obrigatÃ³rios antes de analisar ou concluir este KYC.</span>
                        ) : null}
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {loading ? (
          <TableSkeleton rows={7} cols={6} />
        ) : items.length === 0 ? (
          <EmptyState icon={<Users size={18} style={{ color: NAVY }} />} title="Nenhuma solicitaÃ§Ã£o na fila" description="Quando houver solicitaÃ§Ãµes de KYC, elas aparecerÃ£o aqui." />
        ) : null}
      </TableCard>
      {promptDialog}
    </div>
  )
}

export function EventsScreen() {
  const [filter, setFilter] = useState('Todos')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [events, setEvents] = useState<any[]>([])
  const [actionId, setActionId] = useState<string | null>(null)

  useEffect(() => {
    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        const qs = new URLSearchParams()
        if (filter !== 'Todos') qs.set('type', filter)
        const res = await fetch(`/api/events?${qs.toString()}`, { method: 'GET' })
        const json = await res.json().catch(() => null)
        if (!res.ok) {
          setError(toUserFacingError(json?.error, 'NÃ£o foi possÃ­vel exibir eventos agora. Tente novamente.', '/api/events'))
          setEvents([])
          return
        }
        setEvents(Array.isArray(json?.events) ? json.events : [])
      } catch (e) {
        logError('EventsScreen load failed', e)
        setError('NÃ£o foi possÃ­vel exibir eventos agora. Tente novamente.')
      } finally {
        setLoading(false)
      }
    }
    void run()
  }, [filter])

  const allTypes = Array.from(new Set(events.map((e) => String(e.type ?? '')).filter(Boolean)))
  const types = ['Todos', ...allTypes]
  const filtered = events
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
        {[
          { l: 'Eventos', v: loading ? 'â€”' : String(events.length), sub: 'Total' },
          { l: 'Processados', v: loading ? 'â€”' : String(events.filter((e) => e.status === 'processed').length), sub: 'Com sucesso' },
          { l: 'Falhou', v: loading ? 'â€”' : String(events.filter((e) => e.status === 'failed').length), sub: 'Requerem atenÃ§Ã£o' },
        ].map(({ l, v, sub }) => (
          <div key={l} style={{ background: 'white', borderRadius: 14, border: `1px solid ${BORDER}`, padding: '18px 22px', boxShadow: '0 1px 4px rgba(2,27,91,.04)' }}>
            <p style={{ fontFamily: F, fontSize: 11.5, color: MUTED, marginBottom: 3 }}>{l}</p>
            <p style={{ fontFamily: F, fontWeight: 800, fontSize: 22, color: TEXT }}>{v}</p>
            <p style={{ fontFamily: F, fontSize: 11, color: '#94A3B8', marginTop: 3 }}>{sub}</p>
          </div>
        ))}
      </div>
      {error && <Notice>{error}</Notice>}
      <div style={{ background: 'white', borderRadius: 14, border: `1px solid ${BORDER}`, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <p style={{ fontFamily: F, fontWeight: 600, fontSize: 12, color: MUTED }}>Tipo:</p>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 }}>
          {types.map((t) => (
            <button key={t} onClick={() => setFilter(t)} style={{ padding: '5px 11px', borderRadius: 7, fontFamily: MONO, fontWeight: 500, fontSize: 11.5, cursor: 'pointer', transition: 'all .15s', border: filter === t ? 'none' : `1px solid ${BORDER}`, background: filter === t ? NAVY : 'white', color: filter === t ? 'white' : MUTED }}>
              {t}
            </button>
          ))}
        </div>
        <GhostBtn
          disabled={loading || filtered.length === 0}
          onClick={() => {
            const qs = new URLSearchParams()
            if (filter !== 'Todos') qs.set('type', filter)
            qs.set('format', 'csv')
            void downloadFromApi(`/api/events?${qs.toString()}`, 'events.csv', 'Eventos exportados com sucesso.')
          }}
        >
          <Download size={13} /> Exportar CSV
        </GhostBtn>
      </div>
      <TableCard>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#FAFBFD' }}>{['Data', 'Tipo do evento', 'Origem', 'Status', 'Tentativas', 'AÃ§Ã£o'].map((h) => <Th key={h}>{h}</Th>)}</tr>
          </thead>
          <tbody>
            {(!loading ? filtered : []).map((ev: any) => (
              <tr key={ev.id} style={{ transition: 'background .12s' }} onMouseEnter={(e) => (e.currentTarget.style.background = FAINT)} onMouseLeave={(e) => (e.currentTarget.style.background = '')}>
                <td style={{ padding: '13px 20px', borderBottom: `1px solid ${BORDER}`, fontFamily: MONO, fontSize: 11.5, color: MUTED, whiteSpace: 'nowrap' }}>{new Date(ev.created_at).toLocaleString('pt-BR')}</td>
                <td style={{ padding: '13px 20px', borderBottom: `1px solid ${BORDER}` }}>
                  <span style={{ fontFamily: MONO, fontWeight: 600, fontSize: 12.5, color: NAVY, background: FAINT, padding: '3px 8px', borderRadius: 5 }}>{ev.type}</span>
                </td>
                <Td>
                  <span style={{ color: MUTED }}>{ev.origin}</span>
                </Td>
                <td style={{ padding: '13px 20px', borderBottom: `1px solid ${BORDER}` }}>
                  <Badge status={ev.status === 'processed' ? 'Entregue' : ev.status === 'failed' ? 'Falhou' : 'Pendente'} />
                </td>
                <td style={{ padding: '13px 20px', borderBottom: `1px solid ${BORDER}`, fontFamily: MONO, fontSize: 13, color: ev.attempts >= 2 ? '#DC2626' : TEXT }}>{ev.attempts}Ã—</td>
                <td style={{ padding: '13px 20px', borderBottom: `1px solid ${BORDER}` }}>
                  {ev.status !== 'processed' && (
                    <button
                      disabled={actionId === String(ev.id)}
                      onClick={async () => {
                        if (actionId) return
                        setError(null)
                        setActionId(String(ev.id))
                        try {
                          const res = await fetch(`/api/events/${ev.id}/reprocess`, { method: 'POST' })
                          const json = await res.json().catch(() => null)
                          if (!res.ok) {
                            setError(toUserFacingError(json?.error, 'NÃ£o foi possÃ­vel reprocessar este evento agora. Tente novamente.', `/api/events/${ev.id}/reprocess`))
                            return
                          }
                          setFilter('Todos')
                        } finally {
                          setActionId(null)
                        }
                      }}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 11px', borderRadius: 8, background: FAINT, border: `1px solid ${BORDER}`, fontFamily: F, fontWeight: 700, fontSize: 12, color: NAVY, cursor: actionId === String(ev.id) ? 'default' : 'pointer', opacity: actionId === String(ev.id) ? 0.7 : 1 }}
                    >
                      {actionId === String(ev.id) ? <span className="inline-block w-4 h-4 rounded-full border-2 border-[#94A3B8] border-t-transparent animate-spin" /> : <RotateCcw size={12} />}
                      {actionId === String(ev.id) ? 'Reprocessandoâ€¦' : 'Reprocessar'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading ? (
          <TableSkeleton rows={8} cols={6} />
        ) : filtered.length === 0 ? (
          <EmptyState icon={<Activity size={18} style={{ color: NAVY }} />} title="Nenhum evento encontrado" description="NÃ£o hÃ¡ eventos para o filtro selecionado." />
        ) : null}
      </TableCard>
    </div>
  )
}

export function ConciliationScreen() {
  const { prompt, promptDialog } = usePromptDialog()
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [runs, setRuns] = useState<any[]>([])
  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  const [activeRun, setActiveRun] = useState<any | null>(null)
  const [items, setItems] = useState<any[]>([])
  const [itemActionId, setItemActionId] = useState<string | null>(null)

  const loadRuns = async (signal?: AbortSignal) => {
    const res = await fetch('/api/reconciliation', { method: 'GET', signal })
    const json = await res.json().catch(() => null)
    if (!res.ok) throw new Error(toUserFacingError(json?.error, 'Ocorreu um erro ao carregar conciliaÃ§Ãµes. Tente novamente.', '/api/reconciliation'))
    const list = Array.isArray(json?.runs) ? json.runs : []
    setRuns(list)
    setActiveRunId((prev) => prev ?? list[0]?.id ?? null)
  }

  const loadRun = async (id: string, signal?: AbortSignal) => {
    const [r1, r2] = await Promise.all([
      fetch(`/api/reconciliation/${id}`, { method: 'GET', signal }),
      fetch(`/api/reconciliation/${id}/items`, { method: 'GET', signal }),
    ])
    const j1 = await r1.json().catch(() => null)
    const j2 = await r2.json().catch(() => null)
    if (!r1.ok) throw new Error(toUserFacingError(j1?.error, 'Ocorreu um erro ao carregar a execuÃ§Ã£o. Tente novamente.', `/api/reconciliation/${id}`))
    if (!r2.ok) throw new Error(toUserFacingError(j2?.error, 'Ocorreu um erro ao carregar os itens. Tente novamente.', `/api/reconciliation/${id}/items`))
    setActiveRun(j1?.run ?? null)
    setItems(Array.isArray(j2?.items) ? j2.items : [])
  }

  useEffect(() => {
    const controller = new AbortController()
    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        await loadRuns(controller.signal)
      } catch (e) {
        if (controller.signal.aborted || isAbortLikeError(e)) return
        logError('ConciliationScreen load runs failed', e)
        setError(toUserFacingError(e instanceof Error ? e.message : String(e), 'Ocorreu um erro ao carregar conciliaÃ§Ãµes. Tente novamente.', 'ConciliationScreen'))
        setRuns([])
        setActiveRunId(null)
        setActiveRun(null)
        setItems([])
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void run()
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!activeRunId) return
    const controller = new AbortController()
    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        await loadRun(activeRunId, controller.signal)
      } catch (e) {
        if (controller.signal.aborted || isAbortLikeError(e)) return
        logError('ConciliationScreen load run failed', e)
        setError(toUserFacingError(e instanceof Error ? e.message : String(e), 'Ocorreu um erro ao carregar a execuÃ§Ã£o. Tente novamente.', 'ConciliationScreen'))
        setActiveRun(null)
        setItems([])
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void run()
    return () => controller.abort()
  }, [activeRunId])

  const matched = items.filter((r) => r.status === 'matched').length
  const divergent = items.filter((r) => r.status === 'divergent').length
  const pending = items.filter((r) => r.status === 'pending').length
  const resolved = items.filter((r) => r.status === 'resolved').length
  const internalSum = items.reduce((s, r) => s + Number(r.internal_amount_centavos ?? 0), 0)
  const providerSum = items.reduce((s, r) => s + Number(r.provider_amount_centavos ?? 0), 0)
  const diffSum = items.reduce((s, r) => s + Number(r.difference_centavos ?? 0), 0)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Notice tone="info">
        Esta tela consolida a conciliacao interna da Connekt Pay. A reexecucao contra o provider financeiro permanece indisponivel enquanto a conta da Pagar.me nao estiver configurada e homologada.
      </Notice>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
        {[
          { l: 'Itens conciliados', v: loading ? 'â€”' : String(matched), sub: loading ? 'â€”' : `de ${items.length} totais`, icon: CheckCircle2 },
          { l: 'DivergÃªncias', v: loading ? 'â€”' : String(divergent), sub: `Pendentes: ${pending} Â· Resolvidos: ${resolved}`, icon: AlertCircle },
          { l: 'Valor interno', v: loading ? 'â€”' : fmtBRL(internalSum), sub: 'Fonte: Connekt', icon: Database },
          { l: 'DiferenÃ§a', v: loading ? 'â€”' : (diffSum === 0 ? 'R$ 0,00' : `${diffSum > 0 ? '+ ' : '− '}${fmtBRL(Math.abs(diffSum))}`), sub: `Provider: ${fmtBRL(providerSum)}`, icon: Clock },
        ].map(({ l, v, sub, icon: Icon }) => (
          <div key={l} style={{ background: 'white', borderRadius: 16, border: `1px solid ${BORDER}`, padding: '20px 22px', boxShadow: '0 1px 4px rgba(2,27,91,.04)' }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: FAINT, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <Icon size={17} style={{ color: NAVY }} />
            </div>
            <p style={{ fontFamily: F, fontSize: 12, color: MUTED, marginBottom: 3 }}>{l}</p>
            <p style={{ fontFamily: F, fontWeight: 800, fontSize: 20, color: TEXT }}>{v}</p>
            <p style={{ fontFamily: F, fontSize: 11, color: '#94A3B8', marginTop: 3 }}>{sub}</p>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <select
            value={activeRunId ?? ''}
            onChange={(e) => setActiveRunId(e.target.value)}
            style={{ padding: '9px 12px', borderRadius: 10, fontFamily: F, fontWeight: 700, fontSize: 12.5, color: TEXT, background: 'white', border: `1px solid ${BORDER}`, cursor: 'pointer', width: '100%', maxWidth: 520 }}
          >
            {runs.map((r: any) => (
              <option key={r.id} value={r.id}>
                {new Date(r.started_at).toLocaleString('pt-BR')} Â· {String(r.status ?? 'â€”')} Â· DivergÃªncias: {Number(r.total_divergent ?? 0)}
              </option>
            ))}
          </select>
          {activeRun?.period_start && activeRun?.period_end && (
            <span style={{ fontFamily: F, fontSize: 12.5, color: MUTED }}>
              PerÃ­odo: {new Date(activeRun.period_start as string).toLocaleDateString('pt-BR')} â€” {new Date(activeRun.period_end as string).toLocaleDateString('pt-BR')}
            </span>
          )}
        </div>
        <button
          disabled={running}
          onClick={async () => {
            if (running) return
            setRunning(true)
            setError(null)
            try {
              const periodStart =
                (await prompt({
                  title: 'Executar conciliaÃ§Ã£o',
                  label: 'PerÃ­odo inÃ­cio (ISO UTC)',
                  placeholder: 'Deixe vazio para 30 dias',
                })) ?? ''
              const periodEnd =
                (await prompt({
                  title: 'Executar conciliaÃ§Ã£o',
                  label: 'PerÃ­odo fim (ISO UTC)',
                  placeholder: 'Deixe vazio para agora',
                })) ?? ''
              const res = await fetch('/api/reconciliation', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ periodStart: periodStart || undefined, periodEnd: periodEnd || undefined }),
              })
              const json = await res.json().catch(() => null)
              if (!res.ok) {
                logError('ConciliationScreen: start run failed', { status: res.status, error: json?.error })
                setError(toUserFacingError(json?.error, 'Ocorreu um erro ao executar a conciliaÃ§Ã£o. Tente novamente.', '/api/reconciliation'))
                return
              }
              await loadRuns()
              if (json?.runId) setActiveRunId(String(json.runId))
              emitAppToast({ tone: 'success', title: 'Conciliacao executada', message: 'A rodada interna foi iniciada com sucesso.' })
            } catch (e) {
              if (isAbortLikeError(e)) return
              logError('ConciliationScreen start run failed', e)
              setError(toUserFacingError(e instanceof Error ? e.message : String(e), 'Ocorreu um erro ao executar a conciliacao. Tente novamente.', '/api/reconciliation'))
            } finally {
              setRunning(false)
            }
          }}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 10, fontFamily: F, fontWeight: 600, fontSize: 13, color: MUTED, background: 'white', border: `1px solid ${BORDER}`, cursor: running ? 'default' : 'pointer', opacity: running ? 0.7 : 1 }}
        >
          {running ? <span className="inline-block w-4 h-4 rounded-full border-2 border-[#94A3B8] border-t-transparent animate-spin" /> : <Database size={14} />}
          {running ? 'Processandoâ€¦' : 'Executar conciliaÃ§Ã£o'}
        </button>
        <GhostBtn
          disabled={loading || items.length === 0}
          onClick={() =>
            downloadCsv(
              'conciliation-items.csv',
              items.map((row) => ({
                id: row.id ?? '',
                entity_type: row.entity_type ?? '',
                entity_id: row.entity_id ?? '',
                provider_reference: row.provider_reference ?? '',
                internal_amount_centavos: Number(row.internal_amount_centavos ?? 0),
                provider_amount_centavos: Number(row.provider_amount_centavos ?? 0),
                difference_centavos: Number(row.difference_centavos ?? 0),
                status: row.status ?? '',
                created_at: row.created_at ?? '',
              }))
            )
          }
        >
          <Download size={13} /> Exportar CSV
        </GhostBtn>
      </div>
      {error && <Notice>{error}</Notice>}
      <TableCard>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#FAFBFD' }}>{['Tipo', 'ID', 'Valor interno', 'Valor provedor', 'DiferenÃ§a', 'Status', 'AÃ§Ã£o'].map((h) => <Th key={h}>{h}</Th>)}</tr>
          </thead>
          <tbody>
            {(!loading ? items : []).map((row: any) => (
              <tr key={row.id} style={{ transition: 'background .12s' }} onMouseEnter={(e) => (e.currentTarget.style.background = FAINT)} onMouseLeave={(e) => (e.currentTarget.style.background = '')}>
                <td style={{ padding: '13px 20px', borderBottom: `1px solid ${BORDER}`, fontFamily: F, fontSize: 12.5, color: MUTED }}>{String(row.entity_type ?? 'â€”')}</td>
                <td style={{ padding: '13px 20px', borderBottom: `1px solid ${BORDER}`, fontFamily: MONO, fontSize: 12.5, color: MUTED }}>{row.entity_id ?? row.provider_reference ?? 'â€”'}</td>
                <Td>
                  <span style={{ fontFamily: MONO, fontWeight: 700 }}>{fmtBRL(Number(row.internal_amount_centavos ?? 0))}</span>
                </Td>
                <Td>
                  <span style={{ fontFamily: MONO, fontWeight: 700 }}>{row.provider_amount_centavos == null ? 'â€”' : fmtBRL(Number(row.provider_amount_centavos))}</span>
                </Td>
                <td style={{ padding: '13px 20px', borderBottom: `1px solid ${BORDER}`, fontFamily: MONO, fontSize: 13, fontWeight: 700 }}>
                  <span style={{ color: Number(row.difference_centavos ?? 0) > 0 ? '#DC2626' : '#059669' }}>{Number(row.difference_centavos ?? 0) !== 0 ? `âˆ’ ${fmtBRL(Math.abs(Number(row.difference_centavos ?? 0)))}` : 'R$ 0,00'}</span>
                </td>
                <td style={{ padding: '13px 20px', borderBottom: `1px solid ${BORDER}` }}>
                  <Badge status={row.status === 'matched' ? 'Conciliado' : row.status === 'resolved' ? 'Resolvido' : row.status === 'divergent' ? 'DivergÃªncia' : 'Pendente'} />
                </td>
                <td style={{ padding: '13px 20px', borderBottom: `1px solid ${BORDER}` }}>
                  {row.status === 'divergent' || row.status === 'pending' ? (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        disabled={itemActionId === String(row.id)}
                        onClick={async () => {
                          if (itemActionId) return
                          setError(null)
                          setItemActionId(String(row.id))
                          try {
                            const res = await fetch(`/api/reconciliation/items/${row.id}/resolve`, { method: 'POST' })
                            const json = await res.json().catch(() => null)
                            if (!res.ok) {
                              logError('ConciliationScreen: resolve item failed', { id: row.id, status: res.status, error: json?.error })
                              setError(toUserFacingError(json?.error, 'Ocorreu um erro ao resolver o item. Tente novamente.', `/api/reconciliation/items/${row.id}/resolve`))
                            } else {
                              if (activeRunId) await loadRun(activeRunId)
                              emitAppToast({ tone: 'success', title: 'Item resolvido', message: 'A divergencia foi marcada como resolvida na conciliacao interna.' })
                            }
                          } catch (e) {
                            if (isAbortLikeError(e)) return
                            logError('ConciliationScreen: resolve item failed', e)
                            setError(toUserFacingError(e instanceof Error ? e.message : String(e), 'Ocorreu um erro ao resolver o item. Tente novamente.', `/api/reconciliation/items/${row.id}/resolve`))
                          } finally {
                            setItemActionId(null)
                          }
                        }}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 9, fontFamily: F, fontWeight: 700, fontSize: 12, color: NAVY, background: FAINT, border: `1px solid ${BORDER}`, cursor: itemActionId === String(row.id) ? 'default' : 'pointer', opacity: itemActionId === String(row.id) ? 0.7 : 1 }}
                      >
                        {itemActionId === String(row.id) ? <span className="inline-block w-4 h-4 rounded-full border-2 border-[#94A3B8] border-t-transparent animate-spin" /> : <CheckCircle2 size={12} />}
                        {itemActionId === String(row.id) ? 'Resolvendoâ€¦' : 'Resolver'}
                      </button>
                      <button
                        disabled={itemActionId === String(row.id)}
                        onClick={async () => {
                          if (itemActionId) return
                          setError(null)
                          setItemActionId(String(row.id))
                          try {
                            const res = await fetch(`/api/reconciliation/items/${row.id}/reprocess`, { method: 'POST' })
                            const json = await res.json().catch(() => null)
                            if (!res.ok) {
                              logError('ConciliationScreen: reprocess item failed', { id: row.id, status: res.status, error: json?.error })
                              setError(toUserFacingError(json?.error, 'Ocorreu um erro ao reprocessar o item. Tente novamente.', `/api/reconciliation/items/${row.id}/reprocess`))
                            } else {
                              if (activeRunId) await loadRun(activeRunId)
                              emitAppToast({ tone: 'success', title: 'Item reenfileirado', message: 'O item foi reenviado para reprocessamento interno.' })
                            }
                          } catch (e) {
                            if (isAbortLikeError(e)) return
                            logError('ConciliationScreen: reprocess item failed', e)
                            setError(toUserFacingError(e instanceof Error ? e.message : String(e), 'Ocorreu um erro ao reprocessar o item. Tente novamente.', `/api/reconciliation/items/${row.id}/reprocess`))
                          } finally {
                            setItemActionId(null)
                          }
                        }}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 9, fontFamily: F, fontWeight: 700, fontSize: 12, color: MUTED, background: 'white', border: `1px solid ${BORDER}`, cursor: itemActionId === String(row.id) ? 'default' : 'pointer', opacity: itemActionId === String(row.id) ? 0.7 : 1 }}
                      >
                        {itemActionId === String(row.id) ? <span className="inline-block w-4 h-4 rounded-full border-2 border-[#94A3B8] border-t-transparent animate-spin" /> : <RotateCcw size={12} />}
                        {itemActionId === String(row.id) ? 'Reprocessandoâ€¦' : 'Reprocessar'}
                      </button>
                    </div>
                  ) : (
                    <span style={{ fontFamily: F, fontSize: 12, color: MUTED }}>â€”</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading ? (
          <TableSkeleton rows={7} cols={7} />
        ) : items.length === 0 ? (
          <EmptyState icon={<Database size={18} style={{ color: NAVY }} />} title="Nenhuma conciliaÃ§Ã£o executada" description="Execute uma conciliaÃ§Ã£o para ver os itens e divergÃªncias." />
        ) : null}
      </TableCard>
      {promptDialog}
    </div>
  )
}

export function AuditScreen() {
  const ac = (a: string) =>
    a === 'CREATE'
      ? { bg: '#ECFDF5', text: '#059669' }
      : a === 'DELETE'
        ? { bg: '#FEF2F2', text: '#DC2626' }
        : a === 'UPDATE'
          ? { bg: '#EFF6FF', text: '#2563EB' }
          : a === 'AUTO_CHARGE'
            ? { bg: '#EEF2FF', text: '#4338CA' }
            : { bg: FAINT, text: MUTED }
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<any[]>([])

  useEffect(() => {
    let t: any = null
    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        const qs = new URLSearchParams()
        if (search) qs.set('q', search)
        const res = await fetch(`/api/audit-logs?${qs.toString()}`, { method: 'GET' })
        const json = await res.json().catch(() => null)
        if (!res.ok) {
          setError(toUserFacingError(json?.error, 'Ocorreu um erro ao carregar a auditoria. Tente novamente.', '/api/audit-logs'))
          setRows([])
          return
        }
        setRows(Array.isArray(json?.auditLogs) ? json.auditLogs : [])
      } catch (e) {
        logError('AuditScreen load failed', e)
        setError('Ocorreu um erro ao carregar a auditoria. Tente novamente.')
      } finally {
        setLoading(false)
      }
    }
    t = setTimeout(() => void run(), 250)
    return () => clearTimeout(t)
  }, [search])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <Shield size={15} style={{ color: '#D97706' }} />
        <p style={{ fontFamily: F, fontWeight: 600, fontSize: 13, color: '#92400E' }}>Logs imutÃ¡veis. Apenas para auditoria â€” nenhuma aÃ§Ã£o pode ser desfeita aqui.</p>
      </div>
      <div style={{ background: 'white', borderRadius: 14, border: `1px solid ${BORDER}`, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: MUTED }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por usuÃ¡rio, entidade ou aÃ§Ã£o..." style={{ width: '100%', paddingLeft: 36, paddingRight: 14, paddingTop: 9, paddingBottom: 9, fontFamily: F, fontSize: 13, background: FAINT, border: `1px solid ${BORDER}`, borderRadius: 9, outline: 'none', color: TEXT, boxSizing: 'border-box' }} />
        </div>
        <button
          disabled={loading || rows.length === 0}
          onClick={() => {
            const qs = new URLSearchParams()
            if (search) qs.set('q', search)
            qs.set('format', 'csv')
            void downloadFromApi(`/api/audit-logs?${qs.toString()}`, 'audit-logs.csv', 'Auditoria exportada com sucesso.')
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '9px 14px',
            borderRadius: 9,
            fontFamily: F,
            fontWeight: 600,
            fontSize: 12.5,
            color: MUTED,
            background: 'white',
            border: `1px solid ${BORDER}`,
            cursor: loading || rows.length === 0 ? 'default' : 'pointer',
            opacity: loading || rows.length === 0 ? 0.6 : 1,
          }}
        >
          <Download size={13} /> Exportar
        </button>
      </div>
      {error && <Notice>{error}</Notice>}
      <TableCard>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#FAFBFD' }}>{['UsuÃ¡rio', 'AÃ§Ã£o', 'Entidade', 'Data', 'Estado anterior', 'Estado posterior'].map((h) => <Th key={h}>{h}</Th>)}</tr>
          </thead>
          <tbody>
            {(!loading ? rows : []).map((a: any, i: number) => {
              const c = ac(String(a.action ?? ''))
              return (
                <tr key={i} style={{ transition: 'background .12s' }} onMouseEnter={(e) => (e.currentTarget.style.background = FAINT)} onMouseLeave={(e) => (e.currentTarget.style.background = '')}>
                  <td style={{ padding: '13px 20px', borderBottom: `1px solid ${BORDER}` }}>
                    <span style={{ fontFamily: MONO, fontSize: 12, color: NAVY, fontWeight: 600 }}>{a.actor?.email ?? a.actor?.full_name ?? 'â€”'}</span>
                  </td>
                  <td style={{ padding: '13px 20px', borderBottom: `1px solid ${BORDER}` }}>
                    <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 11, padding: '3px 8px', borderRadius: 5, background: c.bg, color: c.text }}>{String(a.action ?? 'â€”')}</span>
                  </td>
                  <Td>
                    <span style={{ fontWeight: 600 }}>{String(a.entity ?? 'â€”')}</span>
                  </Td>
                  <td style={{ padding: '13px 20px', borderBottom: `1px solid ${BORDER}`, fontFamily: MONO, fontSize: 11.5, color: MUTED, whiteSpace: 'nowrap' }}>{new Date(a.created_at).toLocaleString('pt-BR')}</td>
                  <td style={{ padding: '13px 20px', borderBottom: `1px solid ${BORDER}`, maxWidth: 180 }}>
                    <code style={{ fontFamily: MONO, fontSize: 10.5, color: '#DC2626', background: '#FEF2F2', padding: '2px 6px', borderRadius: 4, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.before ? JSON.stringify(a.before) : 'â€”'}</code>
                  </td>
                  <td style={{ padding: '13px 20px', borderBottom: `1px solid ${BORDER}`, maxWidth: 180 }}>
                    <code style={{ fontFamily: MONO, fontSize: 10.5, color: '#059669', background: '#ECFDF5', padding: '2px 6px', borderRadius: 4, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.after ? JSON.stringify(a.after) : 'â€”'}</code>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {loading ? (
          <TableSkeleton rows={7} cols={6} />
        ) : rows.length === 0 ? (
          <EmptyState icon={<Shield size={18} style={{ color: NAVY }} />} title="Nenhum log encontrado" description="NÃ£o hÃ¡ registros para o filtro atual." />
        ) : null}
      </TableCard>
    </div>
  )
}

export function ProviderScreen() {
  const router = useRouter()
  const [env, setEnv] = useState<'sandbox' | 'production'>('production')
  const [loading, setLoading] = useState(true)
  const [savingProvider, setSavingProvider] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [provider, setProvider] = useState<any | null>(null)
  const [baseUrlDraft, setBaseUrlDraft] = useState('')
  const [webhookUrlDraft, setWebhookUrlDraft] = useState('')
  const [timeoutDraft, setTimeoutDraft] = useState('30')
  const capabilities = provider?.capabilities ?? {}
  const credentialsConfigured = Boolean(capabilities.credentials_configured)
  const paymentLinksEnabled = Boolean(capabilities.payment_links_enabled)
  const standalonePaymentsEnabled = Boolean(capabilities.standalone_payments_enabled)
  const receiverProviderSyncEnabled = Boolean(capabilities.receiver_provider_sync_enabled)
  const kycEnabled = Boolean(capabilities.kyc_enabled)
  const splitEnabled = Boolean(capabilities.split_enabled)
  const subscriptionsEnabled = Boolean(capabilities.subscriptions_enabled)
  const payoutsEnabled = Boolean(capabilities.payouts_enabled)
  const anticipationEnabled = Boolean(capabilities.anticipation_enabled)
  const webhookSecretConfigured = Boolean(capabilities.webhook_secret_configured)
  const webhookUrlConfigured = Boolean(provider?.webhook_url)
  const retryAttempts =
    typeof provider?.retry_policy?.max_attempts === 'number' ? `${provider.retry_policy.max_attempts} tentativas` : 'â€”'
  const lastSyncLabel = provider?.last_sync_at ? new Date(provider.last_sync_at).toLocaleString('pt-BR') : 'â€”'
  const updatedAtLabel = provider?.updated_at ? new Date(provider.updated_at).toLocaleString('pt-BR') : 'â€”'
  const providerId = String(capabilities.provider_id ?? provider?.provider_id ?? 'financial_provider')
  const providerName = String(capabilities.provider_name ?? provider?.provider_label ?? 'Provedor Financeiro')
  const connectionTone =
    !credentialsConfigured || provider?.status === 'not_configured'
      ? 'warning'
      : provider?.status === 'connected'
        ? 'success'
        : provider?.status === 'error' || provider?.status === 'failed' || provider?.status === 'disconnected'
          ? 'danger'
          : 'neutral'
  const connectionLabel =
    !credentialsConfigured || provider?.status === 'not_configured'
      ? 'NÃ£o configurado'
      : provider?.status === 'connected'
        ? 'Conectado'
        : provider?.status === 'error'
          ? 'Erro de conexÃ£o'
          : provider?.status === 'failed'
            ? 'Falha recente'
            : provider?.status === 'disconnected'
              ? 'Desconectado'
              : provider?.status
                ? String(provider.status)
                : 'ConfiguraÃ§Ã£o pendente'
  const toneStyles = {
    success: { color: '#10B981', bg: '#ECFDF5', text: '#047857', border: '#A7F3D0' },
    warning: { color: '#F59E0B', bg: '#FFFBEB', text: '#B45309', border: '#FCD34D' },
    danger: { color: '#EF4444', bg: '#FEF2F2', text: '#B91C1C', border: '#FCA5A5' },
    neutral: { color: '#64748B', bg: '#F8FAFC', text: '#475569', border: '#CBD5E1' },
  } as const
  const modules = [
    {
      name: 'Auth v2',
      badge: credentialsConfigured ? 'Homologado' : 'Credenciais ausentes',
      tone: credentialsConfigured ? 'success' : 'warning',
      description: credentialsConfigured
        ? `Fluxo externo homologado. O token depende das credenciais válidas de ${providerName} neste ambiente.`
        : `Sem credenciais de ${providerName}, a autenticação externa não pode ser acionada.`,
    },
    {
      name: 'Payment Links',
      badge: !credentialsConfigured ? 'Credenciais ausentes' : paymentLinksEnabled ? 'Homologado' : 'Desligado por flag',
      tone: !credentialsConfigured ? 'warning' : paymentLinksEnabled ? 'success' : 'warning',
      description: !credentialsConfigured
        ? `O fluxo homologado existe no código, mas precisa das credenciais de ${providerName} para operar.`
        : paymentLinksEnabled
          ? 'Create, get e list estão homologados e continuam funcionais nesta tela.'
          : `Sincronização externa desligada por \`${providerId === 'pagarme' ? 'PAGARME_PAYMENT_LINKS_ENABLED' : 'MYGATEWAY_PAYMENT_LINKS_ENABLED'}=false\`.`,
    },
    {
      name: 'Pagamento avulso PIX/cartÃ£o',
      badge: !credentialsConfigured ? 'Credenciais ausentes' : standalonePaymentsEnabled ? 'Preparado internamente' : 'Desligado por flag',
      tone: !credentialsConfigured ? 'warning' : 'warning',
      description: !credentialsConfigured
        ? `Sem credenciais, o pagamento avulso não pode chamar ${providerName}.`
        : standalonePaymentsEnabled
          ? 'Fluxo preparado, mas o contrato externo ainda não está homologado oficialmente.'
          : 'Fluxo externo desligado por `STANDALONE_PAYMENTS_ENABLED=false` e ainda sem homologação oficial.',
    },
    {
      name: 'KYC / Onboarding externo',
      badge: !credentialsConfigured
        ? 'Credenciais ausentes'
        : receiverProviderSyncEnabled && kycEnabled
          ? 'Preparado, sem homologaÃ§Ã£o'
          : 'Interno apenas',
      tone: !credentialsConfigured ? 'warning' : 'warning',
      description: !credentialsConfigured
        ? `O workflow interno pode existir, mas o envio para ${providerName} não roda sem credenciais.`
        : receiverProviderSyncEnabled && kycEnabled
          ? 'Flags ligadas, porém o contrato externo de submit/status ainda depende de homologação.'
          : 'Fluxo interno operacional; sincronização externa desligada por flag ou contrato pendente.',
    },
    {
      name: 'Split externo',
      badge: !credentialsConfigured ? 'Credenciais ausentes' : splitEnabled ? 'Preparado, sem homologaÃ§Ã£o' : 'Interno apenas',
      tone: !credentialsConfigured ? 'warning' : 'warning',
      description: !credentialsConfigured
        ? `Sem credenciais, nenhuma tentativa externa de split pode ser feita em ${providerName}.`
        : splitEnabled
          ? 'Flag ligada, mas o payload/contrato externo ainda não foi homologado.'
          : 'Motor interno existe; envio ao provider segue desligado por `SPLIT_PROVIDER_ENABLED=false`.',
    },
    {
      name: 'Assinaturas externas',
      badge: !credentialsConfigured ? 'Credenciais ausentes' : subscriptionsEnabled ? 'Preparado, sem homologaÃ§Ã£o' : 'Interno apenas',
      tone: !credentialsConfigured ? 'warning' : 'warning',
      description: !credentialsConfigured
        ? `Sem credenciais, ${providerName} não recebe create/cancel externo.`
        : subscriptionsEnabled
          ? 'Flag ligada, mas create/cancel e webhooks oficiais ainda dependem de homologação.'
          : 'Módulo interno continua disponível; provider externo segue desligado por `SUBSCRIPTIONS_PROVIDER_ENABLED=false`.',
    },
    {
      name: 'Repasses externos',
      badge: !credentialsConfigured ? 'Credenciais ausentes' : payoutsEnabled ? 'Preparado, sem homologaÃ§Ã£o' : 'Interno apenas',
      tone: !credentialsConfigured ? 'warning' : 'warning',
      description: !credentialsConfigured
        ? `Sem credenciais, o repasse real não pode ser acionado em ${providerName}.`
        : payoutsEnabled
          ? 'Flag ligada, mas create/get/list externos ainda dependem de contrato e homologação.'
          : 'Fluxo interno permanece funcional; provider externo segue desligado por `PAYOUT_PROVIDER_ENABLED=false`.',
    },
    {
      name: 'AntecipaÃ§Ã£o externa',
      badge: !credentialsConfigured ? 'Credenciais ausentes' : anticipationEnabled ? 'Preparado, sem homologaÃ§Ã£o' : 'Interno apenas',
      tone: !credentialsConfigured ? 'warning' : 'warning',
      description: !credentialsConfigured
        ? `Sem credenciais, a antecipação real não pode ser enviada para ${providerName}.`
        : anticipationEnabled
          ? 'Flag ligada, mas request/get/cancel/list externos ainda aguardam homologação.'
          : 'Simulação e gestão interna seguem disponíveis; provider externo desligado por `ANTICIPATION_PROVIDER_ENABLED=false`.',
    },
    {
      name: 'Webhooks do provider',
      badge: !credentialsConfigured
        ? 'Credenciais ausentes'
        : webhookUrlConfigured && webhookSecretConfigured
          ? 'Parcial'
          : webhookUrlConfigured || webhookSecretConfigured
            ? 'ConfiguraÃ§Ã£o parcial'
            : 'NÃ£o configurado',
      tone: !credentialsConfigured ? 'warning' : webhookUrlConfigured && webhookSecretConfigured ? 'neutral' : 'warning',
      description: !credentialsConfigured
        ? `Sem credenciais, a integração externa com ${providerName} não fecha o ciclo de eventos.`
        : webhookUrlConfigured && webhookSecretConfigured
          ? 'Recepção interna configurada, mas catálogo, assinatura e política oficial ainda não estão homologados.'
          : 'Faltam URL e/ou secret para completar a configuração local de webhooks.',
    },
  ] as const

  const loadProvider = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/provider-settings', { method: 'GET' })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        logError('ProviderScreen: /api/provider-settings failed', { status: res.status, error: json?.error })
        setError(toUserFacingError(json?.error, 'Ocorreu um erro ao carregar o provedor. Tente novamente.', '/api/provider-settings'))
        setProvider(null)
        return
      }
      const nextProvider = json?.providerSettings ?? null
      setProvider(nextProvider)
      setEnv(nextProvider?.environment === 'sandbox' ? 'sandbox' : 'production')
      setBaseUrlDraft(String(nextProvider?.base_url ?? ''))
      setWebhookUrlDraft(String(nextProvider?.webhook_url ?? ''))
      setTimeoutDraft(String(nextProvider?.timeout_seconds ?? 30))
    } catch (e) {
      logError('ProviderScreen load failed', e)
      setError('Ocorreu um erro ao carregar o provedor. Tente novamente.')
      setProvider(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadProvider()
  }, [loadProvider])
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 860 }}>
      {error && <Notice>{error}</Notice>}
      {!loading && (
        <>
          <Notice tone={credentialsConfigured ? 'success' : 'warning'}>
            <strong>Estado atual:</strong> {credentialsConfigured ? `Credenciais de ${providerName} detectadas.` : `Credenciais de ${providerName} ausentes.`}{' '}
            Apenas <strong>Auth v2</strong> e <strong>Payment Links</strong> devem aparecer como fluxos externos homologados nesta etapa.
          </Notice>
          <Notice tone="info">
            <strong>MÃ³dulos externos nÃ£o homologados:</strong> pagamento avulso, KYC externo, split, assinaturas externas, repasses, antecipaÃ§Ã£o e webhooks oficiais continuam dependentes de contrato e/ou homologaÃ§Ã£o adicional.
          </Notice>
        </>
      )}
      <div style={{ background: 'white', borderRadius: 16, border: `1px solid ${BORDER}`, padding: '28px 32px', boxShadow: '0 1px 4px rgba(2,27,91,.04)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: NAVY, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Server size={24} style={{ color: MINT }} />
            </div>
            <div>
              <p style={{ fontFamily: F, fontWeight: 800, fontSize: 18, color: TEXT }}>Provedor financeiro</p>
              <p style={{ fontFamily: F, fontSize: 13, color: MUTED, marginTop: 2 }}>Resumo da configuraÃ§Ã£o real, flags ativas e escopo homologado</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['sandbox', 'production'] as const).map((e) => (
              <button
                key={e}
                onClick={async () => {
                  if (savingProvider) return
                  const previous = env
                  setEnv(e)
                  setSavingProvider(true)
                  setError(null)
                  try {
                    const res = await fetch('/api/provider-settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ environment: e }) })
                    const json = await res.json().catch(() => null)
                    if (!res.ok) {
                      setEnv(previous)
                      setError(toUserFacingError(json?.error, 'Não foi possível atualizar o ambiente do provedor agora.', '/api/provider-settings'))
                      return
                    }
                    const nextProvider = json?.providerSettings ?? null
                    setProvider(nextProvider)
                    setEnv(nextProvider?.environment === 'sandbox' ? 'sandbox' : 'production')
                  } catch (err) {
                    logError('ProviderScreen: update environment failed', err)
                    setEnv(previous)
                    setError('Não foi possível atualizar o ambiente do provedor agora.')
                  } finally {
                    setSavingProvider(false)
                  }
                }}
                style={{ padding: '7px 14px', borderRadius: 8, fontFamily: F, fontWeight: 700, fontSize: 12.5, cursor: savingProvider ? 'default' : 'pointer', border: env === e ? 'none' : `1px solid ${BORDER}`, background: env === e ? (e === 'sandbox' ? '#FFFBEB' : '#ECFDF5') : 'white', color: env === e ? (e === 'sandbox' ? '#D97706' : '#059669') : MUTED, opacity: loading || savingProvider ? 0.7 : 1 }}
              >
                {e === 'sandbox' ? 'Sandbox' : 'ProduÃ§Ã£o'}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
          {[
            { label: 'Provedor atual', value: providerName, mono: false },
            { label: 'Ambiente ativo', value: env === 'production' ? 'ProduÃ§Ã£o' : 'Sandbox', mono: false },
            { label: 'Status da conexÃ£o', value: connectionLabel, mono: false },
            { label: 'Ãšltima sincronizaÃ§Ã£o', value: lastSyncLabel, mono: true },
            { label: 'Ãšltima atualizaÃ§Ã£o da configuraÃ§Ã£o', value: updatedAtLabel, mono: true },
          ].map(({ label, value, mono }) => (
            <div key={label} style={{ background: FAINT, borderRadius: 12, padding: '16px 18px', border: `1px solid ${BORDER}` }}>
              <p style={{ fontFamily: F, fontSize: 11.5, color: MUTED, marginBottom: 4 }}>{label}</p>
              <p style={{ fontFamily: mono ? MONO : F, fontWeight: 700, fontSize: 14, color: TEXT }}>
                {label === 'Status da conexÃ£o' ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: toneStyles[connectionTone].color,
                        display: 'inline-block',
                        boxShadow: `0 0 0 3px ${toneStyles[connectionTone].color}22`,
                      }}
                    />
                    {value}
                  </span>
                ) : (
                  value
                )}
              </p>
            </div>
          ))}
        </div>
      </div>
      <div style={{ background: 'white', borderRadius: 16, border: `1px solid ${BORDER}`, padding: '24px 28px', boxShadow: '0 1px 4px rgba(2,27,91,.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <p style={{ fontFamily: F, fontWeight: 700, fontSize: 15, color: TEXT }}>Status real dos mÃ³dulos externos</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: F, fontSize: 12, color: MUTED }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: toneStyles[connectionTone].color }} /> Baseado em flags e configuraÃ§Ã£o atual
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
          {modules.map((module) => (
            <div key={module.name} style={{ padding: '14px 16px', background: FAINT, borderRadius: 12, border: `1px solid ${BORDER}`, display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: toneStyles[module.tone].color,
                      boxShadow: `0 0 0 3px ${toneStyles[module.tone].color}22`,
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontFamily: F, fontSize: 13, color: TEXT, fontWeight: 700 }}>{module.name}</span>
                </div>
                <span
                  style={{
                    fontFamily: F,
                    fontWeight: 700,
                    fontSize: 11,
                    padding: '3px 8px',
                    borderRadius: 999,
                    background: toneStyles[module.tone].bg,
                    color: toneStyles[module.tone].text,
                    border: `1px solid ${toneStyles[module.tone].border}`,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {module.badge}
                </span>
              </div>
              <p style={{ fontFamily: F, fontSize: 12.5, color: MUTED, lineHeight: 1.55 }}>{module.description}</p>
            </div>
          ))}
        </div>
      </div>
      <div style={{ background: 'white', borderRadius: 16, border: `1px solid ${BORDER}`, padding: '24px 28px', boxShadow: '0 1px 4px rgba(2,27,91,.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <p style={{ fontFamily: F, fontWeight: 700, fontSize: 15, color: TEXT }}>ConfiguraÃ§Ãµes de integraÃ§Ã£o</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <GhostBtn disabled={loading || !provider} onClick={() => void downloadFromApi('/api/provider-settings?format=csv', 'provider-settings.csv', 'Configurações do provedor exportadas com sucesso.')}>
              <Download size={13} /> Exportar CSV
            </GhostBtn>
            <GhostBtn onClick={() => setEditOpen(true)}>
              <Settings size={13} /> Editar configurações
            </GhostBtn>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { label: 'Endpoint base', value: provider?.base_url ?? 'â€”', copy: true },
            { label: 'Webhook URL', value: provider?.webhook_url ?? 'â€”', copy: true },
            { label: 'Timeout de requisiÃ§Ã£o', value: provider?.timeout_seconds ? `${provider.timeout_seconds}s` : 'â€”', copy: false },
            { label: 'Retry automÃ¡tico', value: retryAttempts, copy: false },
            { label: 'Credenciais do provider', value: credentialsConfigured ? 'Configuradas via ambiente' : 'Ausentes no ambiente', copy: false },
            { label: 'Secret de webhook', value: webhookSecretConfigured ? 'Configurado via ambiente' : 'NÃ£o configurado', copy: false },
          ].map(({ label, value, copy }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: FAINT, borderRadius: 10, border: `1px solid ${BORDER}` }}>
              <div>
                <p style={{ fontFamily: F, fontSize: 11, color: MUTED, marginBottom: 2 }}>{label}</p>
                <p style={{ fontFamily: MONO, fontSize: 12.5, color: TEXT, fontWeight: 600 }}>{value}</p>
              </div>
              {copy && (
                <button
                  onClick={async () => {
                    if (typeof value === 'string' && value !== 'â€”') {
                      await copyWithFeedback(value, `${label} copiado com sucesso.`)
                    }
                  }}
                  style={{ background: 'none', border: 'none', cursor: typeof value === 'string' && value !== 'â€”' ? 'pointer' : 'default', color: MUTED, opacity: typeof value === 'string' && value !== 'â€”' ? 1 : 0.5 }}
                >
                  <Copy size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
      {editOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            zIndex: 60,
          }}
          onClick={() => (!savingProvider ? setEditOpen(false) : null)}
        >
          <div
            style={{ width: '100%', maxWidth: 560, background: 'white', borderRadius: 18, border: `1px solid ${BORDER}`, boxShadow: '0 20px 60px rgba(2,27,91,.18)', padding: 24, display: 'grid', gap: 16 }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <p style={{ fontFamily: F, fontWeight: 800, fontSize: 18, color: TEXT }}>Editar integraÃ§Ã£o</p>
                <p style={{ fontFamily: F, fontSize: 12.5, color: MUTED, marginTop: 4 }}>Atualize endpoint base, webhook e timeout sem expor credenciais.</p>
              </div>
              <GhostBtn onClick={() => (!savingProvider ? setEditOpen(false) : null)}>Fechar</GhostBtn>
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
              <div>
                <label style={{ fontFamily: F, fontWeight: 700, fontSize: 12, color: NAVY, display: 'block', marginBottom: 6 }}>Endpoint base</label>
                <input value={baseUrlDraft} onChange={(e) => setBaseUrlDraft(e.target.value)} placeholder="https://api.exemplo.com" style={{ width: '100%', background: FAINT, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 14px', fontFamily: MONO, fontSize: 12.5, color: TEXT, outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontFamily: F, fontWeight: 700, fontSize: 12, color: NAVY, display: 'block', marginBottom: 6 }}>Webhook URL</label>
                <input value={webhookUrlDraft} onChange={(e) => setWebhookUrlDraft(e.target.value)} placeholder="https://app.connektpay.com/api/webhooks" style={{ width: '100%', background: FAINT, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 14px', fontFamily: MONO, fontSize: 12.5, color: TEXT, outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontFamily: F, fontWeight: 700, fontSize: 12, color: NAVY, display: 'block', marginBottom: 6 }}>Timeout (segundos)</label>
                <input value={timeoutDraft} onChange={(e) => setTimeoutDraft(e.target.value.replace(/[^\d]/g, ''))} inputMode="numeric" style={{ width: '100%', background: FAINT, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 14px', fontFamily: MONO, fontSize: 12.5, color: TEXT, outline: 'none', boxSizing: 'border-box' }} />
              </div>
            </div>
            <Notice tone="info">
              Credenciais, secrets e chaves continuam exclusivamente no ambiente server-side. Esta tela edita apenas metadados operacionais.
            </Notice>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <GhostBtn onClick={() => router.push('/configuracoes/integracoes')}>Abrir integrações avançadas</GhostBtn>
              <PrimaryBtn
                disabled={savingProvider}
                onClick={async () => {
                  const timeoutSeconds = Number(timeoutDraft)
                  if (!Number.isInteger(timeoutSeconds) || timeoutSeconds <= 0) {
                    setError('Informe um timeout válido em segundos.')
                    return
                  }
                  setSavingProvider(true)
                  setError(null)
                  try {
                    const res = await fetch('/api/provider-settings', {
                      method: 'PUT',
                      headers: { 'content-type': 'application/json' },
                      body: JSON.stringify({
                        base_url: baseUrlDraft.trim() || null,
                        webhook_url: webhookUrlDraft.trim() || null,
                        timeout_seconds: timeoutSeconds,
                      }),
                    })
                    const json = await res.json().catch(() => null)
                    if (!res.ok) {
                      setError(toUserFacingError(json?.error, 'Não foi possível salvar as configurações do provedor agora.', '/api/provider-settings'))
                      return
                    }
                    setProvider(json?.providerSettings ?? null)
                    setBaseUrlDraft(String(json?.providerSettings?.base_url ?? ''))
                    setWebhookUrlDraft(String(json?.providerSettings?.webhook_url ?? ''))
                    setTimeoutDraft(String(json?.providerSettings?.timeout_seconds ?? timeoutSeconds))
                    setEditOpen(false)
                  } catch (err) {
                    logError('ProviderScreen: save settings failed', err)
                    setError('Não foi possível salvar as configurações do provedor agora.')
                  } finally {
                    setSavingProvider(false)
                  }
                }}
              >
                {savingProvider ? 'Salvando...' : 'Salvar configurações'}
              </PrimaryBtn>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function ReppassesScreen() {
  const { confirm, confirmDialog } = useConfirmDialog()
  const [filter, setFilter] = useState('Todos')
  const filters = ['Todos', 'Solicitado', 'Processando', 'Agendado', 'Liquidado', 'Falhou', 'Cancelado']
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [payouts, setPayouts] = useState<any[]>([])
  const [receivers, setReceivers] = useState<any[]>([])
  const [balance, setBalance] = useState<number>(0)
  const [creating, setCreating] = useState(false)
  const [amountBRL, setAmountBRL] = useState('')
  const [receiverId, setReceiverId] = useState('')
  const [liquidatingId, setLiquidatingId] = useState<string | null>(null)

  useEffect(() => {
    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        const [pRes, rRes, lRes] = await Promise.all([fetch('/api/payouts', { method: 'GET' }), fetch('/api/receivers', { method: 'GET' }), fetch('/api/ledger', { method: 'GET' })])
        const pJson = await pRes.json().catch(() => null)
        const rJson = await rRes.json().catch(() => null)
        const lJson = await lRes.json().catch(() => null)
        if (!pRes.ok) {
          setError(toUserFacingError(pJson?.error, 'Ocorreu um erro ao carregar repasses. Tente novamente.', '/api/payouts'))
          setPayouts([])
        } else {
          setPayouts(Array.isArray(pJson?.payouts) ? pJson.payouts : [])
        }
        if (rRes.ok) {
          const rs = Array.isArray(rJson?.receivers) ? rJson.receivers : []
          setReceivers(rs)
          setReceiverId((prev) => prev || rs[0]?.id || '')
        }
        if (lRes.ok) setBalance(Number(lJson?.balance ?? 0))
      } catch (e) {
        logError('ReppassesScreen load failed', e)
        setError('Ocorreu um erro ao carregar repasses. Tente novamente.')
      } finally {
        setLoading(false)
      }
    }
    void run()
  }, [])

  const mapStatus = (s: string) =>
    s === 'paid'
      ? 'Liquidado'
      : s === 'processing'
        ? 'Processando'
        : s === 'failed'
          ? 'Falhou'
          : s === 'canceled'
            ? 'Cancelado'
            : s === 'requested'
              ? 'Solicitado'
              : 'Agendado'

  const parseAmountBRL = (input: string) => {
    const normalized = input.replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, '')
    const value = Number(normalized)
    if (!Number.isFinite(value) || value <= 0) return null
    return Math.round(value * 100)
  }

  const receiversById = new Map<string, any>(receivers.map((r: any) => [String(r.id), r]))
  const rows = payouts.map((p) => {
    const status = mapStatus(String(p.status ?? 'scheduled'))
    const rec = receiversById.get(String(p.receiver_id ?? '')) ?? null
    const bank = rec?.bank_account && typeof rec.bank_account === 'object' ? rec.bank_account : null
    const bankLabel = bank ? `${String((bank as any).bank_code ?? 'â€”')} Â· ${String((bank as any).agency ?? 'â€”')}/${String((bank as any).account ?? 'â€”')}-${String((bank as any).account_digit ?? '')}` : 'â€”'
    return {
      id: p.id,
      recipient: String(rec?.name ?? p.receiver_id ?? 'â€”'),
      doc: String(rec?.document ?? 'â€”'),
      gross: Number(p.gross_amount ?? 0),
      fee: Number(p.fee_amount ?? 0),
      net: Number(p.net_amount ?? 0),
      bank: bankLabel,
      status,
      date: p.created_at ? new Date(p.created_at as string).toLocaleString('pt-BR') : 'â€”',
      scheduled_for: p.scheduled_for,
    }
  })

  const filtered = filter === 'Todos' ? rows : rows.filter((r) => r.status === filter)
  const liquidado = rows.filter((r) => r.status === 'Liquidado')
  const agendados = rows.filter((r) => r.status === 'Agendado')
  const falhosOuPend = rows.filter((r) => r.status === 'Falhou' || r.status === 'Processando')
  const volumeLiquidado = liquidado.reduce((acc, r) => acc + Number(r.net ?? 0), 0)
  const feeAvg = liquidado.length ? liquidado.reduce((acc, r) => acc + Number(r.fee ?? 0), 0) / liquidado.reduce((acc, r) => acc + Number(r.gross ?? 0), 0) : 0
  const repStats = [
    { label: 'Saldo disponÃ­vel', value: loading ? 'â€”' : fmtBRL(balance), sub: 'Ledger', accent: true },
    { label: 'Volume repassado', value: loading ? 'â€”' : fmtBRL(volumeLiquidado), sub: 'Total liquidado', accent: true },
    { label: 'Repasses agendados', value: loading ? 'â€”' : String(agendados.length), sub: 'Pendentes', accent: false },
    { label: 'Taxa mÃ©dia', value: loading ? 'â€”' : `${(feeAvg * 100).toFixed(1)}%`, sub: 'Sobre valor bruto', accent: false },
    { label: 'Falhou / Pendente', value: loading ? 'â€”' : String(falhosOuPend.length), sub: 'Requer atenÃ§Ã£o', accent: false },
  ]
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
        {repStats.map(({ label, value, sub, accent }) => (
          <div key={label} style={{ background: accent ? NAVY : 'white', borderRadius: 16, border: accent ? 'none' : `1px solid ${BORDER}`, padding: '22px 24px', boxShadow: accent ? '0 4px 20px rgba(2,27,91,.28)' : '0 1px 4px rgba(2,27,91,.04)' }}>
            <p style={{ fontFamily: F, fontSize: 12, color: accent ? 'rgba(255,255,255,.5)' : MUTED, marginBottom: 6 }}>{label}</p>
            <p style={{ fontFamily: F, fontWeight: 800, fontSize: 24, color: accent ? 'white' : TEXT, letterSpacing: '-0.02em', lineHeight: 1 }}>{value}</p>
            <p style={{ fontFamily: F, fontSize: 11, color: accent ? 'rgba(255,255,255,.3)' : '#94A3B8', marginTop: 6 }}>{sub}</p>
          </div>
        ))}
      </div>

      <div style={{ background: 'white', borderRadius: 16, border: `1px solid ${BORDER}`, padding: '24px 28px', boxShadow: '0 1px 4px rgba(2,27,91,.04)' }}>
        <p style={{ fontFamily: F, fontWeight: 700, fontSize: 15, color: TEXT, marginBottom: 16 }}>PrÃ³ximos repasses agendados</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
          {!loading &&
            agendados
            .slice(0, 3)
            .map((r) => {
              const d = r.scheduled_for ? new Date(r.scheduled_for as string) : null
              const date = d ? d.toLocaleDateString('pt-BR').slice(0, 5) : 'â€”'
              const weekday = d ? d.toLocaleDateString('pt-BR', { weekday: 'short' }) : ''
              return { date, weekday, recipient: r.recipient, value: r.net || r.gross, tag: null }
            })
            .map(({ date, weekday, recipient, value, tag }) => (
            <div key={date} style={{ background: FAINT, borderRadius: 12, padding: '16px 18px', border: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ textAlign: 'center', minWidth: 40 }}>
                <p style={{ fontFamily: F, fontWeight: 800, fontSize: 20, color: NAVY, lineHeight: 1 }}>{date.split('/')[0]}</p>
                <p style={{ fontFamily: F, fontSize: 10.5, color: MUTED, marginTop: 2 }}>{weekday}</p>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontFamily: F, fontWeight: 700, fontSize: 13, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{recipient}</p>
                <p style={{ fontFamily: F, fontWeight: 800, fontSize: 15, color: NAVY, marginTop: 2 }}>{fmtBRL(value)}</p>
              </div>
              {tag && <span style={{ fontFamily: F, fontWeight: 700, fontSize: 10.5, padding: '3px 8px', borderRadius: 6, background: `${MINT}20`, color: MINT_D }}>{tag}</span>}
            </div>
          ))}
          {loading ? (
            <div style={{ gridColumn: '1/-1', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} style={{ background: FAINT, borderRadius: 12, padding: '16px 18px', border: `1px solid ${BORDER}` }}>
                  <Skeleton height={10} radius={8} width="55%" />
                  <div style={{ height: 10 }} />
                  <Skeleton height={14} radius={8} width="35%" />
                </div>
              ))}
            </div>
          ) : agendados.length === 0 ? (
            <div style={{ gridColumn: '1/-1' }}>
              <EmptyState icon={<ArrowRightLeft size={18} style={{ color: NAVY }} />} title="Nenhum repasse agendado" description="Quando houver repasses pendentes, eles aparecerÃ£o aqui." />
            </div>
          ) : null}
        </div>
      </div>

      <div>
        <div style={{ background: 'white', borderRadius: 14, border: `1px solid ${BORDER}`, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 6, flex: 1, flexWrap: 'wrap' }}>
            {filters.map((s) => (
              <button key={s} onClick={() => setFilter(s)} style={{ padding: '6px 13px', borderRadius: 8, fontFamily: F, fontWeight: 600, fontSize: 12.5, cursor: 'pointer', transition: 'all .15s', border: filter === s ? 'none' : `1px solid ${BORDER}`, background: filter === s ? NAVY : 'white', color: filter === s ? 'white' : MUTED }}>
                {s}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select value={receiverId} onChange={(e) => setReceiverId(e.target.value)} style={{ padding: '8px 12px', borderRadius: 10, fontFamily: F, fontWeight: 700, fontSize: 12.5, color: TEXT, background: 'white', border: `1px solid ${BORDER}` }}>
              {receivers.map((r: any) => (
                <option key={r.id} value={r.id}>
                  {r.name} Â· {r.document}
                </option>
              ))}
            </select>
            <input value={amountBRL} onChange={(e) => setAmountBRL(maskBRLInput(e.target.value))} placeholder="Valor (R$)" style={{ padding: '8px 12px', borderRadius: 10, fontFamily: F, fontWeight: 700, fontSize: 12.5, color: TEXT, background: 'white', border: `1px solid ${BORDER}`, width: 140 }} />
            <button
              disabled={creating}
              onClick={async () => {
                const amount = parseAmountBRL(amountBRL)
                if (!receiverId || !amount) return
                if (amount > balance) {
                  setError('Saldo insuficiente para repasse.')
                  return
                }
                setCreating(true)
                setError(null)
                try {
                  const res = await fetch('/api/payouts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ receiverId, amount }) })
                  const json = await res.json().catch(() => null)
                  if (!res.ok) {
                    setError(toUserFacingError(json?.error, 'Ocorreu um erro ao solicitar repasse. Tente novamente.', '/api/payouts'))
                    return
                  }
                  const listRes = await fetch('/api/payouts', { method: 'GET' })
                  const listJson = await listRes.json().catch(() => null)
                  if (listRes.ok) setPayouts(Array.isArray(listJson?.payouts) ? listJson.payouts : [])
                } finally {
                  setCreating(false)
                }
              }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, fontFamily: F, fontWeight: 800, fontSize: 12.5, color: NAVY, background: MINT, border: 'none', cursor: creating ? 'default' : 'pointer', opacity: creating ? 0.7 : 1 }}
            >
              <ArrowRightLeft size={13} /> {creating ? 'Solicitando...' : 'Solicitar repasse'}
            </button>
            <button
              disabled={loading || filtered.length === 0}
              onClick={() => {
                const out = filtered.map((r: any) => ({
                  payout_id: r.id,
                  recipient: r.recipient,
                  document: r.doc,
                  gross_amount_cents: r.gross,
                  fee_amount_cents: r.fee,
                  net_amount_cents: r.net,
                  bank: r.bank,
                  status: r.status,
                  created_at: r.date,
                  scheduled_for: r.scheduled_for ?? null,
                }))
                downloadCsv('payouts.csv', out)
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 14px',
                borderRadius: 9,
                fontFamily: F,
                fontWeight: 600,
                fontSize: 12.5,
                color: MUTED,
                background: 'white',
                border: `1px solid ${BORDER}`,
                cursor: loading || filtered.length === 0 ? 'default' : 'pointer',
                opacity: loading || filtered.length === 0 ? 0.6 : 1,
              }}
            >
              <Download size={13} /> Exportar
            </button>
          </div>
        </div>
        {error && <Notice style={{ marginBottom: 12 }}>{error}</Notice>}
        <TableCard>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#FAFBFD' }}>
                {['ID Repasse', 'Recebedor', 'Valor bruto', 'Taxa', 'Valor lÃ­quido', 'Conta destino', 'Status', 'Data', 'AÃ§Ã£o'].map((h) => <Th key={h}>{h}</Th>)}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} style={{ transition: 'background .12s' }} onMouseEnter={(e) => (e.currentTarget.style.background = FAINT)} onMouseLeave={(e) => (e.currentTarget.style.background = '')}>
                  <td style={{ padding: '13px 20px', borderBottom: `1px solid ${BORDER}`, fontFamily: MONO, fontSize: 12, color: MUTED }}>{r.id}</td>
                  <td style={{ padding: '13px 20px', borderBottom: `1px solid ${BORDER}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 9, background: NAVY, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: F, fontWeight: 800, fontSize: 11, color: MINT, flexShrink: 0 }}>{initials(r.recipient)}</div>
                      <div>
                        <p style={{ fontFamily: F, fontWeight: 600, fontSize: 13, color: TEXT }}>{r.recipient}</p>
                        <p style={{ fontFamily: MONO, fontSize: 10.5, color: MUTED }}>{r.doc}</p>
                      </div>
                    </div>
                  </td>
                  <Td>
                    <span style={{ fontFamily: MONO, fontWeight: 700 }}>{fmtBRL(r.gross)}</span>
                  </Td>
                  <td style={{ padding: '13px 20px', borderBottom: `1px solid ${BORDER}`, fontFamily: MONO, fontSize: 13, color: '#DC2626', fontWeight: 600 }}>âˆ’ {fmtBRL(r.fee)}</td>
                  <Td>
                    <span style={{ fontFamily: MONO, fontWeight: 800, color: '#059669' }}>{fmtBRL(r.net)}</span>
                  </Td>
                  <td style={{ padding: '13px 20px', borderBottom: `1px solid ${BORDER}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Building2 size={12} style={{ color: MUTED, flexShrink: 0 }} />
                      <span style={{ fontFamily: F, fontSize: 12, color: MUTED }}>{r.bank}</span>
                    </div>
                  </td>
                  <td style={{ padding: '13px 20px', borderBottom: `1px solid ${BORDER}` }}>
                    <Badge status={r.status} />
                  </td>
                  <td style={{ padding: '13px 20px', borderBottom: `1px solid ${BORDER}`, fontFamily: MONO, fontSize: 11.5, color: MUTED, whiteSpace: 'nowrap' }}>{r.date}</td>
                  <td style={{ padding: '13px 20px', borderBottom: `1px solid ${BORDER}` }}>
                    {r.status !== 'Liquidado' ? (
                      <button
                        disabled={liquidatingId === String(r.id)}
                        onClick={async () => {
                          if (liquidatingId) return
                          const ok = await confirm({
                            title: 'Marcar repasse como liquidado?',
                            description: 'Esta aÃ§Ã£o atualizarÃ¡ o status do repasse para liquidado.',
                            confirmLabel: 'Liquidar',
                          })
                          if (!ok) return
                          setError(null)
                          setLiquidatingId(String(r.id))
                          try {
                            const res = await fetch(`/api/payouts/${r.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'paid' }) })
                            const json = await res.json().catch(() => null)
                            if (!res.ok) {
                              setError(toUserFacingError(json?.error, 'NÃ£o foi possÃ­vel atualizar o repasse agora. Tente novamente.', `/api/payouts/${r.id}`))
                              return
                            }
                            const listRes = await fetch('/api/payouts', { method: 'GET' })
                            const listJson = await listRes.json().catch(() => null)
                            if (listRes.ok) setPayouts(Array.isArray(listJson?.payouts) ? listJson.payouts : [])
                          } finally {
                            setLiquidatingId(null)
                          }
                        }}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 9, fontFamily: F, fontWeight: 700, fontSize: 12, color: NAVY, background: FAINT, border: `1px solid ${BORDER}`, cursor: liquidatingId === String(r.id) ? 'default' : 'pointer', opacity: liquidatingId === String(r.id) ? 0.7 : 1 }}
                      >
                        {liquidatingId === String(r.id) ? <span className="inline-block w-4 h-4 rounded-full border-2 border-[#94A3B8] border-t-transparent animate-spin" /> : <CheckCircle2 size={12} />}
                        {liquidatingId === String(r.id) ? 'Liquidandoâ€¦' : 'Liquidar'}
                      </button>
                    ) : (
                      <span style={{ fontFamily: F, fontSize: 12, color: MUTED }}>â€”</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {loading ? (
            <TableSkeleton rows={7} cols={9} />
          ) : filtered.length === 0 ? (
            <EmptyState icon={<ArrowRightLeft size={18} style={{ color: NAVY }} />} title="Nenhum repasse encontrado" description="NÃ£o hÃ¡ repasses para o filtro atual." />
          ) : null}
        </TableCard>
      </div>
    </div>
    {confirmDialog}
    </>
  )
}

export function ConfiguracoesScreen() {
  const router = useRouter()
  const [notifEmail, setNotifEmail] = useState(true)
  const [notifSMS, setNotifSMS] = useState(false)
  const [notifWebhook, setNotifWebhook] = useState(true)
  const [notifPrefsUpdatedAt, setNotifPrefsUpdatedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingOrg, setSavingOrg] = useState(false)
  const [savingNotifPrefs, setSavingNotifPrefs] = useState(false)
  const [endingSession, setEndingSession] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [title, setTitle] = useState('')

  const [orgLegalName, setOrgLegalName] = useState('')
  const [orgDocument, setOrgDocument] = useState('')
  const [orgName, setOrgName] = useState('')
  const [orgSegment, setOrgSegment] = useState('E-commerce')
  const [orgWebsite, setOrgWebsite] = useState('')

  const sectionBox: React.CSSProperties = { background: 'white', borderRadius: 16, border: `1px solid ${BORDER}`, boxShadow: '0 1px 4px rgba(2,27,91,.04)', overflow: 'hidden' }
  const sectionHeader: React.CSSProperties = { padding: '18px 28px', borderBottom: `1px solid ${BORDER}`, fontFamily: F, fontWeight: 700, fontSize: 15, color: TEXT }
  const row: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 28px', borderBottom: `1px solid ${BORDER}` }
  const inp: React.CSSProperties = { background: FAINT, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 14px', fontFamily: F, fontSize: 13.5, color: TEXT, outline: 'none', width: '100%', boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { fontFamily: F, fontWeight: 600, fontSize: 12, color: NAVY, display: 'block', marginBottom: 5 }

  const applyNotificationPreferences = useCallback((payload: any) => {
    const preferences = payload?.preferences ?? {}
    setNotifEmail(Boolean(preferences.emailEnabled ?? true))
    setNotifSMS(Boolean(preferences.smsEnabled ?? false))
    setNotifWebhook(Boolean(preferences.webhookEnabled ?? true))
    setNotifPrefsUpdatedAt(typeof preferences.updatedAt === 'string' ? preferences.updatedAt : null)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    let alive = true
    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        const [me, orgRes, notifRes] = await Promise.all([
          getMeCached().catch(() => null),
          fetch('/api/organization', { method: 'GET', signal: controller.signal }),
          fetch('/api/notifications?limit=1&sync=false', { method: 'GET', signal: controller.signal }),
        ])
        const orgJson = await orgRes.json().catch(() => null)
        const notifJson = await notifRes.json().catch(() => null)
        if (!alive) return

        if (me) {
          setFullName(String(me.fullName ?? ''))
          setEmail(String(me.email ?? ''))
          setPhone(String((me as any).phone ?? ''))
          setTitle(String((me as any).title ?? ''))
        }

        if (orgRes.ok && orgJson?.organization) {
          setOrgName(String(orgJson.organization.name ?? ''))
          setOrgDocument(String(orgJson.organization.document ?? ''))
          setOrgLegalName(String(orgJson.organization.legal_name ?? orgJson.organization.legalName ?? ''))
          setOrgSegment(String(orgJson.organization.segment ?? 'E-commerce'))
          setOrgWebsite(String(orgJson.organization.website ?? ''))
        }

        if (notifRes.ok) applyNotificationPreferences(notifJson)

        const nextError =
          !orgRes.ok
            ? toUserFacingError(orgJson?.error, 'NÃ£o foi possÃ­vel exibir a organizaÃ§Ã£o agora. Tente novamente.', '/api/organization')
            : !notifRes.ok
              ? toUserFacingError(notifJson?.error, 'NÃ£o foi possÃ­vel exibir as preferÃªncias de notificaÃ§Ã£o agora. Tente novamente.', '/api/notifications')
              : null

        if (nextError) setError(nextError)
      } catch (e) {
        if (!alive || controller.signal.aborted) return
        const msg = String((e as any)?.message ?? e)
        if (!msg.includes('Failed to fetch')) logError('ConfiguracoesScreen load failed', e)
        setError('NÃ£o foi possÃ­vel exibir as configuraÃ§Ãµes agora. Tente novamente.')
      } finally {
        if (alive) setLoading(false)
      }
    }
    void run()
    return () => {
      alive = false
      controller.abort()
    }
  }, [applyNotificationPreferences])

  const saveNotificationPreferences = useCallback(
    async (patch: { emailEnabled?: boolean; smsEnabled?: boolean; webhookEnabled?: boolean }) => {
      if (loading || savingNotifPrefs) return

      const previous = {
        email: notifEmail,
        sms: notifSMS,
        webhook: notifWebhook,
        updatedAt: notifPrefsUpdatedAt,
      }

      const nextEmail = typeof patch.emailEnabled === 'boolean' ? patch.emailEnabled : previous.email
      const nextSms = typeof patch.smsEnabled === 'boolean' ? patch.smsEnabled : previous.sms
      const nextWebhook = typeof patch.webhookEnabled === 'boolean' ? patch.webhookEnabled : previous.webhook

      setNotifEmail(nextEmail)
      setNotifSMS(nextSms)
      setNotifWebhook(nextWebhook)
      setSavingNotifPrefs(true)
      setError(null)
      setInfo(null)

      try {
        const res = await fetch('/api/notifications', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(patch),
        })
        const json = await res.json().catch(() => null)
        if (!res.ok) {
          setNotifEmail(previous.email)
          setNotifSMS(previous.sms)
          setNotifWebhook(previous.webhook)
          setNotifPrefsUpdatedAt(previous.updatedAt)
          setError(toUserFacingError(json?.error, 'NÃ£o foi possÃ­vel salvar as preferÃªncias de notificaÃ§Ã£o agora. Tente novamente.', '/api/notifications'))
          return
        }

        applyNotificationPreferences(json)
        setInfo('PreferÃªncias de notificaÃ§Ã£o atualizadas com sucesso.')
        emitAppToast({ tone: 'success', title: 'PreferÃªncias salvas', message: 'As preferÃªncias de notificaÃ§Ã£o foram atualizadas.' })
      } finally {
        setSavingNotifPrefs(false)
      }
    },
    [applyNotificationPreferences, loading, notifEmail, notifPrefsUpdatedAt, notifSMS, notifWebhook, savingNotifPrefs],
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 860 }}>
      {error && <Notice>{error}</Notice>}
      {info && <div style={{ fontFamily: F, fontSize: 13.5, color: '#059669' }}>{info}</div>}
      <div style={sectionBox}>
        <div id="perfil-da-conta" style={sectionHeader}>Perfil da conta</div>
        <div className="flex flex-col md:flex-row" style={{ padding: '24px 28px', display: 'flex', alignItems: 'flex-start', gap: 24 }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: MINT, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 22, color: NAVY, fontFamily: F }}>
              {initials(fullName || email || 'â€”')}
            </div>
            <div style={{ position: 'absolute', bottom: -10, left: '50%', transform: 'translateX(-50%)', padding: '3px 8px', borderRadius: 999, background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE', fontFamily: F, fontSize: 10.5, fontWeight: 700, whiteSpace: 'nowrap' }}>
              Avatar automático
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2" style={{ flex: 1, display: 'grid', gap: 16 }}>
            <div>
              <label style={lbl}>Nome completo</label>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} style={inp} />
              <p style={{ fontFamily: F, fontSize: 11.5, color: MUTED, marginTop: 6 }}>Este nome aparece para identificar a conta dentro da plataforma.</p>
            </div>
            <div>
              <label style={lbl}>E-mail</label>
              <input placeholder="voce@empresa.com" value={email} onChange={(e) => setEmail(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>Telefone</label>
              <input placeholder="(11) 99999-0000" value={phone} onChange={(e) => setPhone(maskPhoneBR(e.target.value))} style={inp} />
            </div>
            <div>
              <label style={lbl}>Cargo</label>
              <input placeholder="Ex: Financeiro, OperaÃ§Ãµes, Founder" value={title} onChange={(e) => setTitle(e.target.value)} style={inp} />
            </div>
          </div>
        </div>
        <div style={{ padding: '0 28px 24px', display: 'flex', justifyContent: 'flex-end' }}>
          <PrimaryBtn
            size="sm"
            disabled={loading || savingProfile}
            onClick={async () => {
              if (loading || savingProfile) return
              setError(null)
              setInfo(null)
              setSavingProfile(true)
              try {
                const res = await fetch('/api/me', {
                  method: 'PUT',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ fullName, email, phone, title }),
                })
                const json = await res.json().catch(() => null)
                if (!res.ok) {
                  setError(toUserFacingError(json?.error, 'NÃ£o foi possÃ­vel salvar seu perfil agora. Tente novamente.', '/api/me'))
                  return
                }
                setInfo('Perfil atualizado com sucesso.')
                emitAppToast({ tone: 'success', title: 'Perfil salvo', message: 'As alteraÃ§Ãµes do perfil foram salvas com sucesso.' })
                const next = await getMeCached({ force: true }).catch(() => null)
                if (next) {
                  setFullName(String(next.fullName ?? ''))
                  setEmail(String(next.email ?? ''))
                  setPhone(String((next as any).phone ?? ''))
                  setTitle(String((next as any).title ?? ''))
                }
              } finally {
                setSavingProfile(false)
              }
            }}
          >
            {savingProfile ? 'Salvando...' : 'Salvar alteraÃ§Ãµes'}
          </PrimaryBtn>
        </div>
      </div>

      <div style={sectionBox}>
        <div style={sectionHeader}>Dados da empresa</div>
        <div className="grid grid-cols-1 md:grid-cols-2" style={{ padding: '24px 28px', display: 'grid', gap: 16 }}>
          <div style={{ gridColumn: '1/-1' }}>
            <label style={lbl}>RazÃ£o social</label>
            <input placeholder="Nome da empresa no contrato social" value={orgLegalName} onChange={(e) => setOrgLegalName(e.target.value)} style={inp} />
          </div>
          <div>
            <label style={lbl}>CNPJ</label>
            <input placeholder="00.000.000/0001-00" value={orgDocument} onChange={(e) => setOrgDocument(maskCpfCnpj(e.target.value))} style={inp} />
          </div>
          <div>
            <label style={lbl}>Nome fantasia</label>
            <input placeholder="Nome que seus clientes conhecem" value={orgName} onChange={(e) => setOrgName(e.target.value)} style={inp} />
          </div>
          <div>
            <label style={lbl}>Segmento</label>
            <select value={orgSegment} onChange={(e) => setOrgSegment(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
              {['E-commerce', 'SaaS / Software', 'ServiÃ§os profissionais', 'EducaÃ§Ã£o', 'SaÃºde'].map((o) => <option key={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Site</label>
            <input placeholder="https://suaempresa.com.br" value={orgWebsite} onChange={(e) => setOrgWebsite(e.target.value)} style={inp} />
          </div>
        </div>
        <div style={{ padding: '0 28px 24px', display: 'flex', justifyContent: 'flex-end' }}>
          <PrimaryBtn
            size="sm"
            disabled={loading || savingOrg}
            onClick={async () => {
              if (loading || savingOrg) return
              setError(null)
              setInfo(null)
              setSavingOrg(true)
              try {
                const res = await fetch('/api/organization', {
                  method: 'PUT',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ name: orgName, document: orgDocument, legalName: orgLegalName, segment: orgSegment, website: orgWebsite }),
                })
                const json = await res.json().catch(() => null)
                if (!res.ok) {
                  setError(toUserFacingError(json?.error, 'NÃ£o foi possÃ­vel salvar a organizaÃ§Ã£o agora. Tente novamente.', '/api/organization'))
                  return
                }
                setInfo('Dados da empresa atualizados com sucesso.')
                emitAppToast({ tone: 'success', title: 'Empresa atualizada', message: 'Os dados da empresa foram salvos com sucesso.' })
              } finally {
                setSavingOrg(false)
              }
            }}
          >
            {savingOrg ? 'Salvando...' : 'Salvar alteraÃ§Ãµes'}
          </PrimaryBtn>
        </div>
      </div>

      <div style={sectionBox}>
        <div style={sectionHeader}>SeguranÃ§a</div>
        <div style={{ ...row }}>
          <div>
            <p style={{ fontFamily: F, fontWeight: 600, fontSize: 13.5, color: TEXT }}>Proteção de login</p>
            <p style={{ fontFamily: F, fontSize: 12, color: MUTED, marginTop: 2 }}>Autenticação e políticas de sessão são controladas pelo provedor de identidade da plataforma.</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontFamily: F, fontWeight: 700, fontSize: 11.5, color: '#059669', background: '#ECFDF5', padding: '3px 9px', borderRadius: 6 }}>Gerenciado</span>
          </div>
        </div>
        <div style={{ ...row }}>
          <div>
            <p style={{ fontFamily: F, fontWeight: 600, fontSize: 13.5, color: TEXT }}>Alterar senha</p>
            <p style={{ fontFamily: F, fontSize: 12, color: MUTED, marginTop: 2 }}>Use o fluxo seguro de redefinição para atualizar sua senha sem expor dados sensíveis.</p>
          </div>
          <GhostBtn onClick={() => router.push('/reset-password')}>Alterar senha</GhostBtn>
        </div>
        <div style={{ ...row, borderBottom: 'none' }}>
          <div>
            <p style={{ fontFamily: F, fontWeight: 600, fontSize: 13.5, color: TEXT }}>Sessão atual</p>
            <p style={{ fontFamily: F, fontSize: 12, color: MUTED, marginTop: 2 }}>Você pode encerrar a sessão atual com segurança a qualquer momento. Outras sessões são geridas pelo provedor de autenticação.</p>
          </div>
          <GhostBtn
            onClick={async () => {
              if (endingSession) return
              setEndingSession(true)
              try {
                await signOut()
              } finally {
                setEndingSession(false)
              }
            }}
          >
            {endingSession ? 'Encerrando...' : 'Encerrar sessão'}
          </GhostBtn>
        </div>
      </div>

      <div style={sectionBox}>
        <div style={sectionHeader}>NotificaÃ§Ãµes</div>
        {[
          { label: 'NotificaÃ§Ãµes por e-mail', desc: 'Pagamentos, repasses e alertas por e-mail', on: notifEmail, submit: (next: boolean) => void saveNotificationPreferences({ emailEnabled: next }) },
          { label: 'SMS', desc: 'Alertas crÃ­ticos via mensagem de texto', on: notifSMS, submit: (next: boolean) => void saveNotificationPreferences({ smsEnabled: next }) },
          { label: 'Webhook', desc: 'Disparar eventos para a sua URL de webhook', on: notifWebhook, submit: (next: boolean) => void saveNotificationPreferences({ webhookEnabled: next }) },
        ].map(({ label, desc, on, submit }, idx, arr) => (
          <div key={label} style={{ ...row, borderBottom: idx < arr.length - 1 ? `1px solid ${BORDER}` : 'none' }}>
            <div>
              <p style={{ fontFamily: F, fontWeight: 600, fontSize: 13.5, color: TEXT }}>{label}</p>
              <p style={{ fontFamily: F, fontSize: 12, color: MUTED, marginTop: 2 }}>{desc}</p>
            </div>
            <Toggle on={on} set={submit} disabled={loading || savingNotifPrefs} />
          </div>
        ))}
        <div style={{ padding: '14px 28px', borderTop: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <p style={{ fontFamily: F, fontSize: 11.5, color: MUTED }}>
            {savingNotifPrefs ? 'Salvando preferÃªncias...' : notifPrefsUpdatedAt ? `Atualizado em ${new Date(notifPrefsUpdatedAt).toLocaleString('pt-BR')}` : 'As alteraÃ§Ãµes sÃ£o salvas automaticamente.'}
          </p>
          <span style={{ fontFamily: F, fontWeight: 700, fontSize: 11.5, color: savingNotifPrefs ? NAVY : '#059669' }}>
            {savingNotifPrefs ? 'Sincronizando' : 'Sincronizado'}
          </span>
        </div>
      </div>
    </div>
  )
}

export function IntegracoesScreen() {
  const { confirm, confirmDialog } = useConfirmDialog()
  const [showKey, setShowKey] = useState(false)
  const [showToken, setShowToken] = useState(false)
  const [env, setEnv] = useState<'sandbox' | 'production'>('production')
  const [loading, setLoading] = useState(true)
  const [savingEnv, setSavingEnv] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [provider, setProvider] = useState<any | null>(null)
  const [apiKeys, setApiKeys] = useState<any[]>([])
  const [tokens, setTokens] = useState<any[]>([])
  const [lastApiKey, setLastApiKey] = useState<string | null>(null)
  const [lastToken, setLastToken] = useState<string | null>(null)
  const [creatingKey, setCreatingKey] = useState(false)
  const [creatingToken, setCreatingToken] = useState(false)
  const [rotatingKeyId, setRotatingKeyId] = useState<string | null>(null)
  const [revokingKeyId, setRevokingKeyId] = useState<string | null>(null)
  const [rotatingTokenId, setRotatingTokenId] = useState<string | null>(null)
  const [revokingTokenId, setRevokingTokenId] = useState<string | null>(null)

  const sectionBox: React.CSSProperties = { background: 'white', borderRadius: 16, border: `1px solid ${BORDER}`, boxShadow: '0 1px 4px rgba(2,27,91,.04)', overflow: 'hidden' }
  const sectionHeader: React.CSSProperties = { padding: '18px 28px', borderBottom: `1px solid ${BORDER}`, fontFamily: F, fontWeight: 700, fontSize: 15, color: TEXT }

  const loadKeys = async () => {
    const ks = await fetch('/api/integrations/api-keys', { method: 'GET' })
    const ksJson = await ks.json().catch(() => null)
    if (!ks.ok) throw new Error(toUserFacingError(ksJson?.error, 'Ocorreu um erro ao carregar suas chaves. Tente novamente.', '/api/integrations/api-keys'))
    setApiKeys(Array.isArray(ksJson?.apiKeys) ? ksJson.apiKeys : [])
  }

  const loadTokens = async () => {
    const ts = await fetch('/api/integrations/tokens', { method: 'GET' })
    const tsJson = await ts.json().catch(() => null)
    if (!ts.ok) throw new Error(toUserFacingError(tsJson?.error, 'Ocorreu um erro ao carregar seus tokens. Tente novamente.', '/api/integrations/tokens'))
    setTokens(Array.isArray(tsJson?.tokens) ? tsJson.tokens : [])
  }

  const createApiKey = async () => {
    if (creatingKey) return
    setCreatingKey(true)
    setError(null)
    setLastApiKey(null)
    try {
      const res = await fetch('/api/integrations/api-keys', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: env === 'production' ? 'Chave de produÃ§Ã£o' : 'Chave de sandbox', env }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        logError('IntegracoesScreen: create api key failed', { status: res.status, error: json?.error })
        setError(toUserFacingError(json?.error, 'NÃ£o foi possÃ­vel gerar a chave. Tente novamente.', '/api/integrations/api-keys'))
        return
      }
      setLastApiKey(json?.apiKey?.key ?? null)
      emitAppToast({ tone: 'success', title: 'Chave gerada', message: 'A nova chave foi gerada. Copie agora e guarde em local seguro.' })
      await loadKeys()
    } finally {
      setCreatingKey(false)
    }
  }

  const createToken = async () => {
    if (creatingToken) return
    setCreatingToken(true)
    setError(null)
    setLastToken(null)
    try {
      const res = await fetch('/api/integrations/tokens', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Token de integraÃ§Ã£o', env }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        logError('IntegracoesScreen: create token failed', { status: res.status, error: json?.error })
        setError(toUserFacingError(json?.error, 'NÃ£o foi possÃ­vel gerar o token. Tente novamente.', '/api/integrations/tokens'))
        return
      }
      setLastToken(json?.token?.token ?? null)
      emitAppToast({ tone: 'success', title: 'Token gerado', message: 'O novo token foi gerado. Copie agora e guarde em local seguro.' })
      await loadTokens()
    } finally {
      setCreatingToken(false)
    }
  }

  useEffect(() => {
    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        const [ps, ks, ts] = await Promise.all([
          fetch('/api/provider-settings', { method: 'GET' }),
          fetch('/api/integrations/api-keys', { method: 'GET' }),
          fetch('/api/integrations/tokens', { method: 'GET' }),
        ])

        const psJson = await ps.json().catch(() => null)
        const ksJson = await ks.json().catch(() => null)
        const tsJson = await ts.json().catch(() => null)

        if (ps.ok) {
          setProvider(psJson?.providerSettings ?? null)
          if (psJson?.providerSettings?.environment === 'sandbox') setEnv('sandbox')
        }
        if (ks.ok) setApiKeys(Array.isArray(ksJson?.apiKeys) ? ksJson.apiKeys : [])
        if (ts.ok) setTokens(Array.isArray(tsJson?.tokens) ? tsJson.tokens : [])

        if (!ps.ok) {
          logError('IntegracoesScreen: provider-settings failed', { status: ps.status, error: psJson?.error })
          setError(toUserFacingError(psJson?.error, 'Ocorreu um erro ao carregar integraÃ§Ãµes. Tente novamente.', '/api/provider-settings'))
        }
      } catch (e) {
        logError('IntegracoesScreen: load failed', e)
        setError(toUserFacingError(e instanceof Error ? e.message : String(e), 'Ocorreu um erro ao carregar integraÃ§Ãµes. Tente novamente.', 'IntegracoesScreen'))
      } finally {
        setLoading(false)
      }
    }
    void run()
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 860 }}>
      {error && <Notice>{error}</Notice>}
      <div style={sectionBox}>
        <div style={sectionHeader}>Ambientes</div>
        <div style={{ padding: '22px 28px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <p style={{ fontFamily: F, fontWeight: 700, fontSize: 13.5, color: TEXT, marginBottom: 4 }}>Ambiente ativo</p>
            <p style={{ fontFamily: F, fontSize: 12.5, color: MUTED, lineHeight: 1.6 }}>Selecione o ambiente de integraÃ§Ã£o para chaves, tokens e endpoints.</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['sandbox', 'production'] as const).map((e) => (
              <button
                key={e}
                onClick={async () => {
                  if (savingEnv) return
                  const prev = env
                  setEnv(e)
                  setSavingEnv(true)
                  setError(null)
                  try {
                    const res = await fetch('/api/provider-settings', {
                      method: 'PUT',
                      headers: { 'content-type': 'application/json' },
                      body: JSON.stringify({ environment: e }),
                    })
                    const json = await res.json().catch(() => null)
                    if (!res.ok) {
                      logError('IntegracoesScreen: save env failed', { status: res.status, error: json?.error })
                      setEnv(prev)
                      setError(toUserFacingError(json?.error, 'NÃ£o foi possÃ­vel atualizar o ambiente. Tente novamente.', '/api/provider-settings'))
                    } else {
                      setProvider(json?.providerSettings ?? provider)
                    }
                  } finally {
                    setSavingEnv(false)
                  }
                }}
                style={{
                  padding: '8px 14px',
                  borderRadius: 9,
                  fontFamily: F,
                  fontWeight: 800,
                  fontSize: 12.5,
                  cursor: savingEnv ? 'default' : 'pointer',
                  border: env === e ? 'none' : `1px solid ${BORDER}`,
                  background: env === e ? (e === 'sandbox' ? '#FFFBEB' : '#ECFDF5') : 'white',
                  color: env === e ? (e === 'sandbox' ? '#D97706' : '#059669') : MUTED,
                  opacity: savingEnv ? 0.75 : 1,
                }}
                disabled={savingEnv}
              >
                {e === 'sandbox' ? 'Sandbox' : 'ProduÃ§Ã£o'}
              </button>
            ))}
          </div>
        </div>
        <div style={{ padding: '0 28px 22px' }}>
          <div style={{ background: FAINT, borderRadius: 12, border: `1px solid ${BORDER}`, padding: '14px 16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
            {[
              { label: 'Endpoint base', value: provider?.base_url ?? (env === 'production' ? 'https://api.connektpay.com.br/v2' : 'https://sandbox.api.connektpay.com.br/v2') },
              { label: 'Webhook URL', value: provider?.webhook_url ?? (env === 'production' ? 'https://hooks.connektpay.com.br/events' : 'https://sandbox.hooks.connektpay.com.br/events') },
            ].map(({ label, value }) => (
              <div key={label}>
                <p style={{ fontFamily: F, fontSize: 11, color: MUTED, marginBottom: 3 }}>{label}</p>
                <p style={{ fontFamily: MONO, fontSize: 12.5, color: TEXT, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={sectionBox}>
        <div style={{ ...sectionHeader, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>Chaves de API</span>
          <PrimaryBtn
            size="sm"
            loading={creatingKey}
            disabled={creatingKey || loading}
            onClick={createApiKey}
          >
            <Plus size={13} /> Gerar nova chave
          </PrimaryBtn>
        </div>
        {lastApiKey && (
          <div style={{ padding: '18px 28px', borderBottom: `1px solid ${BORDER}` }}>
            <p style={{ fontFamily: F, fontWeight: 700, fontSize: 13.5, color: TEXT, marginBottom: 10 }}>Chave gerada (copie agora)</p>
            <div style={{ background: FAINT, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <code style={{ fontFamily: MONO, fontSize: 12.5, color: TEXT, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lastApiKey}</code>
              <button
                onClick={async () => {
                  await copyWithFeedback(lastApiKey, 'Chave copiada com sucesso.')
                }}
                aria-label="Copiar chave"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED }}
              >
                <Copy size={14} />
              </button>
            </div>
          </div>
        )}
        {loading ? (
          <div style={{ padding: '18px 28px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} style={{ background: FAINT, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14 }}>
                <Skeleton width={180} height={12} radius={8} />
                <div style={{ height: 10 }} />
                <Skeleton width="100%" height={12} radius={8} />
              </div>
            ))}
          </div>
        ) : (
          apiKeys.map((k, i) => (
          <div key={k.id} style={{ padding: '18px 28px', borderBottom: i < apiKeys.length - 1 ? `1px solid ${BORDER}` : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <p style={{ fontFamily: F, fontWeight: 700, fontSize: 13.5, color: TEXT }}>{k.name}</p>
                <span style={{ fontFamily: F, fontWeight: 700, fontSize: 10.5, padding: '2px 7px', borderRadius: 5, background: k.env === 'production' ? '#ECFDF5' : '#FFFBEB', color: k.env === 'production' ? '#059669' : '#D97706' }}>{k.env === 'production' ? 'ProduÃ§Ã£o' : 'Sandbox'}</span>
              </div>
              <span style={{ fontFamily: F, fontSize: 11.5, color: MUTED }}>Criada em {new Date(k.created_at).toLocaleDateString('pt-BR')}</span>
            </div>
            <div style={{ background: FAINT, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <code style={{ fontFamily: MONO, fontSize: 12.5, color: TEXT, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {showKey ? `${k.prefix}â€¦` : `${k.prefix}â€¢`.padEnd(34, 'â€¢')}
              </code>
              <button aria-label={showKey ? 'Ocultar chave' : 'Mostrar chave'} onClick={() => setShowKey(!showKey)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED }}>
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
              <button
                onClick={async () => {
                  await copyWithFeedback(k.prefix, 'Prefixo da chave copiado com sucesso.')
                }}
                aria-label="Copiar prefixo"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED }}
              >
                <Copy size={14} />
              </button>
              <button
                onClick={async () => {
                  if (rotatingKeyId || revokingKeyId || creatingKey || creatingToken) return
                  setError(null)
                  setLastApiKey(null)
                  const ok = await confirm({
                    title: 'Rotacionar chave?',
                    description: 'A chave atual serÃ¡ revogada e uma nova serÃ¡ gerada.',
                    confirmLabel: 'Rotacionar',
                  })
                  if (!ok) return
                  setRotatingKeyId(String(k.id))
                  try {
                    const res = await fetch(`/api/integrations/api-keys/${k.id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: k.name }) })
                    const json = await res.json().catch(() => null)
                    if (!res.ok) {
                      logError('IntegracoesScreen: rotate api key failed', { id: k.id, status: res.status, error: json?.error })
                      setError(toUserFacingError(json?.error, 'NÃ£o foi possÃ­vel rotacionar a chave. Tente novamente.', `/api/integrations/api-keys/${k.id}`))
                      return
                    }
                    setLastApiKey(json?.apiKey?.key ?? null)
                    await loadKeys()
                  } finally {
                    setRotatingKeyId(null)
                  }
                }}
                aria-label="Rotacionar chave"
                disabled={rotatingKeyId === String(k.id) || Boolean(revokingKeyId)}
                style={{ background: 'none', border: 'none', cursor: rotatingKeyId === String(k.id) || Boolean(revokingKeyId) ? 'default' : 'pointer', color: MUTED, opacity: rotatingKeyId === String(k.id) || Boolean(revokingKeyId) ? 0.6 : 1 }}
              >
                {rotatingKeyId === String(k.id) ? <span className="inline-block w-4 h-4 rounded-full border-2 border-[#94A3B8] border-t-transparent animate-spin" /> : <RotateCcw size={14} />}
              </button>
              <button
                onClick={async () => {
                  if (rotatingKeyId || revokingKeyId || creatingKey || creatingToken) return
                  setError(null)
                  const ok = await confirm({
                    title: 'Revogar chave?',
                    description: 'Ela deixarÃ¡ de funcionar imediatamente.',
                    confirmLabel: 'Revogar',
                    danger: true,
                  })
                  if (!ok) return
                  setRevokingKeyId(String(k.id))
                  try {
                    const res = await fetch(`/api/integrations/api-keys/${k.id}`, { method: 'PATCH' })
                    const json = await res.json().catch(() => null)
                    if (!res.ok) {
                      logError('IntegracoesScreen: revoke api key failed', { id: k.id, status: res.status, error: json?.error })
                      setError(toUserFacingError(json?.error, 'NÃ£o foi possÃ­vel revogar a chave. Tente novamente.', `/api/integrations/api-keys/${k.id}`))
                      return
                    }
                    await loadKeys()
                  } finally {
                    setRevokingKeyId(null)
                  }
                }}
                aria-label="Revogar chave"
                disabled={revokingKeyId === String(k.id) || Boolean(rotatingKeyId)}
                style={{ background: 'none', border: 'none', cursor: revokingKeyId === String(k.id) || Boolean(rotatingKeyId) ? 'default' : 'pointer', color: MUTED, opacity: revokingKeyId === String(k.id) || Boolean(rotatingKeyId) ? 0.6 : 1 }}
              >
                {revokingKeyId === String(k.id) ? <span className="inline-block w-4 h-4 rounded-full border-2 border-[#94A3B8] border-t-transparent animate-spin" /> : <XCircle size={14} />}
              </button>
            </div>
          </div>
        ))
        )}
        {!loading && apiKeys.length === 0 && (
          <EmptyState
            icon={<Server size={18} style={{ color: NAVY }} />}
            title="Nenhuma chave cadastrada"
            description="Gere uma chave para comeÃ§ar a integrar sua aplicaÃ§Ã£o."
            primaryAction={{ label: 'Gerar nova chave', onClick: createApiKey, loading: creatingKey, disabled: creatingKey || loading }}
          />
        )}
      </div>

      <div style={sectionBox}>
        <div style={sectionHeader}>Webhooks</div>
        <div style={{ padding: '22px 28px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            { label: 'URL de recebimento', value: provider?.webhook_url ?? 'â€”' },
            { label: 'VersÃ£o do schema', value: 'v1' },
            { label: 'PolÃ­tica de retentativas', value: provider?.retry_policy ? '3 tentativas com backoff' : '3 tentativas com backoff' },
          ].map(({ label, value }) => (
            <div key={label} style={{ background: FAINT, borderRadius: 12, border: `1px solid ${BORDER}`, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontFamily: F, fontSize: 11, color: MUTED, marginBottom: 4 }}>{label}</p>
                <p style={{ fontFamily: MONO, fontSize: 12.5, color: TEXT, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</p>
              </div>
              <button
                onClick={async () => {
                  const v = String(value ?? '').trim()
                  if (!v || v === 'â€”') return
                  await copyWithFeedback(v, `${label} copiado com sucesso.`)
                }}
                aria-label={`Copiar: ${label}`}
                disabled={!String(value ?? '').trim() || String(value ?? '').trim() === 'â€”'}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: !String(value ?? '').trim() || String(value ?? '').trim() === 'â€”' ? 'default' : 'pointer',
                  color: MUTED,
                  opacity: !String(value ?? '').trim() || String(value ?? '').trim() === 'â€”' ? 0.5 : 1,
                }}
              >
                <Copy size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div style={sectionBox}>
        <div style={{ ...sectionHeader, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>Tokens</span>
          <PrimaryBtn
            size="sm"
            loading={creatingToken}
            disabled={creatingToken || loading}
            onClick={createToken}
          >
            <Plus size={13} /> Gerar token
          </PrimaryBtn>
        </div>
        {lastToken && (
          <div style={{ padding: '18px 28px', borderBottom: `1px solid ${BORDER}` }}>
            <p style={{ fontFamily: F, fontWeight: 700, fontSize: 13.5, color: TEXT, marginBottom: 10 }}>Token gerado (copie agora)</p>
            <div style={{ background: FAINT, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <code style={{ fontFamily: MONO, fontSize: 12.5, color: TEXT, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lastToken}</code>
              <button
                onClick={async () => {
                  await copyWithFeedback(lastToken, 'Token copiado com sucesso.')
                }}
                aria-label="Copiar token"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED }}
              >
                <Copy size={14} />
              </button>
            </div>
          </div>
        )}
        {loading ? (
          <div style={{ padding: '18px 28px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} style={{ background: FAINT, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14 }}>
                <Skeleton width={160} height={12} radius={8} />
                <div style={{ height: 10 }} />
                <Skeleton width="100%" height={12} radius={8} />
              </div>
            ))}
          </div>
        ) : (
          tokens.map((t, i) => (
          <div key={t.id} style={{ padding: '18px 28px', borderBottom: i < tokens.length - 1 ? `1px solid ${BORDER}` : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <p style={{ fontFamily: F, fontWeight: 700, fontSize: 13.5, color: TEXT }}>{t.name}</p>
                <span style={{ fontFamily: F, fontWeight: 700, fontSize: 10.5, padding: '2px 7px', borderRadius: 5, background: t.env === 'production' ? '#ECFDF5' : '#FFFBEB', color: t.env === 'production' ? '#059669' : '#D97706' }}>{t.env === 'production' ? 'ProduÃ§Ã£o' : 'Sandbox'}</span>
              </div>
              <span style={{ fontFamily: F, fontSize: 11.5, color: MUTED }}>Criado em {new Date(t.created_at).toLocaleDateString('pt-BR')}</span>
            </div>
            <div style={{ background: FAINT, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <code style={{ fontFamily: MONO, fontSize: 12.5, color: TEXT, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {showToken ? `${t.prefix}â€¦` : `${t.prefix}â€¢`.padEnd(34, 'â€¢')}
              </code>
              <button aria-label={showToken ? 'Ocultar token' : 'Mostrar token'} onClick={() => setShowToken(!showToken)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED }}>
                {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
              <button
                onClick={async () => {
                  await copyWithFeedback(t.prefix, 'Prefixo do token copiado com sucesso.')
                }}
                aria-label="Copiar prefixo"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED }}
              >
                <Copy size={14} />
              </button>
              <button
                onClick={async () => {
                  if (rotatingTokenId || revokingTokenId || creatingKey || creatingToken) return
                  setError(null)
                  setLastToken(null)
                  const ok = await confirm({
                    title: 'Rotacionar token?',
                    description: 'O token atual serÃ¡ revogado e um novo serÃ¡ gerado.',
                    confirmLabel: 'Rotacionar',
                  })
                  if (!ok) return
                  setRotatingTokenId(String(t.id))
                  try {
                    const res = await fetch(`/api/integrations/tokens/${t.id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: t.name }) })
                    const json = await res.json().catch(() => null)
                    if (!res.ok) {
                      logError('IntegracoesScreen: rotate token failed', { id: t.id, status: res.status, error: json?.error })
                      setError(toUserFacingError(json?.error, 'NÃ£o foi possÃ­vel rotacionar o token. Tente novamente.', `/api/integrations/tokens/${t.id}`))
                      return
                    }
                    setLastToken(json?.token?.token ?? null)
                    await loadTokens()
                  } finally {
                    setRotatingTokenId(null)
                  }
                }}
                aria-label="Rotacionar token"
                disabled={rotatingTokenId === String(t.id) || Boolean(revokingTokenId)}
                style={{ background: 'none', border: 'none', cursor: rotatingTokenId === String(t.id) || Boolean(revokingTokenId) ? 'default' : 'pointer', color: MUTED, opacity: rotatingTokenId === String(t.id) || Boolean(revokingTokenId) ? 0.6 : 1 }}
              >
                {rotatingTokenId === String(t.id) ? <span className="inline-block w-4 h-4 rounded-full border-2 border-[#94A3B8] border-t-transparent animate-spin" /> : <RotateCcw size={14} />}
              </button>
              <button
                onClick={async () => {
                  if (rotatingTokenId || revokingTokenId || creatingKey || creatingToken) return
                  setError(null)
                  const ok = await confirm({
                    title: 'Revogar token?',
                    description: 'Ele deixarÃ¡ de funcionar imediatamente.',
                    confirmLabel: 'Revogar',
                    danger: true,
                  })
                  if (!ok) return
                  setRevokingTokenId(String(t.id))
                  try {
                    const res = await fetch(`/api/integrations/tokens/${t.id}`, { method: 'PATCH' })
                    const json = await res.json().catch(() => null)
                    if (!res.ok) {
                      logError('IntegracoesScreen: revoke token failed', { id: t.id, status: res.status, error: json?.error })
                      setError(toUserFacingError(json?.error, 'NÃ£o foi possÃ­vel revogar o token. Tente novamente.', `/api/integrations/tokens/${t.id}`))
                      return
                    }
                    await loadTokens()
                  } finally {
                    setRevokingTokenId(null)
                  }
                }}
                aria-label="Revogar token"
                disabled={revokingTokenId === String(t.id) || Boolean(rotatingTokenId)}
                style={{ background: 'none', border: 'none', cursor: revokingTokenId === String(t.id) || Boolean(rotatingTokenId) ? 'default' : 'pointer', color: MUTED, opacity: revokingTokenId === String(t.id) || Boolean(rotatingTokenId) ? 0.6 : 1 }}
              >
                {revokingTokenId === String(t.id) ? <span className="inline-block w-4 h-4 rounded-full border-2 border-[#94A3B8] border-t-transparent animate-spin" /> : <XCircle size={14} />}
              </button>
            </div>
          </div>
        ))
        )}
        {!loading && tokens.length === 0 && (
          <EmptyState
            icon={<Shield size={18} style={{ color: NAVY }} />}
            title="Nenhum token cadastrado"
            description="Gere um token para autenticar chamadas de integraÃ§Ã£o."
            primaryAction={{ label: 'Gerar token', onClick: createToken, loading: creatingToken, disabled: creatingToken || loading }}
          />
        )}
      </div>
      {confirmDialog}
    </div>
  )
}

export function AdminAnticipationScreen() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<any[]>([])
  const [approvingId, setApprovingId] = useState<string | null>(null)

  useEffect(() => {
    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch('/api/admin/anticipation', { method: 'GET' })
        const json = await res.json().catch(() => null)
        if (!res.ok) {
          logError('AdminAnticipationScreen: load failed', { status: res.status, error: json?.error })
          setError(toUserFacingError(json?.error, 'Ocorreu um erro ao carregar antecipaÃ§Ãµes. Tente novamente.', '/api/admin/anticipation'))
          setItems([])
          return
        }
        setItems(Array.isArray(json?.anticipations) ? json.anticipations : [])
      } catch (e) {
        logError('AdminAnticipationScreen: load failed', e)
        setError(toUserFacingError(e instanceof Error ? e.message : String(e), 'Ocorreu um erro ao carregar antecipaÃ§Ãµes. Tente novamente.', '/api/admin/anticipation'))
      } finally {
        setLoading(false)
      }
    }
    void run()
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <p style={{ fontFamily: F, fontWeight: 900, fontSize: 18, color: TEXT, marginBottom: 3 }}>Admin Â· AntecipaÃ§Ãµes</p>
          <p style={{ fontFamily: F, fontSize: 12.5, color: MUTED }}>Aprovar solicitaÃ§Ãµes e acompanhar status do provedor.</p>
        </div>
      </div>

      {error && <Notice>{error}</Notice>}

      <TableCard>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#FAFBFD' }}>{['Data', 'Valor', 'Taxa', 'LÃ­quido', 'Status', ''].map((h) => <Th key={h}>{h}</Th>)}</tr>
          </thead>
          <tbody>
            {(!loading ? items : []).map((a) => (
              <tr key={a.id} style={{ transition: 'background .12s' }} onMouseEnter={(e) => (e.currentTarget.style.background = FAINT)} onMouseLeave={(e) => (e.currentTarget.style.background = '')}>
                <Td mono>{a.created_at ? new Date(a.created_at as string).toLocaleString('pt-BR') : 'â€”'}</Td>
                <Td>
                  <span style={{ fontWeight: 800 }}>{fmtBRL(Number(a.requested_amount_centavos ?? 0))}</span>
                </Td>
                <Td>
                  <span style={{ fontFamily: MONO, color: MUTED }}>{`${(Number(a.fee_bps ?? 0) / 100).toFixed(2).replace('.', ',')}%`}</span>
                </Td>
                <Td>
                  <span style={{ fontWeight: 800, color: '#059669' }}>{fmtBRL(Number(a.net_amount_centavos ?? 0))}</span>
                </Td>
                <Td>
                  <Badge status={String(a.status ?? 'â€”')} />
                </Td>
                <td style={{ padding: '13px 20px', borderBottom: `1px solid ${BORDER}` }}>
                  {String(a.status ?? '') === 'pending' ? (
                    <button
                      onClick={async () => {
                        if (approvingId) return
                        setError(null)
                        setApprovingId(String(a.id))
                        try {
                          const res = await fetch('/api/admin/anticipation', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'approve', id: a.id }) })
                          const json = await res.json().catch(() => null)
                          if (!res.ok) {
                            logError('AdminAnticipationScreen: approve failed', { id: a.id, status: res.status, error: json?.error })
                            setError(toUserFacingError(json?.error, 'NÃ£o foi possÃ­vel aprovar. Tente novamente.', '/api/admin/anticipation'))
                            return
                          }
                          const listRes = await fetch('/api/admin/anticipation', { method: 'GET' })
                          const listJson = await listRes.json().catch(() => null)
                          if (listRes.ok) setItems(Array.isArray(listJson?.anticipations) ? listJson.anticipations : [])
                        } finally {
                          setApprovingId(null)
                        }
                      }}
                      disabled={approvingId === String(a.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '7px 12px',
                        borderRadius: 9,
                        fontFamily: F,
                        fontWeight: 700,
                        fontSize: 12,
                        color: NAVY,
                        background: FAINT,
                        border: `1px solid ${BORDER}`,
                        cursor: approvingId === String(a.id) ? 'default' : 'pointer',
                        opacity: approvingId === String(a.id) ? 0.75 : 1,
                      }}
                    >
                      {approvingId === String(a.id) ? <span className="inline-block w-4 h-4 rounded-full border-2 border-[#94A3B8] border-t-transparent animate-spin" /> : <CheckCircle2 size={12} />}
                      {approvingId === String(a.id) ? 'Aprovandoâ€¦' : 'Aprovar'}
                    </button>
                  ) : (
                    <span style={{ fontFamily: F, fontSize: 12, color: MUTED }}>â€”</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading ? (
          <TableSkeleton rows={7} cols={6} />
        ) : items.length === 0 ? (
          <EmptyState icon={<Clock size={18} style={{ color: NAVY }} />} title="Nenhuma solicitaÃ§Ã£o encontrada" description="Quando houver solicitaÃ§Ãµes pendentes, elas aparecerÃ£o aqui." />
        ) : null}
      </TableCard>
    </div>
  )
}

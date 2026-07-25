'use client'

import { GhostBtn, PrimaryBtn } from '@/components/ui/Buttons'
import { Modal } from '@/components/ui/Modal'
import { APP_GUIDE_EVENT, APP_TOAST_EVENT, emitAppToast, type AppToastDetail } from '@/lib/app-events'
import { BORDER, F, MUTED, NAVY, TEXT } from '@/lib/design-tokens'
import { ONBOARDING_STEPS, PAGE_GUIDES, TOUR_STOPS } from '@/lib/guided-experience'
import { useSession } from '@/hooks/useSession'
import { BookOpen, CheckCircle2, ChevronRight, Circle, Compass, Flag, MessageCircle, Minimize2, Sparkles, Target } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type GuideState = {
  dismissed?: boolean
  started?: boolean
  completedSteps?: string[]
  visitedRoutes?: string[]
  deferredAt?: string | null
  collapsed?: boolean
  autoOpened?: boolean
}

type AssistantNote = {
  id: number
  tone: 'neutral' | 'success' | 'hint'
  title: string
  message: string
}

const CONTEXT_COPY: Record<string, { label: string; message: string; hint: string }> = {
  '/dashboard': {
    label: 'Agora',
    message: 'Acompanhe aqui seus indicadores e descubra o que merece sua atencao primeiro.',
    hint: 'Precisa de ajuda? Posso te explicar os indicadores desta tela.',
  },
  '/recebedores': {
    label: 'Agora',
    message: 'Voce esta cadastrando quem vai receber os pagamentos da sua operacao.',
    hint: 'Se quiser, eu posso te lembrar o que falta para concluir este cadastro.',
  },
  '/links-pagamento': {
    label: 'Agora',
    message: 'Aqui voce gera cobrancas simples para compartilhar com seus clientes.',
    hint: 'Quer ajuda para entender como funcionam as cobrancas desta tela?',
  },
  '/links-pagamento/novo': {
    label: 'Agora',
    message: 'Voce esta montando a sua primeira cobranca para compartilhar com um cliente.',
    hint: 'Posso te explicar rapidamente o que preencher primeiro.',
  },
  '/transacoes': {
    label: 'Agora',
    message: 'Aqui voce acompanha o andamento dos pagamentos ja realizados.',
    hint: 'Posso te mostrar como entender os status desta tela.',
  },
  '/ledger': {
    label: 'Agora',
    message: 'Aqui voce acompanha entradas, saidas e saldo de forma simples.',
    hint: 'Quer um resumo rapido do que voce encontra nesta tela?',
  },
  '/repasses': {
    label: 'Agora',
    message: 'Aqui voce acompanha os valores enviados para cada recebedor.',
    hint: 'Posso explicar o que significa cada situacao de envio.',
  },
  '/antecipacao': {
    label: 'Agora',
    message: 'Aqui voce entende previsoes e simulacoes antes de seguir com essa etapa.',
    hint: 'Se quiser, eu posso explicar como ler esta simulacao.',
  },
  '/configuracoes': {
    label: 'Agora',
    message: 'Aqui voce deixa os dados da sua conta e da sua empresa prontos para usar.',
    hint: 'Precisa de ajuda? Posso te mostrar o que vale preencher primeiro.',
  },
  '/configuracoes/integracoes': {
    label: 'Agora',
    message: 'Aqui voce prepara as conexoes da plataforma com outros sistemas.',
    hint: 'Posso te explicar esta tela de forma simples.',
  },
}

const STEP_FEEDBACK: Record<
  string,
  {
    title: string
    message: string
  }
> = {
  company: {
    title: 'Otimo! Mais um passo concluido.',
    message: 'Agora vamos seguir para o cadastro do recebedor.',
  },
  receiver: {
    title: 'Excelente! Agora falta pouco.',
    message: 'O proximo passo e enviar os documentos do recebedor.',
  },
  kyc: {
    title: 'Tudo certo ate aqui.',
    message: 'Agora voce ja pode criar a sua primeira cobranca.',
  },
  'payment-link': {
    title: 'Sua cobranca ficou pronta.',
    message: 'Agora vale revisar como ela aparece para o cliente.',
  },
  checkout: {
    title: 'Perfeito. Sua cobranca foi revisada.',
    message: 'Agora acompanhe o que acontece depois do envio.',
  },
  transactions: {
    title: 'Otimo! Voce ja esta acompanhando seus pagamentos.',
    message: 'O proximo passo e revisar a sua visao financeira.',
  },
  finance: {
    title: 'Muito bom. Sua visao financeira ja esta organizada.',
    message: 'Se quiser, voce ainda pode revisar os proximos recursos da plataforma.',
  },
  integrations: {
    title: 'Parabens! Sua configuracao inicial foi concluida.',
    message: 'Se precisar revisar alguma etapa, eu continuo por aqui.',
  },
}

function normalizeName(raw: string | null | undefined) {
  if (!raw) return ''
  const cleaned = raw
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return ''
  const first = cleaned.split(' ')[0] ?? ''
  if (!first) return ''
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase()
}

function getFirstName(session: ReturnType<typeof useSession>['session']) {
  const metadata = (session?.user?.user_metadata ?? {}) as Record<string, unknown>
  const candidates = [
    typeof metadata.first_name === 'string' ? metadata.first_name : null,
    typeof metadata.full_name === 'string' ? metadata.full_name : null,
    typeof metadata.name === 'string' ? metadata.name : null,
    session?.user?.email ? session.user.email.split('@')[0] : null,
  ]
  for (const candidate of candidates) {
    const value = normalizeName(candidate)
    if (value) return value
  }
  return ''
}

function assistantNoteFromToast(detail: AppToastDetail): Omit<AssistantNote, 'id'> | null {
  const message = detail.message.toLowerCase()
  const title = (detail.title ?? '').toLowerCase()
  const source = `${title} ${message}`

  if (source.includes('empresa atualizada') || source.includes('dados da empresa foram salvos')) {
    return {
      tone: 'success',
      title: 'Empresa configurada com sucesso.',
      message: 'Excelente! Agora vamos cadastrar um recebedor.',
    }
  }

  if (source.includes('recebedor criado') || source.includes('recebedor salvo')) {
    return {
      tone: 'success',
      title: 'Recebedor cadastrado.',
      message: 'Agora vamos seguir com os documentos desse cadastro.',
    }
  }

  if (source.includes('documento enviado') || source.includes('kyc iniciado')) {
    return {
      tone: 'success',
      title: 'Otimo! Essa etapa foi encaminhada.',
      message: 'Voce ja pode seguir para a sua primeira cobranca.',
    }
  }

  if (source.includes('link criado')) {
    return {
      tone: 'success',
      title: 'Cobranca criada com sucesso.',
      message: 'Agora vale revisar como ela aparece para o cliente.',
    }
  }

  return null
}

function normalizePath(pathname: string) {
  if (pathname.startsWith('/subscriptions/plans')) return '/assinaturas'
  return pathname
}

function getGuideStorageKey(identity: string) {
  return `cp:guided-experience:${identity}`
}

function readState(key: string): GuideState {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as GuideState) : {}
  } catch {
    window.localStorage.removeItem(key)
    return {}
  }
}

function writeState(key: string, value: GuideState) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(key, JSON.stringify(value))
}

export function GuidedExperience() {
  const pathname = usePathname()
  const router = useRouter()
  const { session } = useSession()
  const identity = session?.user?.email ?? 'guest'
  const storageKey = useMemo(() => getGuideStorageKey(identity), [identity])
  const [state, setState] = useState<GuideState>({})
  const [ready, setReady] = useState(false)
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [tourOpen, setTourOpen] = useState(false)
  const [tourIndex, setTourIndex] = useState(0)
  const [viewportWidth, setViewportWidth] = useState(1440)
  const [assistantNote, setAssistantNote] = useState<AssistantNote | null>(null)
  const [idlePromptVisible, setIdlePromptVisible] = useState(false)
  const [celebratedStepId, setCelebratedStepId] = useState<string | null>(null)
  const [confettiVisible, setConfettiVisible] = useState(false)
  const noteTimerRef = useRef<number | null>(null)
  const confettiTimerRef = useRef<number | null>(null)
  const idleTimerRef = useRef<number | null>(null)
  const idleHideTimerRef = useRef<number | null>(null)
  const lastInteractionAtRef = useRef(0)
  const prevCompletedStepsRef = useRef<string[] | null>(null)
  const prevGuideCompletedRef = useRef(false)
  const firstName = useMemo(() => getFirstName(session), [session])

  const updateState = useCallback(
    (updater: (current: GuideState) => GuideState) => {
      setState((current) => {
        const next = updater(current)
        writeState(storageKey, next)
        return next
      })
    },
    [storageKey]
  )

  useEffect(() => {
    const next = readState(storageKey)
    setState(next)
    setReady(true)
  }, [storageKey])

  useEffect(() => {
    return () => {
      if (noteTimerRef.current) window.clearTimeout(noteTimerRef.current)
      if (confettiTimerRef.current) window.clearTimeout(confettiTimerRef.current)
      if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current)
      if (idleHideTimerRef.current) window.clearTimeout(idleHideTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!ready) return
    const nextPath = normalizePath(pathname)
    setState((current) => {
      const visited = Array.from(new Set([...(current.visitedRoutes ?? []), nextPath]))
      const next = { ...current, visitedRoutes: visited }
      writeState(storageKey, next)
      return next
    })
  }, [pathname, ready, storageKey])

  useEffect(() => {
    if (!ready) return
    if (state.dismissed || state.autoOpened) return
    const timeout = window.setTimeout(() => {
      const active = document.activeElement
      const isEditing =
        active instanceof HTMLElement &&
        (active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          active.tagName === 'SELECT' ||
          active.isContentEditable)
      const interactedRecently = Date.now() - lastInteractionAtRef.current < 1_500
      if (isEditing || interactedRecently) return
      setAssistantOpen(true)
      updateState((current) => ({
        ...current,
        autoOpened: true,
        collapsed: current.collapsed ?? true,
      }))
    }, 500)
    return () => window.clearTimeout(timeout)
  }, [ready, state.autoOpened, state.dismissed, updateState])

  useEffect(() => {
    const onOpenAssistant = () => setAssistantOpen(true)
    const onOpenTour = () => {
      const index = Math.max(0, TOUR_STOPS.findIndex((stop) => stop.path === normalizePath(pathname)))
      setTourIndex(index < 0 ? 0 : index)
      setTourOpen(true)
    }

    window.addEventListener(`${APP_GUIDE_EVENT}:onboarding`, onOpenAssistant)
    window.addEventListener(`${APP_GUIDE_EVENT}:tour`, onOpenTour)
    return () => {
      window.removeEventListener(`${APP_GUIDE_EVENT}:onboarding`, onOpenAssistant)
      window.removeEventListener(`${APP_GUIDE_EVENT}:tour`, onOpenTour)
    }
  }, [pathname])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const sync = () => setViewportWidth(window.innerWidth)
    sync()
    window.addEventListener('resize', sync)
    return () => window.removeEventListener('resize', sync)
  }, [])

  const completedSteps = useMemo(() => {
    const visited = state.visitedRoutes ?? []
    const manual = new Set(state.completedSteps ?? [])
    return ONBOARDING_STEPS.filter((step) => {
      if (manual.has(step.id)) return true
      if (step.id === 'finance') return visited.some((route) => ['/ledger', '/repasses', '/antecipacao'].includes(route))
      if (step.id === 'checkout') return visited.includes('/links-pagamento')
      return visited.includes(step.path)
    }).map((step) => step.id)
  }, [state.completedSteps, state.visitedRoutes])

  const normalizedPath = normalizePath(pathname)
  const progress = Math.round((completedSteps.length / ONBOARDING_STEPS.length) * 100)
  const routeStep =
    ONBOARDING_STEPS.find((step) => step.path === normalizedPath && !completedSteps.includes(step.id)) ??
    ONBOARDING_STEPS.find((step) => step.path === normalizedPath)
  const unfinishedStep = ONBOARDING_STEPS.find((step) => !completedSteps.includes(step.id)) ?? ONBOARDING_STEPS[0]
  const recommendedStep = routeStep && !completedSteps.includes(routeStep.id) ? routeStep : unfinishedStep
  const orderedSteps = useMemo(() => {
    const pending = ONBOARDING_STEPS.filter((step) => !completedSteps.includes(step.id))
    const done = ONBOARDING_STEPS.filter((step) => completedSteps.includes(step.id))
    return pending.length ? [...pending, ...done] : ONBOARDING_STEPS
  }, [completedSteps])
  const guideCompleted = progress >= 100
  const checklistExpanded = !Boolean(state.collapsed ?? true)
  const isMobile = viewportWidth <= 768
  const isTablet = viewportWidth <= 1024
  const assistantWidth = isMobile ? 'calc(100vw - 24px)' : isTablet ? 360 : 380
  const tourStop = TOUR_STOPS[tourIndex] ?? TOUR_STOPS[0]
  const currentPageGuide = PAGE_GUIDES[normalizedPath]
  const contextualCopy = CONTEXT_COPY[normalizedPath] ?? {
    label: 'Agora',
    message: currentPageGuide?.summary ?? 'Estou acompanhando esta tela com voce.',
    hint: 'Precisa de ajuda? Posso te explicar rapidamente esta tela.',
  }

  const setTimedAssistantNote = useCallback((note: Omit<AssistantNote, 'id'>, durationMs = 5200) => {
    const id = Date.now()
    setAssistantNote({ ...note, id })
    if (noteTimerRef.current) window.clearTimeout(noteTimerRef.current)
    noteTimerRef.current = window.setTimeout(() => {
      setAssistantNote((current) => (current?.id === id ? null : current))
    }, durationMs)
  }, [])

  const scheduleIdlePrompt = useCallback(() => {
    if (!ready) return
    if (guideCompleted || assistantOpen) return
    if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current)
    if (idleHideTimerRef.current) window.clearTimeout(idleHideTimerRef.current)
    idleTimerRef.current = window.setTimeout(() => {
      setIdlePromptVisible(true)
      idleHideTimerRef.current = window.setTimeout(() => setIdlePromptVisible(false), 7000)
    }, 120000)
  }, [assistantOpen, guideCompleted, ready])

  useEffect(() => {
    if (!ready) return
    setIdlePromptVisible(false)
    scheduleIdlePrompt()

    const onUserActivity = () => {
      const now = Date.now()
      if (now - lastInteractionAtRef.current < 900) return
      lastInteractionAtRef.current = now
      setIdlePromptVisible(false)
      scheduleIdlePrompt()
    }

    window.addEventListener('pointerdown', onUserActivity)
    window.addEventListener('keydown', onUserActivity)
    window.addEventListener('scroll', onUserActivity, true)
    window.addEventListener('focus', onUserActivity)

    return () => {
      window.removeEventListener('pointerdown', onUserActivity)
      window.removeEventListener('keydown', onUserActivity)
      window.removeEventListener('scroll', onUserActivity, true)
      window.removeEventListener('focus', onUserActivity)
      if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current)
      if (idleHideTimerRef.current) window.clearTimeout(idleHideTimerRef.current)
    }
  }, [normalizedPath, ready, scheduleIdlePrompt])

  useEffect(() => {
    const onToast = (event: Event) => {
      const detail = (event as CustomEvent<AppToastDetail>).detail
      if (!detail || detail.tone !== 'success') return
      const note = assistantNoteFromToast(detail)
      if (!note) return
      setTimedAssistantNote(note, 5600)
    }

    window.addEventListener(APP_TOAST_EVENT, onToast as EventListener)
    return () => window.removeEventListener(APP_TOAST_EVENT, onToast as EventListener)
  }, [setTimedAssistantNote])

  useEffect(() => {
    if (!ready) return
    const previous = prevCompletedStepsRef.current
    prevCompletedStepsRef.current = completedSteps
    if (!previous) return

    const added = completedSteps.filter((stepId) => !previous.includes(stepId))
    if (!added.length) return

    const latestStepId = added[added.length - 1]
    const feedback = STEP_FEEDBACK[latestStepId]
    if (feedback) setTimedAssistantNote({ tone: 'success', title: feedback.title, message: feedback.message }, 5600)
    setCelebratedStepId(latestStepId)
    window.setTimeout(() => {
      setCelebratedStepId((current) => (current === latestStepId ? null : current))
    }, 1200)
  }, [completedSteps, ready, setTimedAssistantNote])

  useEffect(() => {
    if (!ready) return
    if (!guideCompleted || prevGuideCompletedRef.current) {
      prevGuideCompletedRef.current = guideCompleted
      return
    }

    prevGuideCompletedRef.current = true
    setConfettiVisible(true)
    emitAppToast({
      tone: 'success',
      title: 'Configuracao inicial concluida',
      message: 'Parabens! Sua conta ja esta pronta para seguir para os proximos passos.',
      durationMs: 3800,
    })
    setTimedAssistantNote(
      {
        tone: 'success',
        title: 'Parabens! Sua configuracao inicial foi concluida.',
        message: 'Se quiser revisar alguma etapa, eu continuo disponivel no botao Guia.',
      },
      6200,
    )

    if (confettiTimerRef.current) window.clearTimeout(confettiTimerRef.current)
    confettiTimerRef.current = window.setTimeout(() => setConfettiVisible(false), 1400)

    const minimizeTimer = window.setTimeout(() => {
      setAssistantOpen(false)
      updateState((current) => ({
        ...current,
        started: true,
        dismissed: true,
        collapsed: true,
        autoOpened: true,
      }))
    }, 1200)

    return () => window.clearTimeout(minimizeTimer)
  }, [guideCompleted, ready, setTimedAssistantNote, updateState])

  useEffect(() => {
    if (!guideCompleted) prevGuideCompletedRef.current = false
  }, [guideCompleted])

  const handleContinue = useCallback(() => {
    updateState((current) => ({
      ...current,
      started: true,
      dismissed: true,
      collapsed: current.collapsed ?? true,
      autoOpened: true,
    }))
    setIdlePromptVisible(false)
    setAssistantOpen(false)
    router.push(recommendedStep.path)
  }, [recommendedStep.path, router, updateState])

  const handleMinimize = useCallback(() => {
    updateState((current) => ({
      ...current,
      dismissed: true,
      started: current.started ?? true,
      autoOpened: true,
    }))
    setIdlePromptVisible(false)
    setAssistantOpen(false)
  }, [updateState])

  const handleToggleChecklist = useCallback(() => {
    setAssistantOpen(true)
    setIdlePromptVisible(false)
    updateState((current) => ({
      ...current,
      dismissed: true,
      collapsed: !Boolean(current.collapsed ?? true),
      started: current.started ?? true,
      autoOpened: true,
    }))
  }, [updateState])

  const handleOpenAssistant = useCallback(() => {
    setIdlePromptVisible(false)
    setAssistantOpen(true)
    updateState((current) => ({
      ...current,
      dismissed: true,
      autoOpened: true,
    }))
  }, [updateState])

  const greeting = firstName ? `Ola, ${firstName} 👋` : 'Ola 👋'
  const assistantTitle = guideCompleted ? greeting : greeting
  const assistantMessage = guideCompleted
    ? 'Sua configuracao inicial ficou pronta. Se quiser revisar alguma etapa ou explorar a plataforma, eu continuo por aqui.'
    : state.started
      ? 'Vamos concluir sua configuracao inicial? Eu vou te mostrar somente o proximo passo mais importante.'
      : 'Vou te ajudar a deixar sua conta pronta em poucos minutos, sem complicacao.'

  const notePalette =
    assistantNote?.tone === 'success'
      ? {
          background: 'rgba(236,253,245,.98)',
          border: 'rgba(167,243,208,.9)',
          title: '#065F46',
          text: '#047857',
        }
      : assistantNote?.tone === 'hint'
        ? {
            background: 'rgba(239,246,255,.98)',
            border: 'rgba(191,219,254,.9)',
            title: '#1D4ED8',
            text: '#2563EB',
          }
        : {
            background: 'rgba(248,250,252,.98)',
            border: 'rgba(203,213,225,.9)',
            title: TEXT,
            text: MUTED,
          }

  return (
    <>
      {ready ? (
        <div
          style={{
            position: 'fixed',
            right: isMobile ? 12 : 20,
            bottom: isMobile ? 12 : 20,
            zIndex: 55,
            pointerEvents: 'none',
            width: assistantOpen ? assistantWidth : 'auto',
            maxWidth: 'calc(100vw - 24px)',
          }}
        >
          {confettiVisible ? (
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                inset: 0,
                pointerEvents: 'none',
                overflow: 'visible',
              }}
            >
              {Array.from({ length: 10 }).map((_, index) => (
                <span
                  key={`confetti-${index}`}
                  className="cp-assistant-confetti"
                  style={{
                    left: `${8 + index * 8}%`,
                    animationDelay: `${index * 45}ms`,
                    background: index % 3 === 0 ? '#39F0AE' : index % 3 === 1 ? '#C4B5FD' : '#93C5FD',
                  }}
                />
              ))}
            </div>
          ) : null}

          {assistantOpen ? (
            <div
              className="cp-fade-in"
              style={{
                width: assistantWidth,
                maxWidth: 'calc(100vw - 24px)',
                background: 'rgba(255,255,255,.97)',
                border: `1px solid rgba(148,163,184,.18)`,
                borderRadius: 24,
                boxShadow: '0 28px 60px rgba(15,23,42,.16)',
                backdropFilter: 'blur(18px)',
                overflow: 'hidden',
                pointerEvents: 'auto',
              }}
            >
              <div
                style={{
                  padding: isMobile ? 14 : 16,
                  display: 'grid',
                  gap: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ display: 'flex', gap: 10, minWidth: 0 }}>
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 14,
                        background: guideCompleted ? 'rgba(16,185,129,.12)' : 'rgba(2,27,91,.06)',
                        color: guideCompleted ? '#059669' : NAVY,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {guideCompleted ? <CheckCircle2 size={18} /> : <Sparkles size={18} />}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontFamily: F, fontWeight: 800, fontSize: 11.5, color: NAVY, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 3 }}>
                        Copiloto Connekt
                      </div>
                      <div style={{ fontFamily: F, fontWeight: 800, fontSize: 16, color: TEXT, lineHeight: 1.3, marginBottom: 4 }}>{assistantTitle}</div>
                      <div style={{ fontFamily: F, fontSize: 12.5, color: MUTED, lineHeight: 1.5 }}>{assistantMessage}</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleMinimize}
                    aria-label="Minimizar assistente"
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 999,
                      border: 'none',
                      background: 'rgba(2,27,91,.05)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: NAVY,
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    <Minimize2 size={15} />
                  </button>
                </div>

                {assistantNote ? (
                  <div
                    className={assistantNote.tone === 'success' ? 'cp-assistant-note-pop' : undefined}
                    style={{
                      borderRadius: 18,
                      border: `1px solid ${notePalette.border}`,
                      background: notePalette.background,
                      padding: '11px 12px',
                      display: 'grid',
                      gap: 4,
                    }}
                  >
                    <div style={{ fontFamily: F, fontWeight: 800, fontSize: 12.5, color: notePalette.title }}>{assistantNote.title}</div>
                    <div style={{ fontFamily: F, fontSize: 12.5, lineHeight: 1.5, color: notePalette.text }}>{assistantNote.message}</div>
                  </div>
                ) : null}

                <div
                  style={{
                    borderRadius: 18,
                    border: '1px solid rgba(148,163,184,.14)',
                    background: 'rgba(248,250,252,.92)',
                    padding: isMobile ? 12 : 13,
                    display: 'grid',
                    gap: 6,
                  }}
                >
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: F, fontWeight: 800, fontSize: 11.5, color: NAVY }}>
                    <MessageCircle size={13} />
                    {contextualCopy.label}
                  </div>
                  <div style={{ fontFamily: F, fontSize: 12.5, color: TEXT, lineHeight: 1.5 }}>{contextualCopy.message}</div>
                </div>

                <div
                  style={{
                    borderRadius: 18,
                    border: '1px solid rgba(148,163,184,.14)',
                    background: 'linear-gradient(180deg, rgba(248,250,252,.95) 0%, rgba(255,255,255,1) 100%)',
                    padding: isMobile ? 12 : 13,
                    display: 'grid',
                    gap: 10,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: F, fontWeight: 700, fontSize: 12, color: NAVY }}>
                      <Target size={14} />
                      {guideCompleted ? 'Onboarding concluído' : 'Próximo passo recomendado'}
                    </div>
                    <div style={{ fontFamily: F, fontWeight: 700, fontSize: 11.5, color: MUTED }}>{progress}%</div>
                  </div>

                  <div>
                    <div style={{ fontFamily: F, fontWeight: 700, fontSize: 13.5, color: TEXT, lineHeight: 1.35, marginBottom: 4 }}>
                      {guideCompleted ? 'Sua configuração inicial já está pronta.' : recommendedStep.title}
                    </div>
                    <div style={{ fontFamily: F, fontSize: 12.5, color: MUTED, lineHeight: 1.5 }}>
                      {guideCompleted ? 'Abra o checklist quando quiser revisar as etapas concluídas ou explorar recursos da plataforma.' : recommendedStep.description}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                      <div style={{ fontFamily: F, fontSize: 11.5, color: NAVY, fontWeight: 700 }}>
                        {completedSteps.length}/{ONBOARDING_STEPS.length} passos
                      </div>
                      <div style={{ fontFamily: F, fontSize: 11.5, color: MUTED }}>{guideCompleted ? 'Tudo pronto' : 'Em andamento'}</div>
                    </div>
                    <div style={{ height: 4, borderRadius: 999, background: 'rgba(148,163,184,.16)', overflow: 'hidden' }}>
                      <div
                        className={guideCompleted ? 'cp-assistant-progress-glow' : undefined}
                        style={{
                          width: `${progress}%`,
                          height: '100%',
                          background: 'linear-gradient(90deg, #39F0AE 0%, #0F766E 100%)',
                          transition: 'width .45s cubic-bezier(.22,1,.36,1)',
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {!guideCompleted ? (
                      <button
                        type="button"
                        onClick={handleContinue}
                        style={{
                          background: NAVY,
                          color: 'white',
                          borderRadius: 999,
                          padding: '10px 14px',
                          border: 'none',
                          fontFamily: F,
                          fontWeight: 800,
                          fontSize: 12.5,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 8,
                          cursor: 'pointer',
                          boxShadow: '0 10px 18px rgba(2,27,91,.16)',
                        }}
                      >
                        Continuar
                        <ChevronRight size={14} />
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={handleToggleChecklist}
                      style={{
                        background: 'white',
                        color: TEXT,
                        borderRadius: 999,
                        padding: '10px 14px',
                        border: `1px solid ${BORDER}`,
                        fontFamily: F,
                        fontWeight: 700,
                        fontSize: 12.5,
                        cursor: 'pointer',
                      }}
                    >
                      {checklistExpanded ? 'Ocultar checklist' : 'Ver checklist completo'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setTourOpen(true)}
                      style={{
                        background: 'rgba(2,27,91,.05)',
                        color: NAVY,
                        borderRadius: 999,
                        padding: '10px 14px',
                        border: 'none',
                        fontFamily: F,
                        fontWeight: 700,
                        fontSize: 12.5,
                        cursor: 'pointer',
                      }}
                    >
                      Ver tour
                    </button>
                  </div>
                </div>

                <div
                  style={{
                    borderTop: checklistExpanded ? '1px solid rgba(148,163,184,.14)' : 'none',
                    paddingTop: checklistExpanded ? 10 : 0,
                    maxHeight: checklistExpanded ? (isMobile ? 320 : 360) : 0,
                    opacity: checklistExpanded ? 1 : 0,
                    overflow: 'hidden',
                    transition: 'max-height .22s ease, opacity .18s ease, padding-top .18s ease',
                  }}
                >
                  <div style={{ display: 'grid', gap: 8 }}>
                    {orderedSteps.map((step) => {
                      const done = completedSteps.includes(step.id)
                      const active = !guideCompleted && recommendedStep.id === step.id
                      const animateDone = celebratedStepId === step.id
                      return (
                        <div
                          key={step.id}
                          style={{
                            display: 'grid',
                            gap: 4,
                            padding: active ? '10px 11px' : '8px 4px',
                            borderRadius: 14,
                            background: active ? 'rgba(2,27,91,.04)' : 'transparent',
                            border: active ? '1px solid rgba(2,27,91,.08)' : '1px solid transparent',
                          }}
                        >
                          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                            {done ? (
                              <CheckCircle2 size={16} className={animateDone ? 'cp-assistant-check-pop' : undefined} style={{ color: '#059669', flexShrink: 0, marginTop: 1 }} />
                            ) : (
                              <Circle size={16} style={{ color: active ? NAVY : '#94A3B8', flexShrink: 0, marginTop: 1 }} />
                            )}
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ fontFamily: F, fontWeight: active ? 800 : 700, fontSize: 12.5, color: TEXT, lineHeight: 1.35 }}>{step.title}</div>
                              <div style={{ fontFamily: F, fontSize: 11.5, color: MUTED, lineHeight: 1.45, marginTop: 2 }}>
                                {done ? 'Etapa concluída' : step.description}
                              </div>
                            </div>
                            {!done ? (
                              <Link
                                href={step.path}
                                prefetch={false}
                                onClick={() => {
                                  updateState((current) => ({
                                    ...current,
                                    started: true,
                                    dismissed: true,
                                    autoOpened: true,
                                  }))
                                  setAssistantOpen(false)
                                }}
                                style={{
                                  textDecoration: 'none',
                                  background: 'white',
                                  border: `1px solid ${BORDER}`,
                                  borderRadius: 999,
                                  padding: '6px 9px',
                                  fontFamily: F,
                                  fontWeight: 700,
                                  fontSize: 11.5,
                                  color: NAVY,
                                  flexShrink: 0,
                                }}
                              >
                                {step.ctaLabel}
                              </Link>
                            ) : null}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 10, justifyItems: 'end' }}>
              {idlePromptVisible && !guideCompleted ? (
                <button
                  type="button"
                  onClick={handleOpenAssistant}
                  className="cp-fade-in"
                  style={{
                    pointerEvents: 'auto',
                    maxWidth: isMobile ? 'min(100vw - 24px, 300px)' : 300,
                    borderRadius: 18,
                    border: '1px solid rgba(191,219,254,.9)',
                    background: 'rgba(239,246,255,.98)',
                    boxShadow: '0 16px 32px rgba(15,23,42,.1)',
                    padding: '10px 12px',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontFamily: F, fontWeight: 800, fontSize: 12.5, color: '#1D4ED8', marginBottom: 4 }}>Precisa de ajuda?</div>
                  <div style={{ fontFamily: F, fontSize: 12.5, lineHeight: 1.45, color: '#2563EB' }}>{contextualCopy.hint}</div>
                </button>
              ) : null}

              <button
                type="button"
                onClick={handleOpenAssistant}
                className="cp-fade-in"
                style={{
                  pointerEvents: 'auto',
                  height: 48,
                  padding: '0 16px',
                  borderRadius: 999,
                  border: `1px solid rgba(148,163,184,.18)`,
                  background: 'rgba(255,255,255,.96)',
                  boxShadow: '0 14px 32px rgba(15,23,42,.12)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  fontFamily: F,
                  fontWeight: 800,
                  fontSize: 12.5,
                  color: TEXT,
                  cursor: 'pointer',
                  backdropFilter: 'blur(18px)',
                }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 10,
                    background: guideCompleted ? 'rgba(16,185,129,.12)' : 'rgba(2,27,91,.06)',
                    color: guideCompleted ? '#059669' : NAVY,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {guideCompleted ? <CheckCircle2 size={14} /> : <MessageCircle size={14} />}
                </div>
                Guia
              </button>
            </div>
          )}
        </div>
      ) : null}

      <Modal
        open={tourOpen}
        title={`Tour guiado: ${tourStop.title}`}
        description="Use este tour opcional para entender cada módulo sem precisar conhecer termos técnicos."
        onClose={() => setTourOpen(false)}
        maxWidth={720}
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ fontFamily: F, fontSize: 12.5, color: MUTED }}>
              Etapa {tourIndex + 1} de {TOUR_STOPS.length}
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <GhostBtn onClick={() => setTourOpen(false)}>Fechar</GhostBtn>
              <GhostBtn onClick={() => setTourIndex((current) => Math.max(0, current - 1))} disabled={tourIndex === 0}>
                Anterior
              </GhostBtn>
              <PrimaryBtn onClick={() => setTourIndex((current) => Math.min(TOUR_STOPS.length - 1, current + 1))} disabled={tourIndex >= TOUR_STOPS.length - 1}>
                Próximo
              </PrimaryBtn>
            </div>
          </div>
        }
      >
        <div style={{ display: 'grid', gap: 18 }}>
          <div style={{ background: 'rgba(248,250,252,.95)', border: `1px solid ${BORDER}`, borderRadius: 18, padding: 18 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: F, fontWeight: 800, fontSize: 12, color: NAVY, marginBottom: 10 }}>
              <Compass size={15} />
              Onde você está
            </div>
            <div style={{ fontFamily: F, fontWeight: 800, fontSize: 20, color: TEXT, marginBottom: 8 }}>{tourStop.title}</div>
            <div style={{ fontFamily: F, fontSize: 13.5, color: MUTED, lineHeight: 1.6 }}>{tourStop.description}</div>
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            {TOUR_STOPS.map((stop, index) => {
              const active = index === tourIndex
              return (
                <button
                  key={stop.path}
                  type="button"
                  onClick={() => setTourIndex(index)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    borderRadius: 14,
                    border: `1px solid ${active ? 'rgba(57,240,174,.35)' : BORDER}`,
                    background: active ? 'rgba(57,240,174,.08)' : 'white',
                    padding: '12px 14px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  {active ? <Flag size={16} style={{ color: '#059669', flexShrink: 0 }} /> : <BookOpen size={16} style={{ color: MUTED, flexShrink: 0 }} />}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: F, fontWeight: 700, fontSize: 13, color: TEXT, marginBottom: 2 }}>{stop.title}</div>
                    <div style={{ fontFamily: F, fontSize: 12.5, color: MUTED, lineHeight: 1.45 }}>{stop.description}</div>
                  </div>
                </button>
              )
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Link
              href={tourStop.path}
              prefetch={false}
              onClick={() => setTourOpen(false)}
              style={{
                textDecoration: 'none',
                background: NAVY,
                color: 'white',
                borderRadius: 12,
                padding: '10px 14px',
                fontFamily: F,
                fontWeight: 800,
                fontSize: 12.5,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              Abrir esta tela
              <ChevronRight size={15} />
            </Link>
          </div>
        </div>
      </Modal>
    </>
  )
}

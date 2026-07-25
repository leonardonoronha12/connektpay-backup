'use client'

import { openGuide } from '@/lib/app-events'
import { BORDER, F, MINT, MUTED, NAVY, TEXT } from '@/lib/design-tokens'
import { AlertCircle, Bell, CheckCircle2, Compass, Menu, XCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { signOut } from '@/services/auth'
import { useMe } from '@/hooks/me'
import { useSession } from '@/hooks/useSession'
import { normalizeRole } from '@/lib/rbac'
import { initials } from '@/utils/format'

function getCookieValue(name: string) {
  if (typeof document === 'undefined') return null
  const parts = document.cookie.split(';').map((part) => part.trim())
  for (const part of parts) {
    if (!part) continue
    const eq = part.indexOf('=')
    if (eq === -1) continue
    const key = part.slice(0, eq)
    if (key !== name) continue
    return decodeURIComponent(part.slice(eq + 1))
  }
  return null
}

type HeaderNotification = {
  id: string
  title: string
  message: string
  severity: 'info' | 'warning' | 'error' | 'success'
  href: string | null
  read: boolean
  createdAt: string | null
}

function isAbortLikeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const lower = message.toLowerCase()
  return lower.includes('abort') || lower.includes('load request cancelled') || lower.includes('access control checks')
}

function formatNotificationTimestamp(value: string | null) {
  if (!value) return 'Agora'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Agora'
  return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function getNotificationVisuals(severity: HeaderNotification['severity'], read: boolean) {
  if (severity === 'error') {
    return {
      icon: <XCircle size={14} style={{ color: '#DC2626' }} />,
      background: read ? '#FFF7F7' : '#FEF2F2',
      border: '#FECACA',
    }
  }
  if (severity === 'warning') {
    return {
      icon: <AlertCircle size={14} style={{ color: '#D97706' }} />,
      background: read ? '#FFFDF5' : '#FFFBEB',
      border: '#FDE68A',
    }
  }
  return {
    icon: <CheckCircle2 size={14} style={{ color: '#2563EB' }} />,
    background: read ? '#F8FAFC' : '#EFF6FF',
    border: '#BFDBFE',
  }
}

export function Header({
  title,
  subtitle,
  section,
  onOpenMenu,
  initialRole,
}: {
  title: string
  subtitle?: string
  section?: string
  onOpenMenu?: () => void
  initialRole?: string | null
}) {
  const router = useRouter()
  const uid = useId()
  const notifRootId = `notif-${uid}`
  const userRootId = `user-${uid}`
  const [notifOpen, setNotifOpen] = useState(false)
  const [userOpen, setUserOpen] = useState(false)
  const [userMenuAttempts, setUserMenuAttempts] = useState(0)
  const [signingOut, setSigningOut] = useState(false)
  const [notifLoading, setNotifLoading] = useState(false)
  const [notifError, setNotifError] = useState<string | null>(null)
  const [notifications, setNotifications] = useState<HeaderNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [markingAllRead, setMarkingAllRead] = useState(false)
  const [markingNotificationId, setMarkingNotificationId] = useState<string | null>(null)
  const [clientCookieRole, setClientCookieRole] = useState<string | null>(null)
  const { me } = useMe()
  const { session } = useSession()
  const role =
    clientCookieRole ??
    normalizeRole(initialRole ?? null) ??
    normalizeRole(me?.role) ??
    normalizeRole(session?.user?.app_metadata?.role ?? session?.user?.user_metadata?.role)
  const avatar = initials(me?.fullName ?? me?.email ?? session?.user?.email ?? '—')
  const canOpenMyAccount = role === 'owner' || role === 'super_admin'
  const canOpenSettings = role === 'owner' || role === 'super_admin'
  const userMenuItems = useMemo<
    Array<{ label: string; kind: 'action'; onClick: () => void } | { label: string; kind: 'link'; href: string }>
  >(
    () => [
      { label: 'Reabrir guia', kind: 'action', onClick: () => openGuide('onboarding') },
      { label: 'Ver tour guiado', kind: 'action', onClick: () => openGuide('tour') },
      ...(canOpenMyAccount ? [{ label: 'Minha conta', kind: 'link' as const, href: '/configuracoes#perfil-da-conta' }] : []),
      ...(canOpenSettings ? [{ label: 'Configurações', kind: 'link' as const, href: '/configuracoes/integracoes' }] : []),
    ],
    [canOpenMyAccount, canOpenSettings],
  )

  const applyNotificationPayload = useCallback((payload: any) => {
    setNotifications(Array.isArray(payload?.notifications) ? (payload.notifications as HeaderNotification[]) : [])
    setUnreadCount(Number(payload?.unreadCount ?? 0))
  }, [])

  const loadNotifications = useCallback(
    async (signal?: AbortSignal, sync = true) => {
      setNotifLoading(true)
      setNotifError(null)
      try {
        const res = await fetch(`/api/notifications?limit=6${sync ? '' : '&sync=false'}`, {
          method: 'GET',
          signal,
          keepalive: true,
        })
        const json = await res.json().catch(() => null)
        if (!res.ok) {
          setNotifError(String(json?.error ?? 'Não foi possível carregar notificações.'))
          return
        }
        if (signal?.aborted) return
        applyNotificationPayload(json)
      } catch (error) {
        if (signal?.aborted || isAbortLikeError(error)) return
        setNotifError('Não foi possível carregar notificações.')
      } finally {
        if (!signal?.aborted) setNotifLoading(false)
      }
    },
    [applyNotificationPayload],
  )

  useEffect(() => {
    const devRole = process.env.NODE_ENV === 'development' ? normalizeRole(getCookieValue('cp_dev_role')) : null
    const cookieRole = normalizeRole(getCookieValue('cp_role'))
    setClientCookieRole(devRole ?? cookieRole ?? null)
  }, [])

  useEffect(() => {
    if (!notifOpen && !userOpen) return
    const onDoc = (ev: MouseEvent) => {
      const t = ev.target as HTMLElement | null
      if (!t) return
      const notifRoot = t.closest(`[data-menu-root="${notifRootId}"]`)
      const userRoot = t.closest(`[data-menu-root="${userRootId}"]`)
      if (!notifRoot) setNotifOpen(false)
      if (!userRoot) setUserOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [notifOpen, userOpen, notifRootId, userRootId])

  useEffect(() => {
    if (!notifOpen && !userOpen) return
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        setNotifOpen(false)
        setUserOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [notifOpen, userOpen])

  useEffect(() => {
    if (!userOpen) return
    for (const item of userMenuItems) {
      if (item.kind !== 'link') continue
      void router.prefetch(item.href.split('#')[0] || item.href)
    }
  }, [router, userMenuItems, userOpen])

  useEffect(() => {
    const controller = new AbortController()
    void loadNotifications(controller.signal)
    return () => controller.abort()
  }, [loadNotifications])

  useEffect(() => {
    if (!notifOpen) return
    const controller = new AbortController()
    void loadNotifications(controller.signal)
    return () => controller.abort()
  }, [loadNotifications, notifOpen])

  const handleUserMenuLogout = async () => {
    if (signingOut) return
    setSigningOut(true)
    setUserOpen(false)
    try {
      await signOut()
      if (typeof window !== 'undefined') {
        window.location.assign('/login')
        return
      }
      router.replace('/login')
    } finally {
      setSigningOut(false)
    }
  }

  const handleUserMenuLinkActivation = (href: string) => {
    setUserOpen(false)
    router.push(href)
  }

  const handleMarkAllNotificationsRead = async () => {
    if (markingAllRead || unreadCount === 0) return
    setMarkingAllRead(true)
    setNotifError(null)
    try {
      const res = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ markAllRead: true }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setNotifError(String(json?.error ?? 'Não foi possível atualizar notificações.'))
        return
      }
      applyNotificationPayload(json)
    } catch (error) {
      if (!isAbortLikeError(error)) setNotifError('Não foi possível atualizar notificações.')
    } finally {
      setMarkingAllRead(false)
    }
  }

  const handleNotificationActivation = async (notification: HeaderNotification) => {
    setNotifOpen(false)
    if (!notification.read) {
      setMarkingNotificationId(notification.id)
      setNotifError(null)
      try {
        const res = await fetch('/api/notifications', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ notificationId: notification.id }),
        })
        const json = await res.json().catch(() => null)
        if (!res.ok) {
          setNotifError(String(json?.error ?? 'Não foi possível atualizar notificações.'))
        } else {
          applyNotificationPayload(json)
        }
      } catch (error) {
        if (!isAbortLikeError(error)) setNotifError('Não foi possível atualizar notificações.')
      } finally {
        setMarkingNotificationId(null)
      }
    }
    if (notification.href) router.push(notification.href)
  }

  const toggleUserMenu = () => {
    setUserMenuAttempts((count) => count + 1)
    setNotifOpen(false)
    setUserOpen((current) => !current)
  }

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 70,
        background: 'rgba(244,246,251,.86)',
        backdropFilter: 'blur(18px)',
        borderBottom: `1px solid ${BORDER}`,
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <button
          onClick={onOpenMenu}
          disabled={!onOpenMenu}
          aria-label="Abrir menu"
          className="flex md:hidden"
          data-testid="mobile-menu-button"
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: 'white',
            border: `1px solid ${BORDER}`,
            alignItems: 'center',
            justifyContent: 'center',
            cursor: onOpenMenu ? 'pointer' : 'default',
            color: MUTED,
            opacity: onOpenMenu ? 1 : 0.5,
          }}
        >
          <Menu size={16} />
        </button>
        <div style={{ minWidth: 0 }}>
          {section ? (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 10px',
                borderRadius: 999,
                background: 'rgba(2,27,91,.05)',
                border: `1px solid ${BORDER}`,
                fontFamily: F,
                fontWeight: 700,
                fontSize: 10.5,
                color: NAVY,
                marginBottom: 8,
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: 999, background: MINT }} />
              {section}
            </div>
          ) : null}
          <h1 style={{ fontFamily: F, fontWeight: 800, fontSize: 20, color: TEXT, lineHeight: 1.05, letterSpacing: '-0.03em' }}>{title}</h1>
          {subtitle && <p style={{ fontFamily: F, fontSize: 12.5, color: MUTED, marginTop: 5, maxWidth: 680 }}>{subtitle}</p>}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          type="button"
          onClick={() => openGuide('onboarding')}
          style={{
            minHeight: 36,
            borderRadius: 10,
            background: 'white',
            border: `1px solid ${BORDER}`,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '0 12px',
            fontFamily: F,
            fontWeight: 700,
            fontSize: 12.5,
            color: TEXT,
            cursor: 'pointer',
          }}
        >
          <Compass size={14} style={{ color: NAVY }} />
          <span className="hidden md:inline">Guia</span>
        </button>
        <div data-menu-root={notifRootId} style={{ position: 'relative' }}>
          <button
            onClick={(e) => {
              e.stopPropagation()
              setUserOpen(false)
              setNotifOpen(!notifOpen)
            }}
            aria-label="Notificações"
            aria-haspopup="menu"
            aria-expanded={notifOpen}
            style={{
              position: 'relative',
              width: 36,
              height: 36,
              borderRadius: 10,
              background: 'white',
              border: `1px solid ${BORDER}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: MUTED,
            }}
          >
            <Bell size={15} />
            {unreadCount > 0 ? (
              <span
                style={{
                  position: 'absolute',
                  top: -4,
                  right: -4,
                  minWidth: 18,
                  height: 18,
                  padding: '0 5px',
                  borderRadius: 999,
                  background: '#DC2626',
                  color: 'white',
                  fontFamily: F,
                  fontWeight: 800,
                  fontSize: 10,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 0 0 2px #F4F6FB',
                }}
              >
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            ) : null}
          </button>
          {notifOpen && (
            <div
              role="menu"
              className="cp-fade-in"
              style={{
                position: 'absolute',
                right: 0,
                top: 44,
                background: 'white',
                border: `1px solid ${BORDER}`,
                borderRadius: 14,
                boxShadow: '0 12px 34px rgba(0,0,0,.14)',
                overflow: 'hidden',
                width: 320,
                zIndex: 20,
              }}
            >
              <div style={{ padding: '12px 14px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontFamily: F, fontWeight: 800, fontSize: 12.5, color: TEXT }}>Notificações</div>
                  <div style={{ fontFamily: F, fontSize: 11.5, color: MUTED, marginTop: 2 }}>{unreadCount > 0 ? `${unreadCount} não lida(s)` : 'Tudo em dia'}</div>
                </div>
                <button
                  type="button"
                  disabled={markingAllRead || unreadCount === 0}
                  onClick={() => void handleMarkAllNotificationsRead()}
                  style={{
                    border: 'none',
                    background: 'none',
                    cursor: markingAllRead || unreadCount === 0 ? 'default' : 'pointer',
                    color: unreadCount === 0 ? MUTED : NAVY,
                    fontFamily: F,
                    fontWeight: 700,
                    fontSize: 11.5,
                    opacity: markingAllRead || unreadCount === 0 ? 0.6 : 1,
                  }}
                >
                  {markingAllRead ? 'Atualizando...' : 'Marcar tudo'}
                </button>
              </div>
              {notifLoading ? (
                <div style={{ padding: '14px', fontFamily: F, fontSize: 12.5, color: MUTED }}>Carregando notificações...</div>
              ) : notifError ? (
                <div style={{ padding: '14px', fontFamily: F, fontSize: 12.5, color: '#B45309' }}>{notifError}</div>
              ) : notifications.length === 0 ? (
                <div style={{ padding: '14px', fontFamily: F, fontSize: 12.5, color: MUTED }}>Nenhuma notificação no momento</div>
              ) : (
                <div style={{ maxHeight: 340, overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {notifications.map((notification) => {
                    const visuals = getNotificationVisuals(notification.severity, notification.read)
                    return (
                      <button
                        key={notification.id}
                        type="button"
                        onClick={() => void handleNotificationActivation(notification)}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          borderRadius: 12,
                          border: `1px solid ${visuals.border}`,
                          background: visuals.background,
                          padding: '11px 12px',
                          cursor: 'pointer',
                          display: 'flex',
                          gap: 10,
                          opacity: notification.read ? 0.82 : 1,
                        }}
                      >
                        <div style={{ flexShrink: 0, marginTop: 1 }}>{visuals.icon}</div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                            <p style={{ fontFamily: F, fontWeight: 700, fontSize: 12.5, color: TEXT, lineHeight: 1.35 }}>{notification.title}</p>
                            {!notification.read ? <span style={{ width: 8, height: 8, borderRadius: 999, background: NAVY, flexShrink: 0 }} /> : null}
                          </div>
                          <p style={{ fontFamily: F, fontSize: 11.5, color: MUTED, lineHeight: 1.45, marginTop: 4 }}>{notification.message}</p>
                          <p style={{ fontFamily: F, fontSize: 10.5, color: MUTED, marginTop: 6 }}>
                            {markingNotificationId === notification.id ? 'Atualizando...' : formatNotificationTimestamp(notification.createdAt)}
                          </p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <div data-menu-root={userRootId} style={{ position: 'relative' }}>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault()
              e.stopPropagation()
              toggleUserMenu()
            }}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' && e.key !== ' ') return
              e.preventDefault()
              e.stopPropagation()
              toggleUserMenu()
            }}
            aria-label="Menu do usuário"
            aria-haspopup="menu"
            aria-expanded={userOpen}
            data-user-menu-attempts={String(userMenuAttempts)}
            style={{
              minHeight: 36,
              borderRadius: 12,
              background: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontFamily: F,
              border: `1px solid ${BORDER}`,
              gap: 10,
              padding: '6px 8px 6px 6px',
              boxShadow: '0 1px 3px rgba(2,27,91,.04)',
            }}
          >
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: 8,
                background: MINT,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: 10.5,
                color: NAVY,
                flexShrink: 0,
              }}
            >
              {avatar}
            </div>
            <div className="hidden md:block" style={{ minWidth: 0, textAlign: 'left', maxWidth: 160 }}>
              <p className="truncate" style={{ fontFamily: F, fontWeight: 700, fontSize: 12, color: TEXT }}>
                {me?.fullName ?? 'Minha conta'}
              </p>
              <p className="truncate" style={{ fontFamily: F, fontSize: 11, color: MUTED }}>
                {me?.email ?? session?.user?.email ?? 'Conta ativa'}
              </p>
            </div>
          </button>
          {userOpen && (
            <div
              role="menu"
              className="cp-fade-in"
              style={{
                position: 'absolute',
                right: 0,
                top: 44,
                background: 'white',
                border: `1px solid ${BORDER}`,
                borderRadius: 14,
                boxShadow: '0 12px 34px rgba(0,0,0,.14)',
                overflow: 'hidden',
                width: 220,
                zIndex: 20,
              }}
            >
              {userMenuItems.map((it) =>
                it.kind === 'link' ? (
                  <button
                    key={it.label}
                    type="button"
                    data-href={it.href}
                    role="menuitem"
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      background: 'white',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '10px 12px',
                      fontFamily: F,
                      fontSize: 12.5,
                      color: TEXT,
                    }}
                    onMouseEnter={(e) => {
                      void router.prefetch(it.href.split('#')[0] || it.href)
                      e.currentTarget.style.background = '#FAFBFD'
                    }}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'white')}
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      handleUserMenuLinkActivation(it.href)
                    }}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter' && e.key !== ' ') return
                      e.preventDefault()
                      e.stopPropagation()
                      handleUserMenuLinkActivation(it.href)
                    }}
                  >
                    {it.label}
                  </button>
                ) : (
                  <button
                    key={it.label}
                    type="button"
                    onClick={() => {
                      setUserOpen(false)
                      it.onClick()
                    }}
                    role="menuitem"
                    style={{ width: '100%', textAlign: 'left', background: 'white', border: 'none', cursor: 'pointer', padding: '10px 12px', fontFamily: F, fontSize: 12.5, color: TEXT }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#FAFBFD')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'white')}
                  >
                    {it.label}
                  </button>
                ),
              )}
              <div style={{ height: 1, background: BORDER }} />
              <button
                disabled={signingOut}
                onMouseDown={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  void handleUserMenuLogout()
                }}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' && e.key !== ' ') return
                  e.preventDefault()
                  e.stopPropagation()
                  void handleUserMenuLogout()
                }}
                role="menuitem"
                style={{
                  width: '100%',
                  textAlign: 'left',
                  background: 'white',
                  border: 'none',
                  cursor: signingOut ? 'default' : 'pointer',
                  padding: '10px 12px',
                  fontFamily: F,
                  fontSize: 12.5,
                  color: '#DC2626',
                  opacity: signingOut ? 0.6 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!signingOut) e.currentTarget.style.background = '#FEF2F2'
                }}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'white')}
              >
                {signingOut ? 'Saindo...' : 'Sair'}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

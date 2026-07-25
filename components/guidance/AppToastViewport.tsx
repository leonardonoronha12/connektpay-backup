'use client'

import { APP_TOAST_EVENT, type AppToastDetail, tonePalette } from '@/lib/app-events'
import { useEffect, useMemo, useState } from 'react'

type ToastRecord = AppToastDetail & { id: number }

export function AppToastViewport() {
  const [toasts, setToasts] = useState<ToastRecord[]>([])

  useEffect(() => {
    const onToast = (event: Event) => {
      const detail = (event as CustomEvent<AppToastDetail>).detail
      if (!detail?.message) return
      const toastId = detail.id ?? Date.now() + Math.floor(Math.random() * 1000)
      setToasts((current) => {
        const next = [...current, { ...detail, id: toastId }].slice(-3)
        return next
      })
      if (detail.tone !== 'loading') {
        window.setTimeout(() => {
          setToasts((current) => current.filter((toast) => toast.id !== toastId))
        }, detail.durationMs ?? 3600)
      }
    }

    window.addEventListener(APP_TOAST_EVENT, onToast as EventListener)
    return () => window.removeEventListener(APP_TOAST_EVENT, onToast as EventListener)
  }, [])

  const renderedToasts = useMemo(() => toasts, [toasts])

  return (
    <div
      id="cp-toast-viewport"
      data-toast-viewport="true"
      aria-live="polite"
      aria-atomic="true"
      style={{
        position: 'fixed',
        top: 16,
        right: 16,
        left: 16,
        zIndex: 130,
        display: 'grid',
        gap: 10,
        justifyItems: 'end',
        pointerEvents: 'none',
      }}
    >
      {renderedToasts.map((toast) => {
        const palette = tonePalette(toast.tone)
        return (
          <div
            key={toast.id}
            data-toast="true"
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="cp-fade-in"
            style={{
              width: 'min(100%, 430px)',
              background: palette.bg,
              border: `1px solid ${palette.border}`,
              borderRadius: 16,
              boxShadow: '0 18px 40px rgba(15,23,42,.18)',
              padding: '14px 16px',
              display: 'flex',
              gap: 12,
              alignItems: 'flex-start',
              pointerEvents: 'auto',
            }}
          >
            <div
              style={{
                minWidth: 18,
                fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
                fontWeight: 800,
                fontSize: 12,
                color: palette.title,
                marginTop: 1,
              }}
            >
              {palette.icon}
            </div>
            <div style={{ minWidth: 0 }}>
              {toast.title ? (
                <div
                  style={{
                    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
                    fontWeight: 800,
                    fontSize: 13,
                    color: palette.title,
                    marginBottom: 3,
                  }}
                >
                  {toast.title}
                </div>
              ) : null}
              <div
                style={{
                  fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
                  fontSize: 13,
                  lineHeight: 1.45,
                  color: palette.text,
                }}
              >
                {toast.message}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

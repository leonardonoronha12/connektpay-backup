'use client'

import { BORDER, F, MUTED, NAVY, TEXT } from '@/lib/design-tokens'
import { useEffect, useId, useRef } from 'react'

export function Modal({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  maxWidth = 520,
  dismissOnBackdrop = true,
  dismissOnEscape = true,
}: {
  open: boolean
  title?: string
  description?: string
  onClose: () => void
  children: React.ReactNode
  footer?: React.ReactNode
  maxWidth?: number
  dismissOnBackdrop?: boolean
  dismissOnEscape?: boolean
}) {
  const titleId = useId()
  const descId = useId()
  const dialogRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape' && dismissOnEscape) onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose, dismissOnEscape])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    dialogRef.current?.focus()
  }, [open])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      aria-describedby={description ? descId : undefined}
      onPointerDown={
        dismissOnBackdrop
          ? (e) => {
              const panel = dialogRef.current
              const target = e.target as Node | null
              if (!panel || !target) return
              if (!panel.contains(target)) onClose()
            }
          : undefined
      }
      onMouseDown={
        dismissOnBackdrop
          ? (e) => {
              const panel = dialogRef.current
              const target = e.target as Node | null
              if (!panel || !target) return
              if (!panel.contains(target)) onClose()
            }
          : undefined
      }
      className="cp-fade-in"
      style={{ position: 'fixed', inset: 0, background: 'rgba(2,27,91,.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 12, zIndex: 120, overflowY: 'auto', overflowX: 'hidden', overscrollBehavior: 'contain' }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="cp-fade-in"
        onPointerDown={dismissOnBackdrop ? (e) => e.stopPropagation() : undefined}
        onMouseDown={dismissOnBackdrop ? (e) => e.stopPropagation() : undefined}
        onTouchStart={dismissOnBackdrop ? (e) => e.stopPropagation() : undefined}
        onClick={dismissOnBackdrop ? (e) => e.stopPropagation() : undefined}
        style={{
          width: '100%',
          maxWidth,
          maxHeight: 'calc(100dvh - 24px)',
          background: 'white',
          borderRadius: 16,
          border: `1px solid ${BORDER}`,
          boxShadow: '0 12px 50px rgba(0,0,0,.26)',
          overflow: 'hidden',
          margin: 'auto',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        }}
      >
        {(title || description) && (
          <div style={{ padding: '18px 18px 0 18px' }}>
            {title ? <p id={titleId} style={{ fontFamily: F, fontWeight: 900, fontSize: 15.5, color: TEXT, marginBottom: description ? 6 : 0 }}>{title}</p> : null}
            {description ? <p id={descId} style={{ fontFamily: F, fontSize: 12.5, color: MUTED, lineHeight: 1.6 }}>{description}</p> : null}
          </div>
        )}

        <div style={{ padding: 18, overflowY: 'auto', overflowX: 'hidden', flex: '1 1 auto', minHeight: 0, WebkitOverflowScrolling: 'touch' }}>{children}</div>

        {footer ? <div style={{ padding: 18, borderTop: `1px solid ${BORDER}`, background: '#FAFBFD', flexShrink: 0 }}>{footer}</div> : null}
      </div>
    </div>
  )
}

export function ModalFieldLabel({ children }: { children: React.ReactNode }) {
  return <p style={{ fontFamily: F, fontWeight: 800, fontSize: 12, color: NAVY, marginBottom: 6 }}>{children}</p>
}

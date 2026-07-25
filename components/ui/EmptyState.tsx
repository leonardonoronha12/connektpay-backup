'use client'

import { BORDER, F, MUTED, TEXT } from '@/lib/design-tokens'
import { PrimaryBtn, GhostBtn } from '@/components/ui/Buttons'

export function EmptyState({
  icon,
  title,
  description,
  primaryAction,
  secondaryAction,
}: {
  icon?: React.ReactNode
  title: string
  description?: string
  primaryAction?: { label: string; onClick: () => void; loading?: boolean; disabled?: boolean }
  secondaryAction?: { label: string; onClick: () => void; disabled?: boolean }
}) {
  const helperLabel = primaryAction ? 'Proximo passo recomendado' : 'Tudo pronto para receber novos dados'

  return (
    <div style={{ padding: '36px 18px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div
        style={{
          width: '100%',
          maxWidth: 560,
          background: 'linear-gradient(180deg, rgba(255,255,255,1) 0%, rgba(249,251,255,1) 100%)',
          border: `1px solid ${BORDER}`,
          borderRadius: 22,
          padding: 24,
          textAlign: 'center',
          boxShadow: '0 18px 34px rgba(2,27,91,.06)',
        }}
      >
        {icon ? (
          <div
            style={{
              width: 58,
              height: 58,
              borderRadius: 18,
              margin: '0 auto 16px auto',
              background: 'linear-gradient(180deg, #F8FAFF 0%, #EEF3FF 100%)',
              border: `1px solid ${BORDER}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,.65)',
            }}
          >
            {icon}
          </div>
        ) : null}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
              padding: '6px 11px',
            borderRadius: 999,
            background: '#F8FAFF',
            border: `1px solid ${BORDER}`,
            fontFamily: F,
            fontSize: 11,
            fontWeight: 700,
            color: MUTED,
            marginBottom: 12,
          }}
        >
            {helperLabel}
        </div>
        <p style={{ fontFamily: F, fontWeight: 900, fontSize: 18, color: TEXT, marginBottom: 8, letterSpacing: '-0.03em' }}>{title}</p>
        {description ? <p style={{ fontFamily: F, fontSize: 13, color: MUTED, lineHeight: 1.65, marginBottom: 18, maxWidth: 430, marginInline: 'auto' }}>{description}</p> : null}
        {(primaryAction || secondaryAction) && (
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            {secondaryAction ? (
              <GhostBtn disabled={secondaryAction.disabled} onClick={secondaryAction.onClick}>
                {secondaryAction.label}
              </GhostBtn>
            ) : null}
            {primaryAction ? (
              <PrimaryBtn disabled={primaryAction.disabled} loading={primaryAction.loading} onClick={primaryAction.onClick}>
                {primaryAction.label}
              </PrimaryBtn>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}

'use client'

import { BORDER, F, FAINT, MINT, MINT_D, NAVY } from '@/lib/design-tokens'

export function PrimaryBtn({
  children,
  onClick,
  size = 'md',
  disabled = false,
  loading = false,
  type = 'button',
}: {
  children: React.ReactNode
  onClick?: () => void
  size?: 'sm' | 'md'
  disabled?: boolean
  loading?: boolean
  type?: 'button' | 'submit' | 'reset'
}) {
  const isDisabled = disabled || loading
  return (
    <button
      type={type}
      disabled={isDisabled}
      aria-disabled={isDisabled}
      aria-busy={loading}
      onClick={onClick}
      className="flex items-center gap-2"
      style={{
        background: `linear-gradient(180deg, ${MINT} 0%, ${MINT_D} 100%)`,
        color: NAVY,
        fontFamily: F,
        fontWeight: 800,
        fontSize: size === 'sm' ? 13 : 14,
        padding: size === 'sm' ? '8px 15px' : '11px 18px',
        borderRadius: 12,
        border: 'none',
        cursor: isDisabled ? 'default' : 'pointer',
        boxShadow: isDisabled ? 'none' : '0 10px 22px rgba(57,240,174,.22)',
        transition: 'background .15s, transform .15s, box-shadow .15s',
        opacity: isDisabled ? 0.62 : 1,
        justifyContent: 'center',
        whiteSpace: 'nowrap',
      }}
      onMouseEnter={(e) => {
        if (!isDisabled) {
          e.currentTarget.style.background = `linear-gradient(180deg, ${MINT_D} 0%, ${MINT_D} 100%)`
          e.currentTarget.style.transform = 'translateY(-1px)'
          e.currentTarget.style.boxShadow = '0 14px 26px rgba(57,240,174,.24)'
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = `linear-gradient(180deg, ${MINT} 0%, ${MINT_D} 100%)`
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = isDisabled ? 'none' : '0 10px 22px rgba(57,240,174,.22)'
      }}
    >
      {loading ? <span className="inline-block w-4 h-4 rounded-full border-2 border-[#021B5B] border-t-transparent animate-spin" /> : null}
      {children}
    </button>
  )
}

export function DangerBtn({
  children,
  onClick,
  disabled = false,
  loading = false,
  type = 'button',
}: {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  loading?: boolean
  type?: 'button' | 'submit' | 'reset'
}) {
  const isDisabled = disabled || loading
  return (
    <button
      type={type}
      disabled={isDisabled}
      aria-disabled={isDisabled}
      aria-busy={loading}
      onClick={onClick}
      style={{
        background: '#FFF5F5',
        color: '#DC2626',
        fontFamily: F,
        fontWeight: 700,
        fontSize: 12.5,
        padding: '8px 13px',
        borderRadius: 10,
        border: '1px solid #FECACA',
        cursor: isDisabled ? 'default' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        transition: 'background .15s, transform .15s',
        opacity: isDisabled ? 0.65 : 1,
        justifyContent: 'center',
        whiteSpace: 'nowrap',
      }}
      onMouseEnter={(e) => {
        if (!isDisabled) {
          e.currentTarget.style.background = '#FEE2E2'
          e.currentTarget.style.transform = 'translateY(-1px)'
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = '#FFF5F5'
        e.currentTarget.style.transform = 'translateY(0)'
      }}
    >
      {loading ? <span className="inline-block w-4 h-4 rounded-full border-2 border-[#DC2626] border-t-transparent animate-spin" /> : null}
      {children}
    </button>
  )
}

export function GhostBtn({
  children,
  onClick,
  disabled = false,
  loading = false,
  type = 'button',
}: {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  loading?: boolean
  type?: 'button' | 'submit' | 'reset'
}) {
  const isDisabled = disabled || loading
  return (
    <button
      type={type}
      disabled={isDisabled}
      aria-disabled={isDisabled}
      aria-busy={loading}
      onClick={onClick}
      style={{
        background: 'rgba(255,255,255,.76)',
        color: NAVY,
        fontFamily: F,
        fontWeight: 700,
        fontSize: 12.5,
        padding: '8px 13px',
        borderRadius: 10,
        border: `1px solid ${BORDER}`,
        cursor: isDisabled ? 'default' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        transition: 'background .15s, border-color .15s, transform .15s',
        opacity: isDisabled ? 0.65 : 1,
        justifyContent: 'center',
        whiteSpace: 'nowrap',
        backdropFilter: 'blur(10px)',
      }}
      onMouseEnter={(e) => {
        if (!isDisabled) {
          e.currentTarget.style.background = '#F8FAFF'
          e.currentTarget.style.borderColor = 'rgba(2,27,91,.14)'
          e.currentTarget.style.transform = 'translateY(-1px)'
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'rgba(255,255,255,.76)'
        e.currentTarget.style.borderColor = BORDER
        e.currentTarget.style.transform = 'translateY(0)'
      }}
    >
      {loading ? <span className="inline-block w-4 h-4 rounded-full border-2 border-[#021B5B] border-t-transparent animate-spin" /> : null}
      {children}
    </button>
  )
}

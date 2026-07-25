'use client'

import { MINT } from '@/lib/design-tokens'

export function Toggle({ on, set, disabled = false }: { on: boolean; set: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => {
        if (!disabled) set(!on)
      }}
      aria-pressed={on}
      disabled={disabled}
      style={{
        width: 40,
        height: 22,
        background: on ? MINT : '#CBD5E1',
        borderRadius: 11,
        transition: 'background .2s',
        flexShrink: 0,
        position: 'relative',
        border: 'none',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: 2,
          width: 18,
          height: 18,
          borderRadius: 9,
          background: 'white',
          boxShadow: '0 1px 4px rgba(0,0,0,.18)',
          transition: 'transform .2s',
          transform: on ? 'translateX(18px)' : 'translateX(0)',
        }}
      />
    </button>
  )
}

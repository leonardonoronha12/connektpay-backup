'use client'

import { BORDER, F, MONO, TEXT } from '@/lib/design-tokens'

export function TableCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'linear-gradient(180deg, rgba(255,255,255,1) 0%, rgba(250,252,255,1) 100%)',
        borderRadius: 18,
        border: `1px solid ${BORDER}`,
        boxShadow: '0 14px 28px rgba(2,27,91,.05)',
        overflowX: 'auto',
        overflowY: 'hidden',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      {children}
    </div>
  )
}

export function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      style={{
        fontFamily: F,
        fontWeight: 700,
        fontSize: 10.5,
        color: '#8392AB',
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        padding: '12px 20px',
        textAlign: 'left',
        background: '#F8FAFF',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </th>
  )
}

export function Td({ children, mono = false }: { children: React.ReactNode; mono?: boolean }) {
  return (
    <td
      style={{
        padding: '13px 20px',
        fontFamily: mono ? MONO : F,
        fontSize: 13,
        color: TEXT,
        borderBottom: `1px solid ${BORDER}`,
        lineHeight: 1.45,
        verticalAlign: 'middle',
      }}
    >
      {children}
    </td>
  )
}

'use client'

import { F } from '@/lib/design-tokens'
import { initials } from '@/utils/format'

export function Avi({ name, size = 28 }: { name: string; size?: number }) {
  const colors: [string, string][] = [
    ['#DBEAFE', '#1D4ED8'],
    ['#D1FAE5', '#065F46'],
    ['#EDE9FE', '#5B21B6'],
    ['#FCE7F3', '#9D174D'],
    ['#FEF3C7', '#92400E'],
  ]
  const [bg, fg] = colors[name.charCodeAt(0) % colors.length] ?? ['#DBEAFE', '#1D4ED8']
  return (
    <div
      style={{
        width: size,
        height: size,
        background: bg,
        color: fg,
        borderRadius: '50%',
        fontSize: size * 0.35,
        fontFamily: F,
        fontWeight: 700,
      }}
      className="flex items-center justify-center flex-shrink-0"
    >
      {initials(name)}
    </div>
  )
}


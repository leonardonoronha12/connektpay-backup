'use client'

import { BORDER, F, MUTED } from '@/lib/design-tokens'

export function Skeleton({
  height = 12,
  width = '100%',
  radius = 10,
}: {
  height?: number
  width?: number | string
  radius?: number
}) {
  return <div className="cp-skeleton" style={{ width, height, borderRadius: radius }} />
}

export function TableSkeleton({
  rows = 6,
  cols = 6,
  rowHeight = 46,
}: {
  rows?: number
  cols?: number
  rowHeight?: number
}) {
  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(120px, 1fr))`, gap: 12 }}>
        {Array.from({ length: rows * cols }).map((_, i) => (
          <Skeleton key={i} height={12} radius={8} />
        ))}
      </div>
      <div style={{ height: 16 }} />
      <div style={{ borderTop: `1px solid ${BORDER}` }} />
      <div style={{ height: 14 }} />
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(120px, 1fr))`, gap: 12 }}>
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} height={10} radius={8} />
        ))}
      </div>
      <div style={{ height: 10 }} />
      <div style={{ fontFamily: F, fontSize: 12.5, color: MUTED, textAlign: 'center', paddingTop: 2 }}>
        <span className="inline-block w-4 h-4 rounded-full border-2 border-[#94A3B8] border-t-transparent animate-spin" style={{ verticalAlign: 'middle', marginRight: 8 }} />
        Carregando dados da tela...
      </div>
      <div style={{ height: rowHeight }} />
    </div>
  )
}

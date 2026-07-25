'use client'

import { BORDER, F, FAINT, MINT, MUTED, NAVY, TEXT } from '@/lib/design-tokens'
import { ChevronUp, TrendingDown } from 'lucide-react'

export function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  trend,
  accent = false,
  loading = false,
}: {
  label: string
  value: string
  sub: string
  icon: React.ElementType
  trend?: 'up' | 'down'
  accent?: boolean
  loading?: boolean
}) {
  return (
    <div
      style={{
        background: accent ? 'linear-gradient(180deg, #08277A 0%, #021B5B 100%)' : 'linear-gradient(180deg, rgba(255,255,255,1) 0%, rgba(249,251,255,1) 100%)',
        borderRadius: 18,
        border: accent ? '1px solid rgba(255,255,255,.06)' : `1px solid ${BORDER}`,
        padding: '22px 22px 20px',
        boxShadow: accent ? `0 18px 42px rgba(2,27,91,.24)` : '0 10px 28px rgba(2,27,91,.06)',
        transition: 'box-shadow .2s, transform .2s',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: accent ? 'auto -18px -22px auto' : '-28px -28px auto auto',
          width: 86,
          height: 86,
          borderRadius: '50%',
          background: accent ? 'rgba(57,240,174,.14)' : 'rgba(2,27,91,.035)',
          filter: 'blur(2px)',
        }}
      />
      <div className="flex items-start justify-between mb-4">
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            background: accent ? `${MINT}18` : FAINT,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: accent ? '1px solid rgba(255,255,255,.08)' : `1px solid ${BORDER}`,
            position: 'relative',
            zIndex: 1,
          }}
        >
          <Icon size={18} style={{ color: accent ? MINT : NAVY }} />
        </div>
        {trend && (
          <span
            style={{
              background: trend === 'up' ? '#ECFDF5' : '#FEF2F2',
              color: trend === 'up' ? '#059669' : '#DC2626',
              fontFamily: F,
              fontWeight: 700,
              fontSize: 11,
              padding: '5px 8px',
              borderRadius: 999,
              display: 'flex',
              alignItems: 'center',
              gap: 3,
              border: `1px solid ${trend === 'up' ? '#A7F3D0' : '#FECACA'}`,
              position: 'relative',
              zIndex: 1,
            }}
          >
            {trend === 'up' ? <ChevronUp size={11} /> : <TrendingDown size={11} />}
            {sub}
          </span>
        )}
      </div>
      <p
        style={{
          fontFamily: F,
          fontWeight: 700,
          fontSize: 12,
          letterSpacing: '.01em',
          color: accent ? 'rgba(255,255,255,.68)' : MUTED,
          marginBottom: 8,
          position: 'relative',
          zIndex: 1,
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontFamily: F,
          fontWeight: 800,
          fontSize: 27,
          color: accent ? 'white' : TEXT,
          lineHeight: 1,
          letterSpacing: '-0.03em',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {loading ? (
          <span
            className="inline-block animate-pulse rounded"
            style={{ width: 120, height: 22, background: accent ? 'rgba(255,255,255,.18)' : '#E2E8F0' }}
          />
        ) : (
          value
        )}
      </p>
      {!trend && (
        <p style={{ fontFamily: F, fontSize: 11.5, color: accent ? 'rgba(255,255,255,.5)' : '#7C8CA5', marginTop: 8, position: 'relative', zIndex: 1 }}>
          {loading ? (
            <span
              className="inline-block animate-pulse rounded"
              style={{ width: 160, height: 12, background: accent ? 'rgba(255,255,255,.12)' : '#EEF2F7' }}
            />
          ) : (
            sub
          )}
        </p>
      )}
    </div>
  )
}

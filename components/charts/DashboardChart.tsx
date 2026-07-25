'use client'

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { BORDER, F, MINT, MUTED, NAVY } from '@/lib/design-tokens'
import { fmtBRL } from '@/utils/format'

export function DashboardChart({ series, navyId, mintId }: { series: any[]; navyId: string; mintId: string }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={series} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id={navyId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={NAVY} stopOpacity={0.12} />
            <stop offset="100%" stopColor={NAVY} stopOpacity={0} />
          </linearGradient>
          <linearGradient id={mintId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={MINT} stopOpacity={0.18} />
            <stop offset="100%" stopColor={MINT} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#EEF1F8" vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: MUTED, fontFamily: F }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: MUTED, fontFamily: F }} axisLine={false} tickLine={false} tickFormatter={(v) => `R$${(Number(v) / 100000).toFixed(0)}k`} />
        <Tooltip contentStyle={{ borderRadius: 10, border: `1px solid ${BORDER}`, boxShadow: '0 8px 24px rgba(0,0,0,.08)', fontSize: 12, fontFamily: F }} formatter={(v: number) => [fmtBRL(v)]} />
        <Area type="monotone" dataKey="volume" stroke={NAVY} strokeWidth={2.5} fill={`url(#${navyId})`} dot={false} activeDot={{ r: 4, fill: NAVY, strokeWidth: 2, stroke: 'white' }} name="Volume" />
        <Area type="monotone" dataKey="revenue" stroke={MINT} strokeWidth={2} fill={`url(#${mintId})`} dot={false} activeDot={{ r: 4, fill: MINT, stroke: 'white', strokeWidth: 2 }} name="Receita" />
      </AreaChart>
    </ResponsiveContainer>
  )
}

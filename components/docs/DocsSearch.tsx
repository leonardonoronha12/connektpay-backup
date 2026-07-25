'use client'

import { Command } from 'cmdk'
import { Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

type SearchItem = { title: string; href: string; section: string; content: string }

function useHotkey(toggle: () => void, close: () => void) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isK = e.key.toLowerCase() === 'k'
      const meta = e.metaKey || e.ctrlKey
      if (meta && isK) {
        e.preventDefault()
        toggle()
      }
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggle, close])
}

export function DocsSearchButton() {
  const [open, setOpen] = useState(false)
  useHotkey(
    () => setOpen((v) => !v),
    () => setOpen(false),
  )

  return (
    <>
      <button type="button" className="docs-btn" onClick={() => setOpen(true)} aria-label="Buscar na documentação">
        <Search size={16} />
        <span style={{ fontWeight: 800 }}>Buscar</span>
        <span className="docs-kbd">Ctrl K</span>
      </button>
      <DocsSearchDialog open={open} onOpenChange={setOpen} />
    </>
  )
}

export function DocsSearchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<SearchItem[] | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setQuery('')
  }, [open])

  useEffect(() => {
    if (!open || items) return
    let cancelled = false
    setLoading(true)
    fetch('/docs/search', { method: 'GET' })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return
        setItems(Array.isArray(j?.items) ? j.items : [])
      })
      .catch(() => {
        if (cancelled) return
        setItems([])
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, items])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const all = items ?? []
    if (!q) return all.slice(0, 50)
    const scored = all
      .map((it) => {
        const hay = `${it.title} ${it.section} ${it.content}`.toLowerCase()
        const idx = hay.indexOf(q)
        return { it, score: idx === -1 ? Infinity : idx }
      })
      .filter((x) => Number.isFinite(x.score))
      .sort((a, b) => a.score - b.score)
      .map((x) => x.it)
    return scored.slice(0, 50)
  }, [items, query])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onOpenChange(false)
      }}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(2,27,91,.35)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 90 }}
    >
      <div style={{ width: 'min(760px, calc(100vw - 24px))', borderRadius: 16, border: '1px solid var(--border)', background: 'var(--card)', boxShadow: '0 20px 60px rgba(0,0,0,.25)', overflow: 'hidden' }}>
        <Command label="Buscar na documentação">
          <div style={{ padding: 12, borderBottom: '1px solid var(--border)' }}>
            <Command.Input
              value={query}
              onValueChange={setQuery}
              autoFocus
              placeholder={loading ? 'Carregando índice…' : 'Buscar por título, tópico ou palavra-chave…'}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 12,
                border: '1px solid var(--border)',
                background: 'color-mix(in srgb, var(--secondary) 70%, transparent)',
                outline: 'none',
                fontSize: 14,
                fontWeight: 650,
                color: 'var(--foreground)',
              }}
            />
          </div>
          <Command.List style={{ maxHeight: 'min(520px, calc(100vh - 220px))', overflow: 'auto', padding: 8 }}>
            <Command.Empty style={{ padding: 16, color: 'var(--muted-foreground)', fontWeight: 650 }}>Nenhum resultado.</Command.Empty>
            {filtered.map((it) => (
              <Command.Item
                key={it.href}
                value={`${it.title} ${it.section}`}
                onSelect={() => {
                  onOpenChange(false)
                  router.push(it.href)
                }}
                style={{
                  padding: '10px 12px',
                  borderRadius: 12,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 850, fontSize: 13.5, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.title}</div>
                  <div style={{ marginTop: 2, fontSize: 12, color: 'var(--muted-foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.section}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, color: 'var(--muted-foreground)' }}>
                  <Search size={14} />
                </div>
              </Command.Item>
            ))}
          </Command.List>
        </Command>
        <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', color: 'var(--muted-foreground)', fontSize: 12, fontWeight: 650 }}>
          <span>Enter para abrir</span>
          <span>Esc para fechar</span>
        </div>
      </div>
    </div>
  )
}

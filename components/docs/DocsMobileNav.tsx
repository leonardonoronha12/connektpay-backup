'use client'

import * as Dialog from '@radix-ui/react-dialog'
import type { DocsNavItem } from '@/lib/docs/registry'
import { Menu, X } from 'lucide-react'
import { useRouter } from 'next/navigation'

export function DocsMobileNav({ nav }: { nav: Array<{ key: string; title: string; items: DocsNavItem[] }> }) {
  const router = useRouter()
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button type="button" className="docs-btn docs-mobile-nav-btn" aria-label="Abrir menu da documentação">
          <Menu size={16} />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay style={{ position: 'fixed', inset: 0, background: 'rgba(2,27,91,.35)', backdropFilter: 'blur(6px)' }} />
        <Dialog.Content
          style={{
            position: 'fixed',
            top: 10,
            left: 10,
            right: 10,
            bottom: 10,
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 16,
            overflow: 'auto',
            boxShadow: '0 20px 60px rgba(0,0,0,.25)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: 14, borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 900, letterSpacing: '-0.02em' }}>Documentação</div>
            <Dialog.Close asChild>
              <button type="button" className="docs-btn" aria-label="Fechar menu">
                <X size={16} />
              </button>
            </Dialog.Close>
          </div>
          <div style={{ padding: 10 }}>
            {nav.map((s) => (
              <div key={s.key} style={{ marginBottom: 14 }}>
                <div className="docs-nav-section-title">{s.title}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {s.items.map((it) => (
                    <Dialog.Close asChild key={it.href}>
                      <button
                        type="button"
                        className="docs-nav-item"
                        onClick={() => {
                          router.push(it.href)
                        }}
                      >
                        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.title}</span>
                      </button>
                    </Dialog.Close>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

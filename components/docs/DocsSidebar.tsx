'use client'

import type { DocsNavItem } from '@/lib/docs/registry'
import { usePathname } from 'next/navigation'
import Link from 'next/link'

export function DocsSidebar({ nav }: { nav: Array<{ key: string; title: string; items: DocsNavItem[] }> }) {
  const pathname = usePathname()
  return (
    <div>
      <div className="docs-side-header">
        <div className="docs-side-title">Connekt Pay v1.0.0</div>
      </div>
      <nav className="docs-nav">
        {nav.map((s) => (
          <div key={s.key}>
            <div className="docs-nav-section-title">{s.title}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {s.items.map((it) => {
                const active = pathname === it.href
                return (
                  <Link key={it.href} href={it.href} prefetch={false} className={`docs-nav-item${active ? ' docs-nav-item-active' : ''}`}>
                    <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.title}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>
    </div>
  )
}

import { DocsSearchButton } from '@/components/docs/DocsSearch'
import { DocsThemeToggle } from '@/components/docs/DocsThemeToggle'
import { DocsMobileNav } from '@/components/docs/DocsMobileNav'
import { DocsSidebar } from '@/components/docs/DocsSidebar'
import type { DocsNavItem } from '@/lib/docs/registry'
import Link from 'next/link'

export function DocsShell({
  nav,
  children,
}: {
  nav: Array<{ key: string; title: string; items: DocsNavItem[] }>
  children: React.ReactNode
}) {
  return (
    <div className="docs-root">
      <div className="docs-shell">
        <aside className="docs-sidebar">
          <DocsSidebar nav={nav} />
        </aside>
        <main className="docs-main">
          <div className="docs-topbar">
            <div className="docs-topbar-inner">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <DocsMobileNav nav={nav} />
                <Link href="/docs" prefetch={false} className="docs-link" style={{ fontWeight: 900, letterSpacing: '-0.02em' }}>
                  Docs
                </Link>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <DocsSearchButton />
                <DocsThemeToggle />
              </div>
            </div>
          </div>
          {children}
        </main>
      </div>
    </div>
  )
}

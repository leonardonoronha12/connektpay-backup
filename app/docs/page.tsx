import path from 'path'
import { DocsArticle } from '@/components/docs/DocsArticle'
import { DocsBreadcrumb } from '@/components/docs/DocsBreadcrumb'
import { DocsMissing } from '@/components/docs/DocsMissing'
import { renderDoc } from '@/lib/docs/markdown'
import { DOCS_HOME_SOURCE_PATH, DOCS_SECTIONS } from '@/lib/docs/registry'
import { getDocsNav } from '@/lib/docs/store'
import Link from 'next/link'

export const metadata = {
  title: 'Docs — Connekt Pay',
}

export default async function Page() {
  const abs = path.resolve(process.cwd(), DOCS_HOME_SOURCE_PATH)
  let rendered: { html: string; toc: any[] } | null = null
  try {
    rendered = await renderDoc(abs)
  } catch {
    rendered = null
  }
  const nav = getDocsNav()

  return (
    <>
      <DocsBreadcrumb segments={[{ title: 'Docs', href: '/docs' }, { title: 'Início' }]} />
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '10px 18px 0' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
          {DOCS_SECTIONS.map((s) => {
            const first = nav.find((x) => x.key === s.key)?.items?.[0]
            const href = first?.href ?? '/docs'
            return (
              <Link
                key={s.key}
                href={href}
                style={{
                  display: 'block',
                  textDecoration: 'none',
                  color: 'inherit',
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: 16,
                  padding: '14px 14px',
                  boxShadow: '0 1px 4px rgba(2,27,91,.04)',
                }}
              >
                <div style={{ fontWeight: 900, letterSpacing: '-0.02em', marginBottom: 4 }}>{s.title}</div>
                <div className="docs-muted" style={{ fontSize: 13.5, lineHeight: 1.5 }}>
                  Abrir seção
                </div>
              </Link>
            )
          })}
        </div>
      </div>
      {rendered ? <DocsArticle html={rendered.html} toc={rendered.toc as any} /> : <DocsMissing title="Documentação" />}
    </>
  )
}

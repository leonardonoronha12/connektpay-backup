import type { DocsTocItem } from '@/lib/docs/markdown'

export function DocsArticle({
  html,
  toc,
}: {
  html: string
  toc: DocsTocItem[]
}) {
  return (
    <div className="docs-content-wrap">
      <article className="docs-article">
        <div className="docs-markdown" dangerouslySetInnerHTML={{ __html: html }} />
      </article>
      {toc.length ? (
        <aside className="docs-toc">
          <div className="docs-toc-title">Nesta página</div>
          <div>
            {toc.map((h) => (
              <a key={h.id} href={`#${h.id}`} style={{ paddingLeft: h.depth === 2 ? 8 : h.depth === 3 ? 16 : 22 }}>
                {h.title}
              </a>
            ))}
          </div>
        </aside>
      ) : (
        <aside className="docs-toc" style={{ visibility: 'hidden' }} />
      )}
    </div>
  )
}

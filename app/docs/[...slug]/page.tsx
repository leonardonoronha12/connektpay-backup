import { notFound } from 'next/navigation'
import { DocsArticle } from '@/components/docs/DocsArticle'
import { DocsBreadcrumb } from '@/components/docs/DocsBreadcrumb'
import { DocsMissing } from '@/components/docs/DocsMissing'
import { renderDoc } from '@/lib/docs/markdown'
import { DOCS_SECTIONS } from '@/lib/docs/registry'
import { getDocBySlug, getDocsPages } from '@/lib/docs/store'

export async function generateStaticParams() {
  return getDocsPages().map((p) => ({ slug: p.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params
  const doc = getDocBySlug(slug)
  if (!doc) return { title: 'Docs — Connekt Pay' }
  return { title: `${doc.title} — Docs` }
}

export default async function Page({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params
  const doc = getDocBySlug(slug)
  if (!doc) notFound()

  const sectionTitle = DOCS_SECTIONS.find((s) => s.key === doc.section)?.title ?? doc.section
  let rendered: { html: string; toc: any[]; titleFromH1: string | null } | null = null
  try {
    rendered = await renderDoc(doc.absoluteSourcePath)
  } catch {
    rendered = null
  }
  const displayTitle = String(rendered?.titleFromH1 ?? doc.title)

  return (
    <>
      <DocsBreadcrumb segments={[{ title: 'Docs', href: '/docs' }, { title: sectionTitle }, { title: displayTitle }]} />
      {rendered ? <DocsArticle html={rendered.html} toc={rendered.toc as any} /> : <DocsMissing title={doc.title} />}
    </>
  )
}

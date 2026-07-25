import path from 'path'
import { cache } from 'react'
import { DOCS_NAV, DOCS_SECTIONS, type DocsNavItem, type DocsSectionKey } from './registry'

export type DocsPage = DocsNavItem & {
  slug: string[]
  absoluteSourcePath: string
}

function splitSlugFromHref(href: string) {
  const cleaned = href.replace(/^\/docs\/?/, '').replace(/\/+$/, '')
  if (!cleaned) return []
  return cleaned.split('/').filter(Boolean)
}

export const getDocsNav = cache(() => {
  const sections: Record<DocsSectionKey, { key: DocsSectionKey; title: string; items: DocsNavItem[] }> = Object.fromEntries(
    DOCS_SECTIONS.map((s) => [s.key, { ...s, items: [] }]),
  ) as any

  for (const item of DOCS_NAV) {
    sections[item.section].items.push(item)
  }

  return DOCS_SECTIONS.map((s) => sections[s.key])
})

export const getDocsPages = cache((): DocsPage[] => {
  const root = process.cwd()
  return DOCS_NAV.filter((d) => d.href !== '/docs').map((d) => ({
    ...d,
    slug: splitSlugFromHref(d.href),
    absoluteSourcePath: path.resolve(root, d.sourcePath),
  }))
})

export const getDocBySlug = cache((slug: string[]) => {
  const pages = getDocsPages()
  const key = slug.join('/')
  return pages.find((p) => p.slug.join('/') === key) ?? null
})

export const getDocBySourcePath = cache((absoluteOrRelativePath: string) => {
  const root = process.cwd()
  const abs = path.isAbsolute(absoluteOrRelativePath) ? absoluteOrRelativePath : path.resolve(root, absoluteOrRelativePath)
  const norm = path.normalize(abs).toLowerCase()
  const pages = getDocsPages()
  return pages.find((p) => path.normalize(p.absoluteSourcePath).toLowerCase() === norm) ?? null
})

export function getBreadcrumbForSlug(slug: string[]) {
  const page = getDocBySlug(slug)
  if (!page) return null
  const sectionTitle = DOCS_SECTIONS.find((s) => s.key === page.section)?.title ?? page.section
  return {
    section: { title: sectionTitle, href: `/docs/${page.section}` },
    page: { title: page.title, href: page.href },
  }
}


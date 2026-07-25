import fs from 'fs/promises'
import path from 'path'
import { marked } from 'marked'
import { cache } from 'react'
import { isAllowedDocsAssetPath } from './assets'
import { getDocBySourcePath } from './store'
import { encodePathSegments, slugifyHeading } from './slug'

export type DocsTocItem = {
  id: string
  title: string
  depth: number
}

function toAbsolutePathFromHref(currentFileAbsolutePath: string, href: string) {
  const cleaned = href.split('#')[0]?.split('?')[0] ?? href
  const decoded = decodeURI(cleaned)
  if (decoded.startsWith('/')) return path.resolve(process.cwd(), decoded.slice(1))
  return path.resolve(path.dirname(currentFileAbsolutePath), decoded)
}

function toDocsAssetHref(absolutePath: string) {
  const root = process.cwd()
  const rel = path.relative(root, absolutePath)
  const normalized = rel.split(path.sep).filter(Boolean)
  return `/docs/assets/${encodePathSegments(normalized)}`
}

export function isAllowedAssetPath(absolutePath: string) {
  return isAllowedDocsAssetPath(absolutePath)
}

function rewriteHref(currentFileAbsolutePath: string, href: string) {
  if (!href) return href
  if (href.startsWith('#')) return href
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(href)) return href
  if (href.startsWith('mailto:') || href.startsWith('tel:')) return href

  const [rawPath, rawHash] = href.split('#')
  const hash = rawHash ? `#${rawHash}` : ''
  const absolute = toAbsolutePathFromHref(currentFileAbsolutePath, rawPath || '')
  const targetDoc = rawPath?.toLowerCase().endsWith('.md') ? getDocBySourcePath(absolute) : null
  if (targetDoc) return `${targetDoc.href}${hash}`
  if (isAllowedAssetPath(absolute)) return `${toDocsAssetHref(absolute)}${hash}`
  return href
}

function looksLikeVideo(href: string) {
  const lower = href.toLowerCase()
  return lower.endsWith('.mp4') || lower.endsWith('.webm') || lower.endsWith('.mov')
}

function escapeHtml(input: string) {
  return input.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;')
}

export const readDocMarkdown = cache(async (absolutePath: string) => {
  const raw = await fs.readFile(absolutePath, 'utf8')
  return raw.replace(/^\uFEFF/, '')
})

export const renderDoc = cache(async (absolutePath: string) => {
  const markdown = await readDocMarkdown(absolutePath)
  const toc: DocsTocItem[] = []
  const renderer = new marked.Renderer()

  renderer.heading = (token: any) => {
    const depth = Number(token.depth ?? 1)
    const text = String(token.text ?? '')
    const id = slugifyHeading(text)
    if (depth >= 2 && depth <= 4) toc.push({ id, title: text, depth })
    return `<h${depth} id="${escapeHtml(id)}"><a class="docs-heading-anchor" href="#${escapeHtml(id)}">${token.text}</a></h${depth}>`
  }

  renderer.link = (token: any) => {
    const href = rewriteHref(absolutePath, String(token.href ?? ''))
    const title = token.title ? ` title="${escapeHtml(String(token.title))}"` : ''
    const rel = /^[a-z][a-z0-9+.-]*:\/\//i.test(href) ? ' rel="noreferrer noopener"' : ''
    const target = /^[a-z][a-z0-9+.-]*:\/\//i.test(href) ? ' target="_blank"' : ''
    return `<a href="${escapeHtml(href)}"${title}${rel}${target}>${token.text}</a>`
  }

  renderer.image = (token: any) => {
    const alt = escapeHtml(String(token.text ?? ''))
    const title = token.title ? ` title="${escapeHtml(String(token.title))}"` : ''
    const href = rewriteHref(absolutePath, String(token.href ?? ''))
    if (looksLikeVideo(href)) {
      return `<video class="docs-video" controls playsinline preload="metadata" src="${escapeHtml(href)}"></video>`
    }
    return `<img class="docs-img" src="${escapeHtml(href)}" alt="${alt}"${title} loading="lazy" />`
  }

  marked.use({ renderer, gfm: true, breaks: false })

  const html = marked.parse(markdown) as string
  const h1 = (marked.lexer(markdown) as any[]).find((t) => t?.type === 'heading' && Number(t?.depth ?? 1) === 1) ?? null
  const titleFromH1 = h1 && typeof h1.text === 'string' ? h1.text : null

  return { html, toc, titleFromH1 }
})

export const buildSearchIndex = cache(async () => {
  const pages = (await import('./store')).getDocsPages()
  const items: Array<{ title: string; href: string; section: string; content: string }> = []
  for (const p of pages) {
    const md = await readDocMarkdown(p.absoluteSourcePath)
    const tokens = marked.lexer(md) as any[]
    const parts: string[] = []
    for (const t of tokens) {
      if (t.type === 'heading') parts.push(String(t.text ?? ''))
      if (t.type === 'paragraph') parts.push(String(t.text ?? ''))
      if (t.type === 'list') {
        for (const it of t.items ?? []) parts.push(String(it.text ?? ''))
      }
    }
    const content = parts.join('\n').replace(/\s+/g, ' ').trim()
    items.push({ title: p.title, href: p.href, section: p.section, content })
  }
  return { items }
})

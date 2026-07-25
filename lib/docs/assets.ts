import path from 'path'

export const DOCS_ASSET_ALLOWED_ROOTS = ['docs', 'docs-web', 'Connekt Pay - Apresentação v1.0.0'] as const
export const DOCS_ASSET_ALLOWED_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.mp4', '.webm', '.mov', '.pdf', '.json', '.txt', '.html'] as const

export function isAllowedDocsAssetPath(absolutePath: string) {
  const root = process.cwd()
  const rel = path.relative(root, absolutePath)
  if (rel.startsWith('..') || path.isAbsolute(rel)) return false
  const first = rel.split(path.sep).filter(Boolean)[0]
  const ext = path.extname(absolutePath).toLowerCase()
  return !!first && DOCS_ASSET_ALLOWED_ROOTS.includes(first as (typeof DOCS_ASSET_ALLOWED_ROOTS)[number]) && (!!ext && DOCS_ASSET_ALLOWED_EXTS.includes(ext as (typeof DOCS_ASSET_ALLOWED_EXTS)[number]))
}

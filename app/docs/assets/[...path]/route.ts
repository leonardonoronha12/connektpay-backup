import fs from 'fs/promises'
import path from 'path'
import { DOCS_ASSET_ALLOWED_EXTS, DOCS_ASSET_ALLOWED_ROOTS } from '@/lib/docs/assets'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const ALLOWED_ROOTS = new Set<string>(DOCS_ASSET_ALLOWED_ROOTS)
const ALLOWED_EXTS = new Set<string>(DOCS_ASSET_ALLOWED_EXTS)

function contentTypeForExt(ext: string) {
  switch (ext) {
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.gif':
      return 'image/gif'
    case '.webp':
      return 'image/webp'
    case '.svg':
      return 'image/svg+xml'
    case '.mp4':
      return 'video/mp4'
    case '.webm':
      return 'video/webm'
    case '.mov':
      return 'video/quicktime'
    case '.pdf':
      return 'application/pdf'
    case '.json':
      return 'application/json; charset=utf-8'
    case '.txt':
      return 'text/plain; charset=utf-8'
    case '.html':
      return 'text/html; charset=utf-8'
    default:
      return 'application/octet-stream'
  }
}

export async function GET(_: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path: segs } = await ctx.params
  const decoded = (segs ?? []).map((s) => decodeURIComponent(s))
  const rel = decoded.join(path.sep)
  const root = process.cwd()
  const abs = path.resolve(root, rel)
  const relFromRoot = path.relative(root, abs)
  if (relFromRoot.startsWith('..') || path.isAbsolute(relFromRoot)) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const parts = relFromRoot.split(path.sep).filter(Boolean)
  const first = parts[0]
  if (!first || !ALLOWED_ROOTS.has(first)) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const ext = path.extname(abs).toLowerCase()
  if (!ALLOWED_EXTS.has(ext)) return NextResponse.json({ error: 'not_allowed' }, { status: 404 })

  try {
    const buf = await fs.readFile(abs)
    return new NextResponse(buf, {
      status: 200,
      headers: {
        'content-type': contentTypeForExt(ext),
        'cache-control': 'public, max-age=31536000, immutable',
      },
    })
  } catch {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
}

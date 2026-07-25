import { NextResponse } from 'next/server'
import { buildSearchIndex } from '@/lib/docs/markdown'

export const runtime = 'nodejs'

export async function GET() {
  const index = await buildSearchIndex()
  return NextResponse.json(index, { status: 200 })
}


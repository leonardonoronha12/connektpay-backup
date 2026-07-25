export const runtime = 'nodejs'

export async function GET(request: Request) {
  const assetUrl = new URL('/brand/logo-purple.png', request.url)
  const asset = await fetch(assetUrl)

  if (!asset.ok) {
    return new Response(null, { status: 404 })
  }

  const body = await asset.arrayBuffer()

  return new Response(body, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}

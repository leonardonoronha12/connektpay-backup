import { NextResponse, type NextRequest } from 'next/server'
import { canAccessPath, normalizeRole } from '@/lib/rbac'

function isPublicPath(pathname: string) {
  if (pathname.startsWith('/_next')) return true
  if (pathname.startsWith('/favicon')) return true
  if (pathname.startsWith('/fonts')) return true
  if (pathname.startsWith('/images')) return true
  if (pathname.startsWith('/docs')) return true
  if (pathname.startsWith('/api')) return true
  if (pathname === '/auth/callback') return true
  if (pathname === '/login') return true
  if (pathname === '/register') return true
  if (pathname === '/reset-password') return true
  if (pathname === '/checkout') return true
  return false
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (isPublicPath(pathname)) return NextResponse.next()

  const response = NextResponse.next()

  if (process.env.NODE_ENV === 'development') {
    const as = request.nextUrl.searchParams.get('as')
    if (as) response.cookies.set('cp_dev_role', as, { path: '/', sameSite: 'lax' })
  }

  const hasSupabaseCookies = request.cookies.getAll().some((c) => c.name.startsWith('sb-'))
  if (!hasSupabaseCookies) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('returnTo', pathname)
    return NextResponse.redirect(url)
  }

  const devRole = process.env.NODE_ENV === 'development' ? normalizeRole(request.cookies.get('cp_dev_role')?.value) : null
  const cookieRole = normalizeRole(request.cookies.get('cp_role')?.value)
  const role = devRole ?? cookieRole

  if (role && !canAccessPath(role, pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|map)$).*)'],
}

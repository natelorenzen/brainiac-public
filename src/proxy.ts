// NOTE: In Next.js 16 this file is proxy.ts, NOT middleware.ts
// Export is `proxy`, not `middleware`
//
// Auth is handled client-side via supabase.auth.getSession() in each protected page.
// Supabase v2 stores sessions in localStorage (not cookies), so cookie-based
// interception here is not reliable. Protected pages redirect to /auth/login
// themselves if no session is found.

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const AUTH_PAGES = ['/auth/login', '/auth/signup']

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Redirect logged-in users away from auth pages
  // (best-effort via cookie — may not always fire since session is in localStorage)
  const token =
    req.cookies.get('sb-access-token')?.value ||
    req.cookies.get(`sb-${process.env.NEXT_PUBLIC_SUPABASE_URL?.split('//')[1]?.split('.')[0]}-auth-token`)?.value

  if (AUTH_PAGES.some(p => pathname.startsWith(p)) && token) {
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api|public).*)'],
}

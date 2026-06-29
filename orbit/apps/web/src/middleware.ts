import { NextResponse, type NextRequest } from 'next/server';

const ACCESS_COOKIE = 'orbit_access';
const PUBLIC_PATHS = [
  '/login',
  '/forgot-password',
  '/reset-password',
  '/set-password',
];

/**
 * Lightweight gate: redirects unauthenticated users away from protected
 * routes. Fine-grained role checks happen server-side via /auth/me in the
 * (ro)/(admin) layouts — middleware only verifies a session cookie exists.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = req.cookies.has(ACCESS_COOKIE);
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (!hasSession && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (hasSession && pathname === '/login') {
    const url = req.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Run on everything except the API proxy, Next internals, and static assets.
  // `/api/*` is rewritten to NestJS and enforces its own auth — the page-level
  // session gate must not intercept (and redirect) those calls.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.).*)'],
};

import { NextResponse, type NextRequest } from 'next/server';

const SESSION_COOKIE = 'ap_session';

/**
 * Edge middleware does two cheap things:
 *  1. sends unauthenticated dashboard visitors to the sign-in screen (the real
 *     authorisation check still happens per request, server-side);
 *  2. adds a Content-Security-Policy that fits Next's inline hydration scripts.
 * Deliberately no X-Frame-Options / frame-ancestors: the product is embedded in
 * preview panes during development.
 */
export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname.startsWith('/dashboard') && !request.cookies.get(SESSION_COOKIE)?.value) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  const response = NextResponse.next();
  const isDev = process.env.NODE_ENV !== 'production';
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    'img-src \'self\' data: blob: https:',
    "font-src 'self' data:",
    `connect-src 'self'${isDev ? ' ws: wss:' : ''}`,
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
  ].join('; ');
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

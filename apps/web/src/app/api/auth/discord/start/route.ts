import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { config, discordOAuthConfigured } from '@/server/config';
import { buildAuthorizeUrl } from '@/server/auth/discord';
import { clientIp, enforceRateLimit } from '@/server/http/rate-limit';
import { safeNextPath } from '@/server/http/auth';

/** Step 1 of the OAuth2 authorization-code flow. */
export async function GET(request: Request) {
  if (!discordOAuthConfigured()) {
    return NextResponse.redirect(
      new URL('/login?error=discord_not_configured', config.appUrl),
    );
  }
  enforceRateLimit(`oauth:start:${clientIp(request)}`, 20, 60_000);

  const url = new URL(request.url);
  const next = safeNextPath(url.searchParams.get('next'));
  const state = randomBytes(24).toString('base64url');

  let authorizeUrl: string;
  try {
    authorizeUrl = buildAuthorizeUrl(state);
  } catch {
    return NextResponse.redirect(new URL('/login?error=discord_not_configured', config.appUrl));
  }

  const response = NextResponse.redirect(authorizeUrl);
  const secure = config.appUrl.startsWith('https://');
  response.cookies.set(config.session.stateCookieName, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: 600,
  });
  response.cookies.set(config.session.nextCookieName, next, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: 600,
  });
  return response;
}

import { config } from '../config';
import { ApiError } from './errors';

function hostOf(value: string): string | null {
  try {
    return new URL(value).host;
  } catch {
    return null;
  }
}

/**
 * CSRF defence for cookie-authenticated mutations.
 *
 * Session cookies are SameSite=Lax, which already blocks cross-site form posts,
 * but an explicit Origin check is cheap and catches misconfigured proxies. Requests
 * that authenticate with a bearer token (companion, bot) are exempt — they carry no
 * ambient cookie, so there is nothing to forge.
 */
export function assertSameOrigin(request: Request): void {
  const authorization = request.headers.get('authorization');
  if (authorization?.toLowerCase().startsWith('bearer ')) return;

  const origin = request.headers.get('origin');
  if (!origin) {
    // Non-browser clients (curl, integration tests) omit Origin.
    return;
  }
  const originHost = hostOf(origin);
  const allowedHosts = new Set<string>();
  const appHost = hostOf(config.appUrl);
  if (appHost) allowedHosts.add(appHost);
  const forwardedHost = request.headers.get('x-forwarded-host');
  if (forwardedHost) allowedHosts.add(forwardedHost);
  const host = request.headers.get('host');
  if (host) allowedHosts.add(host);

  if (!originHost || !allowedHosts.has(originHost)) {
    throw ApiError.forbidden('This request came from an unexpected origin.');
  }
}

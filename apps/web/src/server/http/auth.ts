import { config } from '../config';
import { ApiError } from './errors';
import { assertSameOrigin } from './origin';
import { requireApiUser, type SessionUser } from '../auth/session';
import { safeEqual } from '../security/crypto';

/** Cookie-authenticated, same-origin-checked session for dashboard mutations. */
export async function apiSession(request: Request): Promise<SessionUser> {
  assertSameOrigin(request);
  return requireApiUser();
}

export async function apiStaff(request: Request): Promise<SessionUser> {
  const user = await apiSession(request);
  if (!user.isStaff) throw ApiError.forbidden('Avenqio staff only.');
  return user;
}

export function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim();
}

/** Service-to-service authentication for the central Discord bot. */
export function requireBotService(request: Request): void {
  const token = bearerToken(request);
  if (!config.botServiceToken) {
    throw new ApiError(503, 'bot_not_configured', 'BOT_SERVICE_TOKEN is not configured on this deployment.');
  }
  if (!token || !safeEqual(token, config.botServiceToken)) {
    throw ApiError.unauthorized('Invalid service token.');
  }
}

export function requireCompanionToken(request: Request): string {
  const token = bearerToken(request);
  if (!token) throw ApiError.unauthorized('Missing device token.');
  return token;
}

/** Prevents open redirects through ?next=. */
export function safeNextPath(value: string | null | undefined, fallback = '/dashboard'): string {
  if (!value) return fallback;
  if (!value.startsWith('/') || value.startsWith('//')) return fallback;
  return value;
}

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { defaultDiscordAvatarUrl, discordAvatarUrl } from '@avenqio/shared';
import { config } from '../config';
import { getReadyDb } from '../db';
import type { DbDiscordAccount, DbSession, DbUser } from '../db/types';
import { ApiError } from '../http/errors';
import { hashIp, hashToken, randomToken } from '../security/crypto';

export type SessionUser = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  locale: string;
  isDev: boolean;
  isStaff: boolean;
  activeCommunityPresetId: string | null;
  discord: {
    id: string;
    username: string;
    globalName: string | null;
    avatarUrl: string | null;
  } | null;
  sessionId: string;
  sessionCreatedAt: Date;
};

type SessionRow = DbSession &
  Pick<DbUser, 'display_name' | 'avatar_url' | 'is_dev' | 'locale'> & {
    active_community_preset_id: string | null;
    discord_user_id: string | null;
    username: string | null;
    global_name: string | null;
    avatar_hash: string | null;
  } & Partial<DbDiscordAccount>;

function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: config.appUrl.startsWith('https://'),
    path: '/',
    maxAge: maxAgeSeconds,
  };
}

export async function establishSession(
  userId: string,
  meta: { userAgent?: string | null; ip?: string | null } = {},
): Promise<void> {
  const db = await getReadyDb();
  const token = randomToken(32);
  await db.query(
    `insert into sessions (user_id, token_hash, user_agent, ip_hash, expires_at)
     values ($1, $2, $3, $4, now() + make_interval(secs => $5))`,
    [userId, hashToken(token), meta.userAgent?.slice(0, 400) ?? null, hashIp(meta.ip), config.session.ttlSeconds],
  );
  await db.query('update users set last_seen_at = now() where id = $1', [userId]);
  const store = await cookies();
  store.set(config.session.cookieName, token, cookieOptions(config.session.ttlSeconds));
}

const LAST_USED_THROTTLE_MS = 5 * 60 * 1000;

export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(config.session.cookieName)?.value;
  if (!token) return null;

  const db = await getReadyDb();
  const rows = await db.query<SessionRow>(
    `select s.*, u.display_name, u.avatar_url, u.is_dev, u.locale, u.active_community_preset_id,
            d.discord_user_id, d.username, d.global_name, d.avatar_hash
       from sessions s
       join users u on u.id = s.user_id
       left join discord_accounts d on d.user_id = u.id
      where s.token_hash = $1 and s.revoked_at is null and s.expires_at > now()
      limit 1`,
    [hashToken(token)],
  );
  const row = rows[0];
  if (!row) return null;

  const lastUsed = row.last_used_at ? new Date(row.last_used_at).getTime() : 0;
  if (Date.now() - lastUsed > LAST_USED_THROTTLE_MS) {
    db.query('update sessions set last_used_at = now() where id = $1', [row.id]).catch(() => {});
  }

  const discord = row.discord_user_id
    ? {
        id: row.discord_user_id,
        username: row.username ?? 'unknown',
        globalName: row.global_name ?? null,
        avatarUrl:
          discordAvatarUrl(row.discord_user_id, row.avatar_hash) ??
          defaultDiscordAvatarUrl(row.discord_user_id),
      }
    : null;

  return {
    id: row.user_id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url ?? discord?.avatarUrl ?? null,
    locale: row.locale,
    isDev: row.is_dev,
    isStaff: config.adminDiscordIds.includes(row.discord_user_id ?? ''),
    activeCommunityPresetId: row.active_community_preset_id,
    discord,
    sessionId: row.id,
    sessionCreatedAt: new Date(row.created_at),
  };
}

/** For pages: unauthenticated visitors are redirected to the sign-in screen. */
export async function requirePageUser(nextPath = '/dashboard'): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  return user;
}

/** For API routes and server actions. */
export async function requireApiUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw ApiError.unauthorized();
  return user;
}

export async function revokeCurrentSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(config.session.cookieName)?.value;
  if (token) {
    const db = await getReadyDb();
    await db.query('update sessions set revoked_at = now() where token_hash = $1', [hashToken(token)]);
  }
  store.delete(config.session.cookieName);
}

export async function revokeSessionById(userId: string, sessionId: string): Promise<boolean> {
  const db = await getReadyDb();
  const rows = await db.query<{ id: string }>(
    `update sessions set revoked_at = now()
      where id = $1 and user_id = $2 and revoked_at is null
      returning id`,
    [sessionId, userId],
  );
  return rows.length > 0;
}

export async function revokeAllSessions(userId: string, exceptSessionId?: string): Promise<number> {
  const db = await getReadyDb();
  const rows = await db.query<{ id: string }>(
    `update sessions set revoked_at = now()
      where user_id = $1 and revoked_at is null and ($2::uuid is null or id <> $2::uuid)
      returning id`,
    [userId, exceptSessionId ?? null],
  );
  return rows.length;
}

/** Rate limiting helper key shared by auth endpoints. */
export function authThrottleKey(scope: string, ip: string): string {
  return `auth:${scope}:${ip}`;
}

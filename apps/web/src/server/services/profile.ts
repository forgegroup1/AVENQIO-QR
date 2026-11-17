import { getReadyDb } from '../db';
import type { DbUser } from '../db/types';
import { ApiError } from '../http/errors';
import { logActivity } from './activity';

export type ProfilePreferences = {
  notifications: {
    companionOffline: boolean;
    communityUpdates: boolean;
    productNews: boolean;
  };
  editor: {
    showWarnings: boolean;
    confirmDelete: boolean;
  };
};

export const DEFAULT_PREFERENCES: ProfilePreferences = {
  notifications: { companionOffline: true, communityUpdates: true, productNews: false },
  editor: { showWarnings: true, confirmDelete: true },
};

export function normalizePreferences(raw: unknown): ProfilePreferences {
  const input = (raw ?? {}) as Partial<ProfilePreferences>;
  return {
    notifications: {
      companionOffline: input.notifications?.companionOffline ?? DEFAULT_PREFERENCES.notifications.companionOffline,
      communityUpdates:
        input.notifications?.communityUpdates ?? DEFAULT_PREFERENCES.notifications.communityUpdates,
      productNews: input.notifications?.productNews ?? DEFAULT_PREFERENCES.notifications.productNews,
    },
    editor: {
      showWarnings: input.editor?.showWarnings ?? DEFAULT_PREFERENCES.editor.showWarnings,
      confirmDelete: input.editor?.confirmDelete ?? DEFAULT_PREFERENCES.editor.confirmDelete,
    },
  };
}

export type ProfileDto = {
  id: string;
  displayName: string;
  email: string | null;
  locale: 'en' | 'it';
  preferences: ProfilePreferences;
  createdAt: string;
  discord: {
    id: string;
    username: string;
    globalName: string | null;
  } | null;
};

export async function getProfile(userId: string): Promise<ProfileDto> {
  const db = await getReadyDb();
  const rows = await db.query<
    DbUser & { discord_user_id: string | null; username: string | null; global_name: string | null }
  >(
    `select u.*, d.discord_user_id, d.username, d.global_name
       from users u left join discord_accounts d on d.user_id = u.id
      where u.id = $1`,
    [userId],
  );
  const row = rows[0];
  if (!row) throw ApiError.notFound('Account not found.');
  return {
    id: row.id,
    displayName: row.display_name,
    email: row.email,
    locale: row.locale === 'it' ? 'it' : 'en',
    preferences: normalizePreferences(row.preferences),
    createdAt: new Date(row.created_at).toISOString(),
    discord: row.discord_user_id
      ? { id: row.discord_user_id, username: row.username ?? 'unknown', globalName: row.global_name }
      : null,
  };
}

export async function updateProfile(
  userId: string,
  input: { displayName?: string; locale?: 'en' | 'it'; preferences?: unknown },
): Promise<ProfileDto> {
  const db = await getReadyDb();
  if (input.displayName !== undefined) {
    const name = input.displayName.trim();
    if (name.length < 1 || name.length > 64) {
      throw ApiError.badRequest('Display name must be 1–64 characters.', { displayName: '1–64 characters' });
    }
    await db.query('update users set display_name = $2 where id = $1', [userId, name]);
  }
  if (input.locale !== undefined) {
    if (!['en', 'it'].includes(input.locale)) throw ApiError.badRequest('Unsupported language.');
    await db.query('update users set locale = $2 where id = $1', [userId, input.locale]);
  }
  if (input.preferences !== undefined) {
    const preferences = normalizePreferences(input.preferences);
    await db.query('update users set preferences = $2 where id = $1', [userId, JSON.stringify(preferences)]);
  }
  await logActivity({ userId, action: 'account.profile_updated', message: 'Updated account settings' });
  return getProfile(userId);
}

export type SessionDto = {
  id: string;
  userAgent: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  current: boolean;
};

export async function listSessions(userId: string, currentSessionId: string): Promise<SessionDto[]> {
  const db = await getReadyDb();
  const rows = await db.query<{
    id: string;
    user_agent: string | null;
    created_at: Date | string;
    last_used_at: Date | string | null;
  }>(
    `select id, user_agent, created_at, last_used_at
       from sessions
      where user_id = $1 and revoked_at is null and expires_at > now()
      order by coalesce(last_used_at, created_at) desc`,
    [userId],
  );
  return rows.map((row) => ({
    id: row.id,
    userAgent: row.user_agent,
    createdAt: new Date(row.created_at).toISOString(),
    lastUsedAt: row.last_used_at ? new Date(row.last_used_at).toISOString() : null,
    current: row.id === currentSessionId,
  }));
}

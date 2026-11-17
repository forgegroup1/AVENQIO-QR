import type { ActivityLogDto } from '@avenqio/shared';
import { getReadyDb, type Queryable } from '../db';
import type { DbActivityLog } from '../db/types';

export type ActivityInput = {
  userId?: string | null;
  serverId?: string | null;
  actorType?: 'user' | 'bot' | 'companion' | 'system';
  action: string;
  message: string;
  metadata?: Record<string, unknown> | null;
  ipHash?: string | null;
};

/**
 * Append-only audit trail. Failures never break the request that triggered them:
 * losing an audit row must not lose a user's save.
 *
 * Pass `client` when called from inside a transaction — an embedded PGlite
 * database has a single connection, so querying outside the open transaction
 * while still inside its callback would wait on itself forever.
 */
export async function logActivity(input: ActivityInput, client?: Queryable): Promise<void> {
  try {
    const db = client ?? (await getReadyDb());
    await db.query(
      `insert into activity_logs (user_id, server_id, actor_type, action, message, metadata, ip_hash)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [
        input.userId ?? null,
        input.serverId ?? null,
        input.actorType ?? 'user',
        input.action,
        input.message.slice(0, 300),
        input.metadata ? JSON.stringify(input.metadata) : null,
        input.ipHash ?? null,
      ],
    );
  } catch (error) {
    console.error('[activity] failed to write log', error);
  }
}

function toDto(row: DbActivityLog): ActivityLogDto {
  return {
    id: row.id,
    action: row.action,
    actorType: row.actor_type,
    message: row.message,
    metadata: row.metadata,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export async function recentUserActivity(userId: string, limit = 8): Promise<ActivityLogDto[]> {
  const db = await getReadyDb();
  const rows = await db.query<DbActivityLog>(
    `select * from activity_logs where user_id = $1 order by created_at desc limit $2`,
    [userId, limit],
  );
  return rows.map(toDto);
}

export async function communityActivity(serverId: string, limit = 20): Promise<ActivityLogDto[]> {
  const db = await getReadyDb();
  const rows = await db.query<DbActivityLog>(
    `select * from activity_logs where server_id = $1 order by created_at desc limit $2`,
    [serverId, limit],
  );
  return rows.map(toDto);
}

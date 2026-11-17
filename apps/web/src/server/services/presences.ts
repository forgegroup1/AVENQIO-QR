import {
  summarizePresence,
  validatePresence,
  type PresencePayload,
  type PresenceValidation,
} from '@avenqio/shared';
import { getReadyDb } from '../db';
import type { DbPresence } from '../db/types';
import { ApiError } from '../http/errors';
import { logActivity } from './activity';

export type PresenceDto = {
  id: string;
  name: string;
  payload: PresencePayload;
  isActive: boolean;
  source: DbPresence['source'];
  serverId: string | null;
  serverName: string | null;
  createdAt: string;
  updatedAt: string;
};

type PresenceRow = DbPresence & { server_name: string | null };

function toDto(row: PresenceRow): PresenceDto {
  return {
    id: row.id,
    name: row.name,
    payload: row.payload,
    isActive: row.is_active,
    source: row.source,
    serverId: row.server_id,
    serverName: row.server_name,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

const SELECT_PRESENCE = `
  select p.*, s.name as server_name
    from presences p
    left join discord_servers s on s.id = p.server_id`;

/** Validates a payload or throws a 400 carrying field-level messages. */
export function ensureValidPayload(payload: unknown): { payload: PresencePayload; warnings: PresenceValidation['warnings'] } {
  const result = validatePresence(payload);
  if (!result.ok || !result.payload) {
    const fields: Record<string, string> = {};
    for (const issue of result.errors) {
      fields[issue.path ? `payload.${issue.path}` : 'payload'] ??= issue.message;
    }
    throw ApiError.badRequest('The presence contains invalid values.', fields);
  }
  return { payload: result.payload, warnings: result.warnings };
}

function ensureName(name: unknown): string {
  const value = typeof name === 'string' ? name.trim() : '';
  if (value.length < 1 || value.length > 80) {
    throw ApiError.badRequest('Give the presence a name (1–80 characters).', { name: '1–80 characters' });
  }
  return value;
}

export async function listPresences(userId: string): Promise<PresenceDto[]> {
  const db = await getReadyDb();
  const rows = await db.query<PresenceRow>(
    `${SELECT_PRESENCE} where p.user_id = $1 order by p.is_active desc, p.updated_at desc`,
    [userId],
  );
  return rows.map(toDto);
}

/** Ownership is part of the query: another user's id simply does not exist here. */
export async function getPresence(userId: string, presenceId: string): Promise<PresenceDto> {
  const db = await getReadyDb();
  const rows = await db.query<PresenceRow>(
    `${SELECT_PRESENCE} where p.id = $1 and p.user_id = $2`,
    [presenceId, userId],
  );
  const row = rows[0];
  if (!row) throw ApiError.notFound('Presence not found.');
  return toDto(row);
}

export type CreatePresenceInput = {
  name: string;
  payload: unknown;
  source?: DbPresence['source'];
  serverId?: string | null;
  integrationId?: string | null;
  activate?: boolean;
};

export async function createPresence(userId: string, input: CreatePresenceInput): Promise<PresenceDto> {
  const name = ensureName(input.name);
  const { payload } = ensureValidPayload(input.payload);
  const db = await getReadyDb();

  if (input.serverId) {
    const membership = await db.query(
      'select 1 from server_memberships where user_id = $1 and server_id = $2',
      [userId, input.serverId],
    );
    if (!membership.length) throw ApiError.forbidden('You are not a member of that community.');
  }

  const rows = await db.query<DbPresence>(
    `insert into presences (user_id, server_id, name, payload, source, integration_id)
     values ($1, $2, $3, $4, $5, $6) returning *`,
    [
      userId,
      input.serverId ?? null,
      name,
      JSON.stringify(payload),
      input.source ?? 'manual',
      input.integrationId ?? null,
    ],
  );
  const created = rows[0]!;

  await logActivity({
    userId,
    serverId: input.serverId ?? null,
    action: 'presence.created',
    message: `Created presence “${name}”`,
    metadata: { presenceId: created.id, summary: summarizePresence(payload) },
  });

  if (input.activate) {
    await setActivePresence(userId, created.id, true);
  }
  return getPresence(userId, created.id);
}

export async function updatePresence(
  userId: string,
  presenceId: string,
  input: { name?: string; payload?: unknown; serverId?: string | null },
): Promise<PresenceDto> {
  const existing = await getPresence(userId, presenceId);
  const name = input.name === undefined ? existing.name : ensureName(input.name);
  const payload = input.payload === undefined ? existing.payload : ensureValidPayload(input.payload).payload;
  const serverId = input.serverId === undefined ? existing.serverId : input.serverId;

  if (serverId && serverId !== existing.serverId) {
    const db = await getReadyDb();
    const membership = await db.query(
      'select 1 from server_memberships where user_id = $1 and server_id = $2',
      [userId, serverId],
    );
    if (!membership.length) throw ApiError.forbidden('You are not a member of that community.');
  }

  const db = await getReadyDb();
  await db.query(
    `update presences set name = $3, payload = $4, server_id = $5
      where id = $1 and user_id = $2`,
    [presenceId, userId, name || existing.name, JSON.stringify(payload), serverId],
  );
  await logActivity({
    userId,
    serverId,
    action: 'presence.updated',
    message: `Updated presence “${name}”`,
    metadata: { presenceId },
  });
  return getPresence(userId, presenceId);
}

export async function deletePresence(userId: string, presenceId: string): Promise<void> {
  const presence = await getPresence(userId, presenceId);
  const db = await getReadyDb();
  await db.query('delete from presences where id = $1 and user_id = $2', [presenceId, userId]);
  await logActivity({
    userId,
    action: 'presence.deleted',
    message: `Deleted presence “${presence.name}”`,
    metadata: { presenceId },
  });
}

export async function duplicatePresence(userId: string, presenceId: string): Promise<PresenceDto> {
  const presence = await getPresence(userId, presenceId);
  const db = await getReadyDb();
  const rows = await db.query<DbPresence>(
    `insert into presences (user_id, server_id, name, payload, source, integration_id)
     values ($1, $2, $3, $4, $5, $6) returning *`,
    [
      userId,
      presence.serverId,
      `${presence.name} (copy)`.slice(0, 80),
      JSON.stringify(presence.payload),
      presence.source,
    ],
  );
  await logActivity({
    userId,
    action: 'presence.duplicated',
    message: `Duplicated presence “${presence.name}”`,
    metadata: { presenceId, copyId: rows[0]!.id },
  });
  return getPresence(userId, rows[0]!.id);
}

/**
 * Activates exactly one presence for the user (or none). Activating a personal
 * presence clears any community preset selection and vice versa — a user has a
 * single Discord presence, so the product models it as a single pointer.
 */
export async function setActivePresence(
  userId: string,
  presenceId: string | null,
  active: boolean,
): Promise<PresenceDto | null> {
  const db = await getReadyDb();
  if (presenceId) await getPresence(userId, presenceId);

  const changed = await db.transaction(async (tx) => {
    await tx.query('update presences set is_active = false where user_id = $1 and is_active = true', [userId]);
    await tx.query('update users set active_community_preset_id = null where id = $1', [userId]);
    if (!presenceId) return { id: null as string | null };
    if (!active) {
      await logActivity(
        { userId, action: 'presence.deactivated', message: 'Deactivated active presence', metadata: { presenceId } },
        tx,
      );
      return { id: presenceId };
    }
    const rows = await tx.query<DbPresence>(
      'update presences set is_active = true where id = $1 and user_id = $2 returning *',
      [presenceId, userId],
    );
    const row = rows[0];
    if (!row) throw ApiError.notFound('Presence not found.');
    await logActivity(
      {
        userId,
        action: 'presence.activated',
        message: `Activated presence “${row.name}”`,
        metadata: { presenceId },
      },
      tx,
    );
    return { id: presenceId };
  });

  return changed.id ? getPresence(userId, changed.id) : null;
}

export type ActivePresenceResolution = {
  kind: 'presence' | 'community_preset' | 'none';
  payload: PresencePayload | null;
  presenceId: string | null;
  presetId: string | null;
  label: string | null;
  updatedAt: string | null;
};

/** Single source of truth for "what should the companion display right now". */
export async function resolveActivePresence(userId: string): Promise<ActivePresenceResolution> {
  const db = await getReadyDb();
  const presenceRows = await db.query<DbPresence>(
    'select * from presences where user_id = $1 and is_active = true limit 1',
    [userId],
  );
  const presence = presenceRows[0];
  if (presence) {
    return {
      kind: 'presence',
      payload: presence.payload,
      presenceId: presence.id,
      presetId: null,
      label: presence.name,
      updatedAt: new Date(presence.updated_at).toISOString(),
    };
  }

  const userRows = await db.query<{ active_community_preset_id: string | null }>(
    'select active_community_preset_id from users where id = $1',
    [userId],
  );
  const presetId = userRows[0]?.active_community_preset_id ?? null;
  if (!presetId) {
    return { kind: 'none', payload: null, presenceId: null, presetId: null, label: null, updatedAt: null };
  }
  const presetRows = await db.query<{ id: string; name: string; payload: PresencePayload; status: string; updated_at: Date | string; server_id: string }>(
    'select id, name, payload, status, updated_at, server_id from community_presets where id = $1',
    [presetId],
  );
  const preset = presetRows[0];
  // The preset may have been archived or deleted since activation.
  if (!preset || preset.status !== 'published') {
    return { kind: 'none', payload: null, presenceId: null, presetId: null, label: null, updatedAt: null };
  }
  return {
    kind: 'community_preset',
    payload: preset.payload,
    presenceId: null,
    presetId: preset.id,
    label: preset.name,
    updatedAt: new Date(preset.updated_at).toISOString(),
  };
}

/** Community presets are resolved live, so central edits propagate immediately. */
export async function deactivateByCommunityPreset(userId: string): Promise<void> {
  const db = await getReadyDb();
  await db.query('update presences set is_active = false where user_id = $1', [userId]);
  await db.query('update users set active_community_preset_id = null where id = $1', [userId]);
}

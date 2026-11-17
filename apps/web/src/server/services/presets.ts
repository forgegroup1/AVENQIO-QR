import {
  roleAtLeast,
  summarizePresence,
  validatePresence,
  type PresencePayload,
  type ServerRole,
} from '@avenqio/shared';
import { getReadyDb } from '../db';
import type { DbPreset } from '../db/types';
import { ApiError } from '../http/errors';
import { logActivity } from './activity';
import { assertCommunityRole, getCommunityContext } from './communities';
import { deactivateByCommunityPreset } from './presences';

export type PresetDto = {
  id: string;
  serverId: string;
  serverName: string;
  name: string;
  description: string | null;
  payload: PresencePayload;
  status: DbPreset['status'];
  minRole: ServerRole;
  verifiedCommunity: boolean;
  createdBy: string | null;
  publishedAt: string | null;
  updatedAt: string;
  canUse: boolean;
};

/**
 * Access rule, expressed once and unit-tested:
 *   1. only published presets are usable;
 *   2. an explicit per-member revoke always wins;
 *   3. an explicit per-member grant overrides the role requirement;
 *   4. otherwise the member's community role must reach the preset's minimum.
 */
export function computePresetAccess(
  role: ServerRole | null,
  preset: { status: DbPreset['status']; minRole: ServerRole; grant?: boolean | null },
): boolean {
  if (!role) return false;
  if (preset.status !== 'published') return false;
  if (preset.grant === false) return false;
  if (preset.grant === true) return true;
  return roleAtLeast(role, preset.minRole);
}

type PresetRow = DbPreset & {
  server_name: string;
  verification_status: string;
  role: ServerRole | null;
  grant: boolean | null;
};

const PRESET_SELECT = `
  select p.*, s.name as server_name, s.verification_status, m.role, g.can_use as grant
    from community_presets p
    join discord_servers s on s.id = p.server_id
    left join server_memberships m on m.server_id = p.server_id and m.user_id = $1
    left join community_preset_grants g on g.preset_id = p.id and g.user_id = $1
`;

function toDto(row: PresetRow): PresetDto {
  return {
    id: row.id,
    serverId: row.server_id,
    serverName: row.server_name,
    name: row.name,
    description: row.description,
    payload: row.payload,
    status: row.status,
    minRole: row.min_role,
    verifiedCommunity: row.verification_status === 'verified',
    createdBy: row.created_by,
    publishedAt: row.published_at ? new Date(row.published_at).toISOString() : null,
    updatedAt: new Date(row.updated_at).toISOString(),
    canUse: computePresetAccess(row.role, { status: row.status, minRole: row.min_role, grant: row.grant }),
  };
}

function ensurePresetName(name: unknown): string {
  const value = typeof name === 'string' ? name.trim() : '';
  if (value.length < 1 || value.length > 80) {
    throw ApiError.badRequest('Give the preset a name (1–80 characters).', { name: '1–80 characters' });
  }
  return value;
}

function ensurePayload(payload: unknown): PresencePayload {
  const result = validatePresence(payload);
  if (!result.ok || !result.payload) {
    const fields: Record<string, string> = {};
    for (const issue of result.errors) fields[`payload.${issue.path}`] ??= issue.message;
    throw ApiError.badRequest('The preset contains invalid values.', fields);
  }
  return result.payload;
}

export async function listCommunityPresets(userId: string, serverId: string): Promise<PresetDto[]> {
  const context = await getCommunityContext(userId, serverId);
  const manager = roleAtLeast(context.role, 'preset_manager');
  const db = await getReadyDb();
  const rows = await db.query<PresetRow>(
    `${PRESET_SELECT} where p.server_id = $2 order by p.status = 'published' desc, p.updated_at desc`,
    [userId, serverId],
  );
  return rows
    .map(toDto)
    .filter((preset) => (manager ? true : preset.status === 'published' && preset.canUse));
}

/** Every preset this user may activate, across all communities. */
export async function listUsablePresets(userId: string): Promise<PresetDto[]> {
  const db = await getReadyDb();
  const rows = await db.query<PresetRow>(
    `${PRESET_SELECT} where p.status = 'published' and m.user_id is not null order by s.name asc, p.name asc`,
    [userId],
  );
  return rows.map(toDto).filter((preset) => preset.canUse);
}

export async function createPreset(
  userId: string,
  serverId: string,
  input: { name: string; description?: string | null; payload: unknown; minRole?: ServerRole; publish?: boolean },
): Promise<PresetDto> {
  await assertCommunityRole(userId, serverId, 'preset_manager');
  const name = ensurePresetName(input.name);
  const payload = ensurePayload(input.payload);
  const minRole: ServerRole = input.minRole ?? 'member';
  const status: DbPreset['status'] = input.publish ? 'published' : 'draft';

  const db = await getReadyDb();
  const rows = await db.query<DbPreset>(
    `insert into community_presets (server_id, name, description, payload, status, min_role, created_by, published_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8) returning *`,
    [
      serverId,
      name,
      input.description?.slice(0, 280) ?? null,
      JSON.stringify(payload),
      status,
      minRole,
      userId,
      status === 'published' ? new Date() : null,
    ],
  );
  await logActivity({
    userId,
    serverId,
    action: status === 'published' ? 'preset.published' : 'preset.created',
    message: `${status === 'published' ? 'Published' : 'Created'} preset “${name}”`,
    metadata: { presetId: rows[0]!.id, summary: summarizePresence(payload) },
  });
  return getPreset(userId, serverId, rows[0]!.id);
}

export async function getPreset(userId: string, serverId: string, presetId: string): Promise<PresetDto> {
  const db = await getReadyDb();
  const rows = await db.query<PresetRow>(`${PRESET_SELECT} where p.id = $2 and p.server_id = $3`, [
    userId,
    presetId,
    serverId,
  ]);
  const row = rows[0];
  if (!row) throw ApiError.notFound('Preset not found.');
  return toDto(row);
}

export async function updatePreset(
  userId: string,
  serverId: string,
  presetId: string,
  input: { name?: string; description?: string | null; payload?: unknown; minRole?: ServerRole },
): Promise<PresetDto> {
  await assertCommunityRole(userId, serverId, 'preset_manager');
  const existing = await getPreset(userId, serverId, presetId);
  const name = input.name === undefined ? existing.name : ensurePresetName(input.name);
  const payload = input.payload === undefined ? existing.payload : ensurePayload(input.payload);
  const minRole = input.minRole ?? existing.minRole;
  const description = input.description === undefined ? existing.description : input.description;

  const db = await getReadyDb();
  await db.query(
    `update community_presets set name = $4, description = $5, payload = $6, min_role = $7
      where id = $1 and server_id = $2 returning id`,
    [presetId, serverId, name, description, JSON.stringify(payload), minRole],
  );
  await logActivity({
    userId,
    serverId,
    action: 'preset.updated',
    message: `Updated preset “${name}”`,
    metadata: { presetId },
  });
  return getPreset(userId, serverId, presetId);
}

export async function setPresetStatus(
  userId: string,
  serverId: string,
  presetId: string,
  status: DbPreset['status'],
): Promise<PresetDto> {
  await assertCommunityRole(userId, serverId, 'preset_manager');
  await getPreset(userId, serverId, presetId);
  const db = await getReadyDb();
  await db.query(
    `update community_presets
        set status = $3, published_at = case when $3 = 'published' then coalesce(published_at, now()) else published_at end
      where id = $1 and server_id = $2`,
    [presetId, serverId, status],
  );
  await logActivity({
    userId,
    serverId,
    action: `preset.${status}`,
    message: `Preset moved to ${status}`,
    metadata: { presetId },
  });
  return getPreset(userId, serverId, presetId);
}

export async function deletePreset(userId: string, serverId: string, presetId: string): Promise<void> {
  await assertCommunityRole(userId, serverId, 'preset_manager');
  const preset = await getPreset(userId, serverId, presetId);
  const db = await getReadyDb();
  await db.query('update users set active_community_preset_id = null where active_community_preset_id = $1', [
    presetId,
  ]);
  await db.query('delete from community_presets where id = $1 and server_id = $2', [presetId, serverId]);
  await logActivity({
    userId,
    serverId,
    action: 'preset.deleted',
    message: `Deleted preset “${preset.name}”`,
    metadata: { presetId },
  });
}

export type PresetGrantDto = {
  userId: string;
  displayName: string;
  canUse: boolean;
};

export async function listPresetGrants(
  userId: string,
  serverId: string,
  presetId: string,
): Promise<PresetGrantDto[]> {
  await assertCommunityRole(userId, serverId, 'preset_manager');
  const db = await getReadyDb();
  const rows = await db.query<{ user_id: string; display_name: string; can_use: boolean }>(
    `select g.user_id, u.display_name, g.can_use
       from community_preset_grants g
       join users u on u.id = g.user_id
      where g.preset_id = $1
      order by u.display_name`,
    [presetId],
  );
  return rows.map((row) => ({ userId: row.user_id, displayName: row.display_name, canUse: row.can_use }));
}

/** Per-member overrides on top of the minimum role. */
export async function setPresetAccess(
  userId: string,
  serverId: string,
  presetId: string,
  input: { minRole?: ServerRole; grants?: Array<{ userId: string; canUse: boolean | null }> },
): Promise<PresetDto> {
  await assertCommunityRole(userId, serverId, 'preset_manager');
  await getPreset(userId, serverId, presetId);
  const db = await getReadyDb();

  if (input.minRole) {
    await db.query('update community_presets set min_role = $3 where id = $1 and server_id = $2', [
      presetId,
      serverId,
      input.minRole,
    ]);
  }
  for (const grant of input.grants ?? []) {
    const membership = await db.query(
      'select 1 from server_memberships where user_id = $1 and server_id = $2',
      [grant.userId, serverId],
    );
    if (!membership.length) throw ApiError.badRequest('That member does not belong to this community.');
    if (grant.canUse === null) {
      await db.query('delete from community_preset_grants where preset_id = $1 and user_id = $2', [
        presetId,
        grant.userId,
      ]);
    } else {
      await db.query(
        `insert into community_preset_grants (preset_id, user_id, can_use)
         values ($1, $2, $3)
         on conflict (preset_id, user_id) do update set can_use = $3`,
        [presetId, grant.userId, grant.canUse],
      );
    }
  }
  await logActivity({
    userId,
    serverId,
    action: 'preset.access_updated',
    message: 'Updated preset access rules',
    metadata: { presetId, minRole: input.minRole ?? null },
  });
  return getPreset(userId, serverId, presetId);
}

/** Activates a community preset as the user's presence (payload resolved live). */
export async function activatePreset(userId: string, presetId: string): Promise<PresetDto> {
  const db = await getReadyDb();
  const rows = await db.query<PresetRow>(`${PRESET_SELECT} where p.id = $2`, [userId, presetId]);
  const row = rows[0];
  if (!row) throw ApiError.notFound('Preset not found.');
  const preset = toDto(row);
  if (!preset.canUse) throw ApiError.forbidden('This preset is not available to you.');

  await deactivateByCommunityPreset(userId);
  await db.query('update users set active_community_preset_id = $2 where id = $1', [userId, presetId]);
  await logActivity({
    userId,
    serverId: preset.serverId,
    action: 'preset.activated',
    message: `Activated community preset “${preset.name}”`,
    metadata: { presetId },
  });
  return getPreset(userId, preset.serverId, presetId);
}

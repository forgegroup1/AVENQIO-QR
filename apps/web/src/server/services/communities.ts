import { discordGuildIconUrl, roleAtLeast, SERVER_ROLE_LABELS, type ServerRole } from '@avenqio/shared';
import { config } from '../config';
import { getReadyDb } from '../db';
import type { DbMembership, DbServer, DbUser } from '../db/types';
import { ApiError } from '../http/errors';
import { logActivity } from './activity';

export type CommunitySummary = {
  id: string;
  discordGuildId: string;
  name: string;
  iconUrl: string | null;
  role: ServerRole;
  memberCount: number | null;
  botPresent: boolean;
  verificationStatus: DbServer['verification_status'];
  presetCount: number;
  publishedPresetCount: number;
  updatedAt: string;
};

export type CommunityMember = {
  membershipId: string;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  role: ServerRole;
  roleLabel: string;
  createdAt: string;
};

const toIso = (value: Date | string | null): string | null => (value ? new Date(value).toISOString() : null);

export async function listCommunities(userId: string): Promise<CommunitySummary[]> {
  const db = await getReadyDb();
  const rows = await db.query<
    DbServer & {
      role: ServerRole;
      preset_count: number;
      published_preset_count: number;
    }
  >(
    `select s.*, m.role,
            (select count(*)::int from community_presets p where p.server_id = s.id) as preset_count,
            (select count(*)::int from community_presets p where p.server_id = s.id and p.status = 'published') as published_preset_count
       from discord_servers s
       join server_memberships m on m.server_id = s.id
      where m.user_id = $1
      order by s.name asc`,
    [userId],
  );
  return rows.map((row) => ({
    id: row.id,
    discordGuildId: row.discord_guild_id,
    name: row.name,
    iconUrl: discordGuildIconUrl(row.discord_guild_id, row.icon_hash),
    role: row.role,
    memberCount: row.member_count,
    botPresent: row.bot_present,
    verificationStatus: row.verification_status,
    presetCount: row.preset_count,
    publishedPresetCount: row.published_preset_count,
    updatedAt: new Date(row.updated_at).toISOString(),
  }));
}

export type CommunityContext = {
  server: DbServer;
  membership: DbMembership;
  role: ServerRole;
  iconUrl: string | null;
};

/**
 * Loads a community *through* the caller's membership. Callers without access get
 * a 404 (not a 403) so community ids cannot be probed.
 */
export async function getCommunityContext(userId: string, serverId: string): Promise<CommunityContext> {
  const db = await getReadyDb();
  const rows = await db.query<DbServer & { membership_id: string; role: ServerRole; discord_permissions: string | null }>(
    `select s.*, m.id as membership_id, m.role, m.discord_permissions
       from discord_servers s
       join server_memberships m on m.server_id = s.id
      where s.id = $1 and m.user_id = $2`,
    [serverId, userId],
  );
  const row = rows[0];
  if (!row) throw ApiError.notFound('Community not found.');
  return {
    server: row,
    membership: {
      id: row.membership_id,
      user_id: userId,
      server_id: row.id,
      role: row.role,
      discord_permissions: row.discord_permissions,
      created_at: row.created_at,
      updated_at: row.updated_at,
    },
    role: row.role,
    iconUrl: discordGuildIconUrl(row.discord_guild_id, row.icon_hash),
  };
}

export async function assertCommunityRole(userId: string, serverId: string, minimum: ServerRole) {
  const context = await getCommunityContext(userId, serverId);
  if (!roleAtLeast(context.role, minimum)) {
    throw ApiError.forbidden(`This action requires the ${SERVER_ROLE_LABELS[minimum]} role in this community.`);
  }
  return context;
}

export async function updateCommunitySettings(
  userId: string,
  serverId: string,
  input: { settings?: Record<string, unknown> },
): Promise<void> {
  await assertCommunityRole(userId, serverId, 'admin');
  const db = await getReadyDb();
  const allowed: Record<string, unknown> = {};
  if (input.settings) {
    const raw = input.settings;
    if (typeof raw.defaultPresetRole === 'string') {
      if (!['member', 'preset_manager', 'admin'].includes(raw.defaultPresetRole)) {
        throw ApiError.badRequest('Choose a valid default preset role.');
      }
      allowed.defaultPresetRole = raw.defaultPresetRole;
    }
    if (typeof raw.allowMemberSubmissions === 'boolean') {
      allowed.allowMemberSubmissions = raw.allowMemberSubmissions;
    }
    if (typeof raw.accent === 'string' && /^[a-z]{3,20}$/.test(raw.accent)) {
      allowed.accent = raw.accent;
    }
  }
  const rows = await db.query<{ settings: Record<string, unknown> }>(
    'select settings from discord_servers where id = $1',
    [serverId],
  );
  const merged = { ...(rows[0]?.settings ?? {}), ...allowed };
  await db.query('update discord_servers set settings = $2 where id = $1', [serverId, JSON.stringify(merged)]);
  await logActivity({
    userId,
    serverId,
    action: 'community.settings_updated',
    message: 'Updated community settings',
    metadata: allowed,
  });
}

export async function listCommunityMembers(userId: string, serverId: string): Promise<CommunityMember[]> {
  await assertCommunityRole(userId, serverId, 'admin');
  const db = await getReadyDb();
  const rows = await db.query<DbMembership & Pick<DbUser, 'display_name' | 'avatar_url'>>(
    `select m.*, u.display_name, u.avatar_url
       from server_memberships m
       join users u on u.id = m.user_id
      where m.server_id = $1
      order by case m.role when 'owner' then 0 when 'admin' then 1 when 'preset_manager' then 2 else 3 end,
               u.display_name asc`,
    [serverId],
  );
  return rows.map((row) => ({
    membershipId: row.id,
    userId: row.user_id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    role: row.role,
    roleLabel: SERVER_ROLE_LABELS[row.role],
    createdAt: new Date(row.created_at).toISOString(),
  }));
}

/**
 * Role changes are strictly ordered: you can never edit a peer or a superior, and
 * only an owner can hand out the admin role. Discord remains the source of truth
 * for who is actually in the guild — these roles only gate product permissions.
 */
export async function updateMemberRole(
  actorId: string,
  serverId: string,
  membershipId: string,
  nextRole: ServerRole,
): Promise<void> {
  const context = await assertCommunityRole(actorId, serverId, 'admin');
  if (!['member', 'preset_manager', 'admin'].includes(nextRole)) {
    throw ApiError.badRequest('The owner role is reserved for the Discord guild owner.');
  }
  const db = await getReadyDb();
  const targetRows = await db.query<DbMembership>(
    'select * from server_memberships where id = $1 and server_id = $2',
    [membershipId, serverId],
  );
  const target = targetRows[0];
  if (!target) throw ApiError.notFound('Member not found.');
  if (target.user_id === actorId) throw ApiError.badRequest('You cannot change your own role.');
  if (target.role === 'owner') throw ApiError.forbidden('The guild owner role cannot be changed here.');
  const actorRank = context.role === 'owner' ? 3 : 2;
  const targetRank = target.role === 'admin' ? 2 : target.role === 'preset_manager' ? 1 : 0;
  if (targetRank >= actorRank && context.role !== 'owner') {
    throw ApiError.forbidden('You can only manage members below your own role.');
  }
  if (nextRole === 'admin' && context.role !== 'owner') {
    throw ApiError.forbidden('Only the community owner can grant administrator.');
  }

  await db.query('update server_memberships set role = $2 where id = $1', [membershipId, nextRole]);
  await logActivity({
    userId: actorId,
    serverId,
    action: 'community.member_role_updated',
    message: `Changed member role to ${SERVER_ROLE_LABELS[nextRole]}`,
    metadata: { membershipId, targetUserId: target.user_id, nextRole },
  });
}

export async function requestCommunityVerification(userId: string, serverId: string): Promise<void> {
  const context = await assertCommunityRole(userId, serverId, 'admin');
  if (context.server.verification_status === 'verified') {
    throw ApiError.conflict('This community is already verified.');
  }
  const db = await getReadyDb();
  await db.query(
    `update discord_servers set verification_status = 'pending' where id = $1 and verification_status <> 'verified'`,
    [serverId],
  );
  await logActivity({
    userId,
    serverId,
    action: 'community.verification_requested',
    message: 'Requested community verification',
  });
}

export async function decideCommunityVerification(
  staffUserId: string,
  serverId: string,
  decision: 'verified' | 'rejected',
  note: string | null,
): Promise<void> {
  const db = await getReadyDb();
  await db.query(
    'update discord_servers set verification_status = $2, verification_note = $3 where id = $1',
    [serverId, decision, note],
  );
  await logActivity({
    userId: staffUserId,
    serverId,
    actorType: 'system',
    action: `community.verification_${decision}`,
    message: decision === 'verified' ? 'Community verified by Avenqio staff' : 'Verification rejected by Avenqio staff',
    metadata: { note },
  });
}

export type StaffQueueItem = {
  id: string;
  name: string;
  discordGuildId: string;
  iconUrl: string | null;
  status: DbServer['verification_status'];
  requestedBy: string | null;
  memberCount: number | null;
  updatedAt: string;
};

export async function listVerificationQueue(): Promise<StaffQueueItem[]> {
  const db = await getReadyDb();
  const rows = await db.query<
    DbServer & { requested_by: string | null }
  >(
    `select s.*, (
        select u.display_name from activity_logs a join users u on u.id = a.user_id
         where a.server_id = s.id and a.action = 'community.verification_requested'
         order by a.created_at desc limit 1
      ) as requested_by
       from discord_servers s
      where s.verification_status in ('pending', 'rejected')
      order by s.updated_at desc
      limit 50`,
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    discordGuildId: row.discord_guild_id,
    iconUrl: discordGuildIconUrl(row.discord_guild_id, row.icon_hash),
    status: row.verification_status,
    requestedBy: row.requested_by,
    memberCount: row.member_count,
    updatedAt: new Date(row.updated_at).toISOString(),
  }));
}

export function botInviteUrl(): string | null {
  if (config.discord.botInviteUrl) return config.discord.botInviteUrl;
  if (!config.discord.clientId) return null;
  const permissions = '326417514496'; // Manage roles + Send messages + Embed links
  return `https://discord.com/oauth2/authorize?client_id=${config.discord.clientId}&scope=bot%20applications.commands&permissions=${permissions}`;
}

export { toIso };

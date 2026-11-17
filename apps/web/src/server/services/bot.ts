import { getReadyDb } from '../db';
import type { DbPreset, DbServer } from '../db/types';
import { ApiError } from '../http/errors';
import { logActivity } from './activity';

export type BotCommunity = {
  server: {
    id: string;
    discordGuildId: string;
    name: string;
    verificationStatus: string;
    botPresent: boolean;
    memberCount: number | null;
  };
  presets: Array<{ id: string; name: string; status: string; minRole: string; members: number }>;
  linkedMembers: number;
};

/** Called by the bot on startup and on guild join/leave. */
export async function syncGuildFromBot(input: {
  guildId: string;
  name: string;
  iconHash?: string | null;
  memberCount?: number | null;
  ownerDiscordId?: string | null;
}): Promise<{ serverId: string }> {
  const db = await getReadyDb();
  const rows = await db.query<DbServer>(
    `insert into discord_servers (discord_guild_id, name, icon_hash, owner_discord_user_id, member_count, bot_present, bot_synced_at)
     values ($1, $2, $3, $4, $5, true, now())
     on conflict (discord_guild_id) do update
       set name = excluded.name,
           icon_hash = excluded.icon_hash,
           member_count = coalesce(excluded.member_count, discord_servers.member_count),
           owner_discord_user_id = coalesce(excluded.owner_discord_user_id, discord_servers.owner_discord_user_id),
           bot_present = true,
           bot_synced_at = now()
     returning *`,
    [input.guildId, input.name.slice(0, 100), input.iconHash ?? null, input.ownerDiscordId ?? null, input.memberCount ?? null],
  );
  await logActivity({
    serverId: rows[0]!.id,
    actorType: 'bot',
    action: 'community.bot_synced',
    message: 'Community metadata synchronised by the AvenqioPresence bot',
    metadata: { guildId: input.guildId, memberCount: input.memberCount ?? null },
  });
  return { serverId: rows[0]!.id };
}

export async function markGuildLeft(guildId: string): Promise<void> {
  const db = await getReadyDb();
  await db.query('update discord_servers set bot_present = false where discord_guild_id = $1', [guildId]);
}

export async function getCommunityForBot(guildId: string): Promise<BotCommunity> {
  const db = await getReadyDb();
  const serverRows = await db.query<DbServer>('select * from discord_servers where discord_guild_id = $1', [
    guildId,
  ]);
  const server = serverRows[0];
  if (!server) {
    throw ApiError.notFound('This server is not connected to AvenqioPresence yet. An administrator must sign in first.');
  }
  const presets = await db.query<DbPreset & { members: number }>(
    `select p.*, (select count(*)::int from server_memberships m where m.server_id = p.server_id) as members
       from community_presets p
      where p.server_id = $1 and p.status = 'published'
      order by p.name`,
    [server.id],
  );
  const linked = await db.query<{ count: number }>(
    'select count(*)::int as count from server_memberships where server_id = $1',
    [server.id],
  );
  return {
    server: {
      id: server.id,
      discordGuildId: server.discord_guild_id,
      name: server.name,
      verificationStatus: server.verification_status,
      botPresent: server.bot_present,
      memberCount: server.member_count,
    },
    presets: presets.map((preset) => ({
      id: preset.id,
      name: preset.name,
      status: preset.status,
      minRole: preset.min_role,
      members: preset.members,
    })),
    linkedMembers: linked[0]?.count ?? 0,
  };
}

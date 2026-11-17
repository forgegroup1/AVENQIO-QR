import { isGuildOwner, discordAvatarUrl, SERVER_ROLE_RANK, type ServerRole } from '@avenqio/shared';
import { config, discordOAuthConfigured } from '../config';
import { getReadyDb } from '../db';
import type { DbDiscordAccount, DbServer } from '../db/types';
import { ApiError } from '../http/errors';

const DISCORD_API = 'https://discord.com/api/v10';

export type DiscordGuild = {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
  features?: string[];
};

export type DiscordProfile = {
  id: string;
  username: string;
  global_name: string | null;
  email?: string | null;
  avatar: string | null;
};

export function buildAuthorizeUrl(state: string): string {
  if (!discordOAuthConfigured()) {
    throw ApiError.badRequest('Discord OAuth is not configured on this deployment.');
  }
  const url = new URL('https://discord.com/oauth2/authorize');
  url.searchParams.set('client_id', config.discord.clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', config.discord.redirectUri);
  url.searchParams.set('scope', 'identify guilds');
  url.searchParams.set('state', state);
  url.searchParams.set('prompt', 'consent');
  return url.toString();
}

async function discordFetch<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${DISCORD_API}${path}`, {
    ...init,
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    console.error(`[discord] ${path} failed: ${response.status} ${body.slice(0, 300)}`);
    throw new ApiError(502, 'discord_error', 'Discord did not accept the request. Please try again.');
  }
  return (await response.json()) as T;
}

export async function exchangeCode(code: string): Promise<string> {
  const body = new URLSearchParams({
    client_id: config.discord.clientId,
    client_secret: config.discord.clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.discord.redirectUri,
  });
  const token = await discordFetch<{ access_token: string }>('/oauth2/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  // The token is used for the two API calls below and then discarded: it is
  // never written to the database or returned to the client.
  return token.access_token;
}

export async function fetchProfile(accessToken: string): Promise<DiscordProfile> {
  return discordFetch<DiscordProfile>('/users/@me', {
    headers: { authorization: `Bearer ${accessToken}` },
  });
}

export async function fetchGuilds(accessToken: string): Promise<DiscordGuild[]> {
  return discordFetch<DiscordGuild[]>('/users/@me/guilds', {
    headers: { authorization: `Bearer ${accessToken}` },
  });
}

/** Guilds the user can actually manage (owner, administrator or manage-guild). */
export function manageableGuilds(guilds: DiscordGuild[]): DiscordGuild[] {
  return guilds.filter((guild) => isGuildOwner(guild, guild.permissions));
}

/**
 * Creates or updates the local account and the communities the user manages.
 * Runs inside a transaction so a partial Discord response cannot leave orphan rows.
 */
export async function syncDiscordIdentity(
  profile: DiscordProfile,
  guilds: DiscordGuild[],
): Promise<{ userId: string; servers: number }> {
  const db = await getReadyDb();
  return db.transaction(async (tx) => {
    const displayName = (profile.global_name || profile.username).slice(0, 64);
    const avatarUrl =
      discordAvatarUrl(profile.id, profile.avatar) ?? `https://cdn.discordapp.com/embed/avatars/0.png`;

    const existing = await tx.query<DbDiscordAccount>(
      'select * from discord_accounts where discord_user_id = $1',
      [profile.id],
    );

    let userId: string;
    const account = existing[0];
    if (account) {
      userId = account.user_id;
      await tx.query(
        `update users set display_name = $2, avatar_url = $3,
           email = coalesce($4, email), last_seen_at = now()
         where id = $1`,
        [userId, displayName, avatarUrl, profile.email ?? null],
      );
      await tx.query(
        `update discord_accounts set username = $2, global_name = $3, avatar_hash = $4 where id = $1`,
        [account.id, profile.username, profile.global_name, profile.avatar],
      );
    } else {
      const inserted = await tx.query<{ id: string }>(
        `insert into users (display_name, avatar_url, email, last_seen_at)
         values ($1, $2, $3, now()) returning id`,
        [displayName, avatarUrl, profile.email ?? null],
      );
      userId = inserted[0]!.id;
      await tx.query(
        `insert into discord_accounts (user_id, discord_user_id, username, global_name, avatar_hash)
         values ($1, $2, $3, $4, $5)`,
        [userId, profile.id, profile.username, profile.global_name, profile.avatar],
      );
    }

    let servers = 0;
    for (const guild of manageableGuilds(guilds)) {
      const role: ServerRole = guild.owner ? 'owner' : 'admin';
      const serverRows = await tx.query<DbServer>(
        `insert into discord_servers (discord_guild_id, name, icon_hash, owner_discord_user_id)
         values ($1, $2, $3, $4)
         on conflict (discord_guild_id) do update
           set name = excluded.name,
               icon_hash = excluded.icon_hash,
               owner_discord_user_id = coalesce(excluded.owner_discord_user_id, discord_servers.owner_discord_user_id)
         returning *`,
        [guild.id, guild.name, guild.icon, guild.owner ? profile.id : null],
      );
      const server = serverRows[0]!;
      const membership = await tx.query<{ role: ServerRole }>(
        'select role from server_memberships where user_id = $1 and server_id = $2',
        [userId, server.id],
      );
      const currentRole = membership[0]?.role;
      const nextRole: ServerRole =
        currentRole && SERVER_ROLE_RANK[currentRole] > SERVER_ROLE_RANK[role] ? currentRole : role;

      await tx.query(
        `insert into server_memberships (user_id, server_id, role, discord_permissions)
         values ($1, $2, $3, $4)
         on conflict (user_id, server_id) do update
           set role = $3, discord_permissions = $4`,
        [userId, server.id, nextRole, guild.permissions],
      );
      servers += 1;
    }

    await tx.query(
      `insert into activity_logs (user_id, actor_type, action, message, metadata)
       values ($1, 'user', 'account.signed_in', 'Signed in with Discord', $2)`,
      [userId, JSON.stringify({ servers })],
    );

    return { userId, servers };
  });
}

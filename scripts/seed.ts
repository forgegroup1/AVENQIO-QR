/**
 * Development fixtures.
 *
 * These rows power the two "dev sign-in" accounts available when Discord OAuth is
 * not configured. They are always flagged (users.is_dev = true) and the dashboard
 * shows a permanent "development session" banner, so fixture data can never be
 * mistaken for a real account. `npm run db:reset` removes them entirely.
 */
import { createHash } from 'node:crypto';
import type { Queryable } from '../apps/web/src/server/db/index';

export const DEV_USERS = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    displayName: 'Nova Hart',
    discordId: '118000000000000001',
    username: 'nova.hart',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    displayName: 'Kai Mercer',
    discordId: '118000000000000002',
    username: 'kai.mercer',
  },
] as const;

const SERVER_A = '33333333-3333-4333-8333-333333333331';
const SERVER_B = '33333333-3333-4333-8333-333333333332';

export async function seedDevData(tx: Queryable): Promise<void> {
  const [nova, kai] = DEV_USERS;
  const now = Date.now();

  await tx.query('delete from users where is_dev = true');

  for (const user of DEV_USERS) {
    await tx.query(
      `insert into users (id, display_name, locale, is_dev, last_seen_at)
       values ($1, $2, 'en', true, now())`,
      [user.id, user.displayName],
    );
    await tx.query(
      `insert into discord_accounts (user_id, discord_user_id, username, global_name)
       values ($1, $2, $3, $4)`,
      [user.id, user.discordId, user.username, user.displayName],
    );
  }

  await tx.query(
    `insert into discord_servers
       (id, discord_guild_id, name, owner_discord_user_id, member_count, bot_present, bot_synced_at, verification_status, settings)
     values
       ($1, '119000000000000001', 'Avenqio Labs', $2, 128, true, now(), 'verified', $3),
       ($4, '119000000000000002', 'Liberty County RP', $5, 842, false, null, 'pending', '{}'::jsonb)`,
    [
      SERVER_A,
      nova.discordId,
      JSON.stringify({ accent: 'violet', defaultPresetRole: 'member' }),
      SERVER_B,
      kai.discordId,
    ],
  );

  const memberships: Array<[string, string, string]> = [
    [nova.id, SERVER_A, 'owner'],
    [nova.id, SERVER_B, 'admin'],
    [kai.id, SERVER_B, 'owner'],
    [kai.id, SERVER_A, 'member'],
  ];
  for (const [userId, serverId, role] of memberships) {
    await tx.query(
      `insert into server_memberships (user_id, server_id, role, discord_permissions)
       values ($1, $2, $3, $4)`,
      [userId, serverId, role, role === 'owner' ? '8' : role === 'admin' ? '32' : '0'],
    );
  }

  const presence = (
    id: string,
    userId: string,
    serverId: string | null,
    name: string,
    payload: Record<string, unknown>,
    isActive: boolean,
    source = 'manual',
  ) => ({ id, userId, serverId, name, payload, isActive, source });

  const presences = [
    presence(
      '44444444-4444-4444-8444-444444444441',
      nova.id,
      null,
      'Late-night build',
      {
        applicationName: 'Visual Studio Code',
        activityType: 'playing',
        details: 'Building AvenqioPresence',
        state: 'Shipping the dashboard',
        largeImage: { source: 'vscode', text: 'Visual Studio Code' },
        smallImage: null,
        timestamps: { start: now - 1000 * 60 * 72, end: null },
        party: null,
        buttons: [{ label: 'Avenqio', url: 'https://avenqio.com' }],
      },
      true,
    ),
    presence(
      '44444444-4444-4444-8444-444444444442',
      nova.id,
      null,
      'Los Santos Life — paramedic',
      {
        applicationName: 'FiveM',
        activityType: 'playing',
        details: 'Playing as Mia Rossi',
        state: 'Paramedic · Responding to a call',
        largeImage: { source: 'fivem', text: 'Los Santos Life RP' },
        smallImage: { source: 'fivem_character', text: 'Mia Rossi' },
        timestamps: { start: now - 1000 * 60 * 24, end: null },
        party: { current: 42, max: 128 },
        buttons: [{ label: 'Connect to server', url: 'https://cfx.re/join/?203.0.113.10' }],
      },
      false,
      'fivem',
    ),
    presence(
      '44444444-4444-4444-8444-444444444443',
      nova.id,
      SERVER_B,
      'Community night',
      {
        applicationName: 'AvenqioPresence',
        activityType: 'playing',
        details: 'Liberty County RP',
        state: 'Community night',
        largeImage: { source: 'https://cdn.discordapp.com/embed/avatars/0.png', text: 'Liberty County RP' },
        smallImage: null,
        timestamps: { start: now - 1000 * 60 * 60 * 2, end: null },
        party: null,
        buttons: [],
      },
      false,
    ),
    presence(
      '44444444-4444-4444-8444-444444444444',
      kai.id,
      SERVER_B,
      'On duty — patrol',
      {
        applicationName: 'Emergency Response: Liberty County',
        activityType: 'playing',
        details: 'Playing as a Police Officer',
        state: 'Currently On Duty',
        largeImage: { source: 'erlc', text: 'Liberty County RP' },
        smallImage: null,
        timestamps: { start: now - 1000 * 60 * 46, end: null },
        party: null,
        buttons: [],
      },
      true,
      'erlc',
    ),
  ];

  for (const item of presences) {
    await tx.query(
      `insert into presences (id, user_id, server_id, name, payload, is_active, source)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [item.id, item.userId, item.serverId, item.name, JSON.stringify(item.payload), item.isActive, item.source],
    );
  }

  await tx.query(
    `insert into presence_templates (owner_user_id, name, description, payload)
     values ($1, 'Twitch stream', 'Standard live-stream presence', $2)`,
    [
      nova.id,
      JSON.stringify({
        applicationName: 'AvenqioPresence',
        activityType: 'watching',
        details: 'Live on Twitch',
        state: 'Avenqio Labs community stream',
        largeImage: { source: 'twitch', text: 'Twitch' },
        smallImage: null,
        timestamps: { start: now, end: null },
        party: null,
        buttons: [{ label: 'Watch stream', url: 'https://twitch.tv' }],
      }),
    ],
  );

  await tx.query(
    `insert into community_presets (server_id, name, description, payload, status, min_role, created_by, published_at)
     values
       ($1, 'On duty — patrol', 'Approved patrol presence for all members', $2, 'published', 'member', $3, now()),
       ($1, 'Staff briefing', 'Internal presence for staff announcements', $4, 'draft', 'admin', $3, null)`,
    [
      SERVER_B,
      JSON.stringify({
        applicationName: 'Emergency Response: Liberty County',
        activityType: 'playing',
        details: 'Playing as a Police Officer',
        state: 'Currently On Duty',
        largeImage: { source: 'erlc', text: 'Liberty County RP' },
        smallImage: null,
        timestamps: { start: now, end: null },
        party: null,
        buttons: [],
      }),
      kai.id,
      JSON.stringify({
        applicationName: 'Emergency Response: Liberty County',
        activityType: 'playing',
        details: 'Staff briefing in progress',
        state: 'Liberty County RP',
        largeImage: { source: 'erlc', text: 'Liberty County RP' },
        smallImage: null,
        timestamps: null,
        party: null,
        buttons: [],
      }),
    ],
  );

  await tx.query(
    `insert into integrations (owner_user_id, server_id, kind, label, config, status)
     values ($1, null, 'fivem', 'Los Santos Life RP', $2, 'manual')`,
    [nova.id, JSON.stringify({ serverAddress: '203.0.113.10:30120', serverName: 'Los Santos Life RP' })],
  );

  await tx.query(
    `insert into companion_devices (user_id, name, os, status, app_version, last_seen_at, last_rpc_connected, token_hash)
     values ($1, 'DESKTOP-NOVA', 'windows', 'linked', '0.1.0', $2, true, $3)`,
    [
      nova.id,
      new Date(now - 1000 * 60 * 3),
      createHash('sha256').update('dev-fixture-device-token').digest('hex'),
    ],
  );

  const logs: Array<[string, string | null, string, string, string]> = [
    [nova.id, null, 'presence.activated', 'Activated “Late-night build”', 'companion'],
    [nova.id, SERVER_A, 'preset.published', 'Published 1 community preset', 'user'],
    [nova.id, null, 'device.linked', 'Linked companion device DESKTOP-NOVA', 'companion'],
    [kai.id, SERVER_B, 'preset.published', 'Published preset “On duty — patrol”', 'user'],
  ];
  for (const [userId, serverId, action, message, actor] of logs) {
    await tx.query(
      `insert into activity_logs (user_id, server_id, actor_type, action, message)
       values ($1, $2, $3, $4, $5)`,
      [userId, serverId, actor, action, message],
    );
  }
}

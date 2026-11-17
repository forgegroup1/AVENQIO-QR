import {
  defaultDiscordAvatarUrl,
  discordAvatarUrl,
  type CompanionStateResponse,
} from '@avenqio/shared';
import { config } from '../config';
import { getReadyDb } from '../db';
import type { CompanionDeviceRow } from '../db/companion-types';
import { ApiError } from '../http/errors';
import { generatePairingCode, hashToken, normalizePairingCode, randomToken } from '../security/crypto';
import { logActivity } from './activity';
import { listPresences, resolveActivePresence, setActivePresence } from './presences';
import { listUsablePresets, activatePreset } from './presets';

export type DeviceDto = {
  id: string;
  name: string;
  os: string;
  status: 'pending' | 'linked' | 'revoked';
  appVersion: string | null;
  lastSeenAt: string | null;
  lastRpcConnected: boolean | null;
  lastError: string | null;
  createdAt: string;
};

function toDto(row: CompanionDeviceRow): DeviceDto {
  return {
    id: row.id,
    name: row.name,
    os: row.os,
    status: row.status,
    appVersion: row.app_version,
    lastSeenAt: row.last_seen_at ? new Date(row.last_seen_at).toISOString() : null,
    lastRpcConnected: row.last_rpc_connected,
    lastError: row.last_error,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export async function listDevices(userId: string): Promise<DeviceDto[]> {
  const db = await getReadyDb();
  const rows = await db.query<CompanionDeviceRow>(
    `select * from companion_devices where user_id = $1 order by created_at desc`,
    [userId],
  );
  return rows.map(toDto);
}

/**
 * Creates a short-lived pairing code. Only its hash is stored, so a database dump
 * cannot be used to link an attacker's device to someone's account.
 */
export async function createPairingCode(
  userId: string,
  input: { name?: string },
): Promise<{ deviceId: string; code: string; expiresAt: string }> {
  const db = await getReadyDb();
  const active = await db.query<{ count: number }>(
    `select count(*)::int as count from companion_devices where user_id = $1 and status <> 'revoked'`,
    [userId],
  );
  if ((active[0]?.count ?? 0) >= 10) {
    throw ApiError.badRequest('Device limit reached. Remove an unused device first.');
  }

  const code = generatePairingCode();
  const expiresAt = new Date(Date.now() + config.companion.pairingTtlMinutes * 60_000);
  const rows = await db.query<CompanionDeviceRow>(
    `insert into companion_devices (user_id, name, os, status, pairing_code_hash, pairing_code_expires_at)
     values ($1, $2, 'windows', 'pending', $3, $4) returning *`,
    [userId, (input.name ?? 'New device').slice(0, 60), hashToken(normalizePairingCode(code)), expiresAt],
  );
  await logActivity({
    userId,
    action: 'device.pairing_created',
    message: 'Created a companion pairing code',
    metadata: { deviceId: rows[0]!.id },
  });
  return { deviceId: rows[0]!.id, code, expiresAt: expiresAt.toISOString() };
}

export async function revokeDevice(userId: string, deviceId: string): Promise<void> {
  const db = await getReadyDb();
  const rows = await db.query<{ id: string; name: string }>(
    `update companion_devices
        set status = 'revoked', token_hash = null, pairing_code_hash = null, updated_at = now()
      where id = $1 and user_id = $2
      returning id, name`,
    [deviceId, userId],
  );
  if (!rows.length) throw ApiError.notFound('Device not found.');
  await logActivity({
    userId,
    action: 'device.revoked',
    message: `Revoked companion device ${rows[0]!.name}`,
    metadata: { deviceId },
  });
}

/** Called by the desktop app, unauthenticated except for the pairing code. */
export async function linkDevice(input: {
  pairingCode: string;
  deviceName: string;
  os: string;
  appVersion: string;
  ipHash?: string | null;
}): Promise<{ token: string; deviceId: string; userId: string }> {
  const normalized = normalizePairingCode(input.pairingCode);
  if (normalized.length !== 8) {
    throw ApiError.badRequest('Enter the 8-character code shown in the dashboard.');
  }
  const db = await getReadyDb();
  const rows = await db.query<CompanionDeviceRow>(
    `select * from companion_devices
      where pairing_code_hash = $1 and status = 'pending' and pairing_code_expires_at > now()
      limit 1`,
    [hashToken(normalized)],
  );
  const device = rows[0];
  if (!device) {
    throw ApiError.badRequest('That pairing code is invalid or has expired. Generate a new one.');
  }

  const token = randomToken(32);
  await db.query(
    `update companion_devices
        set status = 'linked', token_hash = $2, name = $3, os = $4, app_version = $5,
            last_seen_at = now(), pairing_code_hash = null, pairing_code_expires_at = null, last_error = null
      where id = $1`,
    [device.id, hashToken(token), input.deviceName.slice(0, 60), input.os.slice(0, 20), input.appVersion.slice(0, 20)],
  );
  await logActivity({
    userId: device.user_id,
    actorType: 'companion',
    action: 'device.linked',
    message: `Linked companion device ${input.deviceName}`,
    metadata: { deviceId: device.id, os: input.os, appVersion: input.appVersion },
    ipHash: input.ipHash,
  });
  return { token, deviceId: device.id, userId: device.user_id };
}

export type AuthorizedDevice = {
  device: CompanionDeviceRow;
  userId: string;
};

/** Bearer-token authentication for companion endpoints. */
export async function authenticateDevice(token: string | null): Promise<AuthorizedDevice> {
  if (!token) throw ApiError.unauthorized('Missing device token.');
  const db = await getReadyDb();
  const rows = await db.query<CompanionDeviceRow>(
    `select * from companion_devices where token_hash = $1 and status = 'linked' limit 1`,
    [hashToken(token)],
  );
  const device = rows[0];
  if (!device) throw ApiError.unauthorized('This device is not linked. Reconnect from the dashboard.');
  db.query('update companion_devices set last_seen_at = now() where id = $1', [device.id]).catch(() => {});
  return { device, userId: device.user_id };
}

export async function getCompanionState(userId: string, device: CompanionDeviceRow): Promise<CompanionStateResponse> {
  const db = await getReadyDb();
  const accountRows = await db.query<{
    id: string;
    display_name: string;
    avatar_url: string | null;
    discord_user_id: string | null;
    username: string | null;
    global_name: string | null;
    avatar_hash: string | null;
  }>(
    `select u.id, u.display_name, u.avatar_url, d.discord_user_id, d.username, d.global_name, d.avatar_hash
       from users u left join discord_accounts d on d.user_id = u.id
      where u.id = $1`,
    [userId],
  );
  const account = accountRows[0];
  if (!account) throw ApiError.unauthorized('Account not found.');

  const [presences, presets, active] = await Promise.all([
    listPresences(userId),
    listUsablePresets(userId),
    resolveActivePresence(userId),
  ]);

  return {
    account: {
      userId: account.id,
      displayName: account.display_name,
      avatarUrl:
        account.avatar_url ??
        (account.discord_user_id
          ? discordAvatarUrl(account.discord_user_id, account.avatar_hash) ??
            defaultDiscordAvatarUrl(account.discord_user_id)
          : null),
      discord: account.discord_user_id
        ? {
            id: account.discord_user_id,
            username: account.username ?? 'unknown',
            globalName: account.global_name,
          }
        : null,
    },
    device: {
      id: device.id,
      name: device.name,
      lastSeenAt: device.last_seen_at ? new Date(device.last_seen_at).toISOString() : null,
    },
    activePresenceId: active.presenceId,
    // Explicit resolution so the companion never has to guess whether a personal
    // presence or a community preset is currently published.
    active: {
      kind: active.kind,
      presenceId: active.presenceId,
      presetId: active.presetId,
      label: active.label,
    },
    presences: presences.map((presence) => ({
      id: presence.id,
      name: presence.name,
      payload: presence.payload,
      source: presence.source,
      community: null,
      updatedAt: presence.updatedAt,
    })),
    communityPresets: presets.map((preset) => ({
      id: preset.id,
      name: preset.name,
      payload: preset.payload,
      community: { id: preset.serverId, name: preset.serverName },
      verified: preset.verifiedCommunity,
    })),
    pollIntervalSeconds: config.companion.pollIntervalSeconds,
    generatedAt: new Date().toISOString(),
  };
}

/** The companion can switch presence from the tray without opening the dashboard. */
export async function selectFromCompanion(
  userId: string,
  device: CompanionDeviceRow,
  input: { presenceId?: string | null; presetId?: string | null },
): Promise<void> {
  if (input.presetId) {
    await activatePreset(userId, input.presetId);
  } else {
    await setActivePresence(userId, input.presenceId ?? null, Boolean(input.presenceId));
  }
  const db = await getReadyDb();
  await db.query('update companion_devices set last_applied_presence_id = $2 where id = $1', [
    device.id,
    input.presetId ? null : (input.presenceId ?? null),
  ]);
}

export async function recordHeartbeat(
  device: CompanionDeviceRow,
  input: { appVersion?: string; rpcConnected?: boolean; appliedPresenceId?: string | null; lastError?: string | null },
): Promise<void> {
  const db = await getReadyDb();
  await db.query(
    `update companion_devices
        set last_seen_at = now(), app_version = coalesce($2, app_version),
            last_rpc_connected = $3, last_applied_presence_id = $4, last_error = $5
      where id = $1`,
    [
      device.id,
      input.appVersion?.slice(0, 20) ?? null,
      input.rpcConnected ?? null,
      input.appliedPresenceId ?? null,
      input.lastError?.slice(0, 300) ?? null,
    ],
  );
}

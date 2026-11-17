import {
  INTEGRATIONS,
  getIntegration,
  isIntegrationKind,
  validatePresence,
  type IntegrationKind,
  type IntegrationSnapshot,
} from '@avenqio/shared';
import { getReadyDb } from '../db';
import type { DbIntegration } from '../db/types';
import { ApiError } from '../http/errors';
import { encryptionAvailable, encryptSecret } from '../security/crypto';
import { fetchIntegrationSnapshot } from '../integrations/registry';
import { logActivity } from './activity';
import { createPresence } from './presences';

export type IntegrationDto = {
  id: string;
  kind: IntegrationKind;
  label: string;
  status: DbIntegration['status'];
  hasCredentials: boolean;
  config: Record<string, unknown>;
  serverId: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  lastSnapshot: IntegrationSnapshot | null;
  createdAt: string;
};

function toDto(row: DbIntegration): IntegrationDto {
  return {
    id: row.id,
    kind: row.kind,
    label: row.label,
    status: row.status,
    hasCredentials: Boolean(row.credentials_encrypted),
    config: row.config,
    serverId: row.server_id,
    lastSyncedAt: row.last_synced_at ? new Date(row.last_synced_at).toISOString() : null,
    lastError: row.last_error,
    lastSnapshot: (row.config.lastSnapshot as IntegrationSnapshot | undefined) ?? null,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export async function listIntegrations(userId: string): Promise<IntegrationDto[]> {
  const db = await getReadyDb();
  const rows = await db.query<DbIntegration>(
    'select * from integrations where owner_user_id = $1 order by created_at desc',
    [userId],
  );
  return rows.map(toDto);
}

async function getOwnedIntegration(userId: string, id: string): Promise<DbIntegration> {
  const db = await getReadyDb();
  const rows = await db.query<DbIntegration>(
    'select * from integrations where id = $1 and owner_user_id = $2',
    [id, userId],
  );
  const row = rows[0];
  if (!row) throw ApiError.notFound('Integration not found.');
  return row;
}

function sanitizeConfig(kind: IntegrationKind, config: unknown): Record<string, unknown> {
  const input = (config ?? {}) as Record<string, unknown>;
  const clean: Record<string, unknown> = {};
  if (kind === 'fivem') {
    if (typeof input.serverAddress === 'string' && input.serverAddress.trim()) {
      clean.serverAddress = input.serverAddress.trim().slice(0, 120);
    }
    if (typeof input.serverName === 'string' && input.serverName.trim()) {
      clean.serverName = input.serverName.trim().slice(0, 80);
    }
  }
  if (kind === 'erlc') {
    if (typeof input.communityName === 'string' && input.communityName.trim()) {
      clean.communityName = input.communityName.trim().slice(0, 80);
    }
  }
  return clean;
}

export async function createIntegration(
  userId: string,
  input: { kind: unknown; label: string; config?: unknown; credentials?: { serverKey?: string } },
): Promise<IntegrationDto> {
  if (!isIntegrationKind(input.kind)) throw ApiError.badRequest('Choose a supported integration.');
  const label = input.label.trim();
  if (!label || label.length > 60) throw ApiError.badRequest('Give the integration a label (1–60 characters).');
  const definition = getIntegration(input.kind);
  const config = sanitizeConfig(input.kind, input.config);

  if (definition.automation.status === 'requires-credentials') {
    if (input.kind === 'fivem' && !config.serverAddress) {
      throw ApiError.badRequest('Add the FiveM server address to use live server data.', {
        serverAddress: 'Required for live data',
      });
    }
    if (input.kind === 'erlc' && !input.credentials?.serverKey) {
      throw ApiError.badRequest('Add your ER:LC server key to use live server data.', {
        serverKey: 'Required for live data',
      });
    }
  }

  let credentialsEncrypted: string | null = null;
  if (input.credentials?.serverKey) {
    if (!encryptionAvailable()) {
      throw new ApiError(
        500,
        'encryption_unavailable',
        'Credential storage is disabled: set APP_ENCRYPTION_KEY in the environment first.',
      );
    }
    credentialsEncrypted = encryptSecret(JSON.stringify({ serverKey: input.credentials.serverKey.trim() }));
  }

  const db = await getReadyDb();
  const rows = await db.query<DbIntegration>(
    `insert into integrations (owner_user_id, kind, label, config, credentials_encrypted, status)
     values ($1, $2, $3, $4, $5, $6) returning *`,
    [
      userId,
      input.kind,
      label,
      JSON.stringify(config),
      credentialsEncrypted,
      definition.automation.status === 'manual' ? 'manual' : 'connected',
    ],
  );
  await logActivity({
    userId,
    action: 'integration.created',
    message: `Added ${definition.name} integration “${label}”`,
    metadata: { integrationId: rows[0]!.id, kind: input.kind },
  });
  return toDto(rows[0]!);
}

export async function updateIntegration(
  userId: string,
  id: string,
  input: { label?: string; config?: unknown; credentials?: { serverKey?: string | null } },
): Promise<IntegrationDto> {
  const existing = await getOwnedIntegration(userId, id);
  const label = input.label === undefined ? existing.label : input.label.trim().slice(0, 60);
  if (!label) throw ApiError.badRequest('The label cannot be empty.');
  const config = input.config === undefined ? existing.config : sanitizeConfig(existing.kind, input.config);

  let credentials = existing.credentials_encrypted;
  if (input.credentials?.serverKey === null) {
    credentials = null;
  } else if (input.credentials?.serverKey) {
    if (!encryptionAvailable()) {
      throw new ApiError(500, 'encryption_unavailable', 'Set APP_ENCRYPTION_KEY before storing credentials.');
    }
    credentials = encryptSecret(JSON.stringify({ serverKey: input.credentials.serverKey.trim() }));
  }

  const db = await getReadyDb();
  const rows = await db.query<DbIntegration>(
    `update integrations set label = $3, config = $4, credentials_encrypted = $5
      where id = $1 and owner_user_id = $2 returning *`,
    [id, userId, label, JSON.stringify(config), credentials],
  );
  return toDto(rows[0]!);
}

export async function deleteIntegration(userId: string, id: string): Promise<void> {
  await getOwnedIntegration(userId, id);
  const db = await getReadyDb();
  await db.query('delete from integrations where id = $1 and owner_user_id = $2', [id, userId]);
  await logActivity({ userId, action: 'integration.deleted', message: 'Removed an integration', metadata: { id } });
}

/** Performs the real network call and records the outcome on the integration. */
export async function testIntegration(userId: string, id: string): Promise<IntegrationDto> {
  const integration = await getOwnedIntegration(userId, id);
  const db = await getReadyDb();
  try {
    const snapshot = await fetchIntegrationSnapshot(integration);
    const rows = await db.query<DbIntegration>(
      `update integrations
          set status = 'connected', last_error = null, last_synced_at = now(),
              config = jsonb_set(config, '{lastSnapshot}', $3::jsonb, true)
        where id = $1 and owner_user_id = $2 returning *`,
      [id, userId, JSON.stringify(snapshot)],
    );
    await logActivity({
      userId,
      action: 'integration.synced',
      message: `Synced ${INTEGRATIONS[integration.kind].name} integration`,
      metadata: { integrationId: id, playersOnline: snapshot.playersOnline ?? null },
    });
    return toDto(rows[0]!);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    await db.query(
      `update integrations set status = 'error', last_error = $3, last_synced_at = now()
        where id = $1 and owner_user_id = $2`,
      [id, userId, message.slice(0, 300)],
    );
    throw error;
  }
}

/**
 * Turns integration values into a validated presence draft. The adapter decides
 * what can be automated; nothing here invents per-player data.
 */
export async function createPresenceFromIntegration(
  userId: string,
  id: string,
  input: { name: string; values: Record<string, string | undefined> },
): Promise<{ presenceId: string }> {
  const integration = await getOwnedIntegration(userId, id);
  const definition = getIntegration(integration.kind);
  const snapshot = (integration.config.lastSnapshot as IntegrationSnapshot | undefined) ?? null;
  const payload = definition.buildPresence(input.values, snapshot);

  const validation = validatePresence(payload);
  if (!validation.ok) {
    throw ApiError.badRequest('Those integration values produce an invalid presence.', {
      payload: validation.errors[0]?.message ?? 'Invalid presence',
    });
  }
  const presence = await createPresence(userId, {
    name: input.name,
    payload: validation.payload!,
    source: integration.kind,
    integrationId: integration.id,
  });
  return { presenceId: presence.id };
}

import type { IntegrationSnapshot } from '@avenqio/shared';
import type { DbIntegration } from '../db/types';
import { ApiError } from '../http/errors';
import { decryptSecret } from '../security/crypto';
import { fetchErlcSnapshot, fetchFiveMSnapshot } from './adapters';

export type IntegrationCredentials = { serverKey?: string };

export function readCredentials(integration: DbIntegration): IntegrationCredentials {
  if (!integration.credentials_encrypted) return {};
  try {
    return JSON.parse(decryptSecret(integration.credentials_encrypted)) as IntegrationCredentials;
  } catch (error) {
    console.error('[integrations] could not decrypt credentials', error);
    throw new ApiError(
      500,
      'credentials_unreadable',
      'Stored credentials cannot be decrypted with the current APP_ENCRYPTION_KEY.',
    );
  }
}

/**
 * Live data sources, grouped by adapter. Nothing here reads a user's Discord
 * presence: the companion is the only component allowed to talk to Discord RPC.
 */
export async function fetchIntegrationSnapshot(integration: DbIntegration): Promise<IntegrationSnapshot> {
  if (integration.kind === 'fivem') {
    const address = typeof integration.config.serverAddress === 'string' ? integration.config.serverAddress : '';
    if (!address) {
      throw ApiError.badRequest('Add the FiveM server address before testing the integration.');
    }
    return fetchFiveMSnapshot(address);
  }
  if (integration.kind === 'erlc') {
    const credentials = readCredentials(integration);
    if (!credentials.serverKey) {
      throw ApiError.badRequest(
        'Add your ER:LC server key (ERLC API server pack required) before testing the integration.',
      );
    }
    return fetchErlcSnapshot(credentials.serverKey);
  }
  throw ApiError.badRequest('Unsupported integration type.');
}

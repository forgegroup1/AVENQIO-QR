import { logger } from './logger';

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null = null,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export type CommunitySummary = {
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

type Options = { baseUrl: string; serviceToken: string; timeoutMs?: number };

/**
 * Thin client for the bot-only API surface. Every request carries the shared
 * service token; the bot has no user cookies and cannot act as a user.
 */
export function createApiClient({ baseUrl, serviceToken, timeoutMs = 10_000 }: Options) {
  async function call<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method: init.method ?? 'GET',
        headers: {
          authorization: `Bearer ${serviceToken}`,
          ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
          accept: 'application/json',
          'user-agent': 'AvenqioPresenceBot/0.1',
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: controller.signal,
        redirect: 'error',
      });

      const text = await response.text();
      const payload = text ? (JSON.parse(text) as { error?: { message?: string; code?: string } } & Record<string, unknown>) : {};
      if (!response.ok) {
        const message = payload.error?.message ?? `API responded with ${response.status}`;
        throw new ApiClientError(message, response.status, payload.error?.code ?? null);
      }
      return payload as T;
    } catch (error) {
      if (error instanceof ApiClientError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ApiClientError(`Request to ${path} timed out`, 0, 'timeout');
      }
      logger.debug('API request failed', { path, error: error instanceof Error ? error.message : error });
      throw new ApiClientError(error instanceof Error ? error.message : 'Network error', 0, 'network');
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async syncGuild(input: {
      guildId: string;
      name: string;
      iconHash?: string | null;
      memberCount?: number | null;
      ownerDiscordId?: string | null;
    }): Promise<{ serverId: string }> {
      return call('/api/bot/sync-guild', { method: 'POST', body: input });
    },
    async leaveGuild(guildId: string): Promise<{ ok: boolean }> {
      return call('/api/bot/leave-guild', { method: 'POST', body: { guildId } });
    },
    async community(guildId: string): Promise<CommunitySummary> {
      return call(`/api/bot/communities/${encodeURIComponent(guildId)}`);
    },
    async health(): Promise<{ ok: boolean; database: string }> {
      return call('/api/health');
    },
  };
}

export type BotApi = ReturnType<typeof createApiClient>;

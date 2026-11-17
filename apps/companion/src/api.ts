import type { CompanionState } from './core/state';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type Options = { apiUrl: string; token?: string | null; timeoutMs?: number };

/**
 * Companion → dashboard API. Only three endpoints exist, all authenticated with
 * the device token obtained by pairing: no Discord credentials ever reach the
 * desktop app.
 */
export function createCompanionApi({ apiUrl, token, timeoutMs = 12_000 }: Options) {
  async function call<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${apiUrl}${path}`, {
        method: init.method ?? 'GET',
        headers: {
          accept: 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: controller.signal,
        redirect: 'error',
      });
      const text = await response.text();
      const payload = text ? (JSON.parse(text) as { error?: { message?: string } } & Record<string, unknown>) : {};
      if (!response.ok) {
        throw new ApiError(payload.error?.message ?? `Request failed with ${response.status}`, response.status);
      }
      return payload as T;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ApiError('The dashboard did not respond in time.', 0);
      }
      throw new ApiError(error instanceof Error ? error.message : 'Network error', 0);
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async link(input: { pairingCode: string; deviceName: string; os: string; appVersion: string }): Promise<{
      deviceToken: string;
      deviceId: string;
      account: CompanionState['account'];
    }> {
      return call('/api/companion/link', { method: 'POST', body: input });
    },
    async state(): Promise<CompanionState> {
      return call('/api/companion/state');
    },
    async heartbeat(input: {
      appVersion: string;
      rpcConnected: boolean;
      appliedPresenceId: string | null;
      lastError: string | null;
    }): Promise<{ ok: boolean }> {
      return call('/api/companion/heartbeat', { method: 'POST', body: input });
    },
    async select(input: { presenceId?: string | null; presetId?: string | null }): Promise<CompanionState> {
      return call('/api/companion/select', { method: 'POST', body: input });
    },
    async health(): Promise<unknown> {
      return call('/api/health');
    },
  };
}

export type CompanionApi = ReturnType<typeof createCompanionApi>;

import { Client } from '@xhayper/discord-rpc';
import { toLocalActivity, type LocalActivity } from './core/activity';
import { log } from './logger';

export type RpcStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export type RpcSnapshot = {
  status: RpcStatus;
  lastError: string | null;
  connectedAt: string | null;
};

/**
 * Owns the single local Discord IPC connection. Rich Presence is published by
 * this process only — the dashboard and the bot never claim to change it.
 */
export class RpcManager {
  private client: Client | null = null;
  private snapshot: RpcSnapshot = { status: 'disconnected', lastError: null, connectedAt: null };
  private readonly listeners = new Set<(snapshot: RpcSnapshot) => void>();
  private reconnectTimer: NodeJS.Timeout | null = null;
  private attempts = 0;
  private stopping = false;

  constructor(
    private readonly clientId: string,
    private readonly onStatusChange?: (snapshot: RpcSnapshot) => void,
  ) {}

  getState(): RpcSnapshot {
    return { ...this.snapshot };
  }

  private setState(patch: Partial<RpcSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    this.onStatusChange?.(this.getState());
    for (const listener of this.listeners) listener(this.getState());
  }

  onStatus(listener: (snapshot: RpcSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async connect(): Promise<void> {
    if (this.client || this.snapshot.status === 'connecting') return;
    this.stopping = false;
    this.setState({ status: 'connecting', lastError: null });
    const client = new Client({ clientId: this.clientId });
    this.client = client;

    client.on('disconnected', () => {
      log('warn', 'Discord RPC disconnected');
      this.client = null;
      this.setState({ status: 'disconnected', connectedAt: null });
      this.scheduleReconnect();
    });

    try {
      await client.login();
      this.attempts = 0;
      this.setState({ status: 'connected', lastError: null, connectedAt: new Date().toISOString() });
      log('info', 'Discord RPC connected');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.client = null;
      // The most common cause is Discord not running — not a crash.
      this.setState({ status: 'error', lastError: message });
      log('warn', 'Discord RPC unavailable', { message });
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.stopping || this.reconnectTimer) return;
    const delay = Math.min(2_000 * 2 ** this.attempts, 60_000);
    this.attempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
    this.reconnectTimer.unref?.();
  }

  async publish(activity: LocalActivity | null): Promise<{ ok: boolean; error: string | null }> {
    const user = this.client?.user;
    if (!user || this.snapshot.status !== 'connected') {
      return { ok: false, error: 'Discord is not connected.' };
    }
    try {
      if (activity) await user.setActivity(activity as never);
      else await user.clearActivity();
      return { ok: true, error: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log('warn', 'could not apply activity', { message });
      this.setState({ lastError: message });
      return { ok: false, error: message };
    }
  }

  async publishPayload(
    payload: Parameters<typeof toLocalActivity>[0] | null,
    applicationName: string,
  ): Promise<{ ok: boolean; error: string | null }> {
    return payload ? this.publish(toLocalActivity(payload, applicationName)) : this.publish(null);
  }

  async destroy(): Promise<void> {
    this.stopping = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const client = this.client;
    this.client = null;
    this.setState({ status: 'disconnected', connectedAt: null });
    if (client) await client.destroy().catch(() => undefined);
  }
}

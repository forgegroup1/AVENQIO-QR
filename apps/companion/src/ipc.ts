import type { CompanionSettings, UpdateCheck } from './core/settings';
import type { CompanionState } from './core/state';

export type RpcSnapshotDto = {
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  lastError: string | null;
  connectedAt: string | null;
};

export type SyncSnapshot = {
  lastSyncAt: string | null;
  lastAppliedAt: string | null;
  lastError: string | null;
  polling: boolean;
};

export type AppSnapshot = {
  version: string;
  linked: boolean;
  settings: CompanionSettings;
  rpc: RpcSnapshotDto;
  sync: SyncSnapshot;
  state: CompanionState | null;
  logs: string[];
  update: UpdateCheck | null;
  platform: string;
};

export type LinkResult = { ok: true } | { ok: false; error: string };

export type ActionResult = { ok: boolean; error?: string };

/** Contract exposed on `window.avenqio` by the preload script. */
export type CompanionBridge = {
  snapshot(): Promise<AppSnapshot>;
  link(pairingCode: string): Promise<LinkResult>;
  unlink(): Promise<ActionResult>;
  select(input: { presenceId?: string | null; presetId?: string | null }): Promise<ActionResult>;
  refresh(): Promise<ActionResult>;
  updateSettings(patch: Partial<CompanionSettings>): Promise<AppSnapshot>;
  checkForUpdates(): Promise<UpdateCheck>;
  openExternal(url: string): Promise<ActionResult>;
  copy(text: string): Promise<void>;
  quit(): void;
  hideToTray(): void;
  onSnapshot(listener: (snapshot: AppSnapshot) => void): () => void;
};

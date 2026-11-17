import type { PresencePayload } from './presence';
import type { IntegrationKind, ServerRole } from './roles';
import type { ActivityType } from './limits';

/** ── Companion ↔ backend contract ─────────────────────────────────────────── */

export type CompanionAccount = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  discord: { id: string; username: string; globalName: string | null } | null;
};

export type CompanionPresence = {
  id: string;
  name: string;
  payload: PresencePayload;
  source: string;
  community: { id: string; name: string } | null;
  updatedAt: string;
};

export type CompanionStateResponse = {
  account: CompanionAccount;
  device: { id: string; name: string; lastSeenAt: string | null };
  /** Presence the user activated in the dashboard, if any. */
  activePresenceId: string | null;
  /**
   * Resolved "what should be on Discord" decision. The dashboard owns the rules
   * (one active presence, presets revocable per member); the companion just
   * mirrors this value, so both sides can never disagree.
   */
  active: {
    kind: 'presence' | 'community_preset' | 'none';
    presenceId: string | null;
    presetId: string | null;
    label: string | null;
  };
  presences: CompanionPresence[];
  /** Community presets the user is allowed to use, across all communities. */
  communityPresets: Array<{
    id: string;
    name: string;
    payload: PresencePayload;
    community: { id: string; name: string };
    verified: boolean;
  }>;
  pollIntervalSeconds: number;
  generatedAt: string;
};

export type CompanionLinkRequest = {
  pairingCode: string;
  deviceName: string;
  os: string;
  appVersion: string;
};

export type CompanionLinkResponse = {
  deviceToken: string;
  deviceId: string;
  account: CompanionAccount;
};

export type CompanionHeartbeatRequest = {
  appVersion: string;
  rpcConnected: boolean;
  appliedPresenceId: string | null;
  lastError: string | null;
};

/** ── Bot ↔ backend contract ───────────────────────────────────────────────── */

export type BotSyncGuildRequest = {
  guildId: string;
  name: string;
  iconHash: string | null;
  memberCount: number | null;
  ownerDiscordId: string | null;
};

export type BotCommunityResponse = {
  server: {
    id: string;
    discordGuildId: string;
    name: string;
    verificationStatus: string;
    botPresent: boolean;
  };
  presets: Array<{ id: string; name: string; status: string; payload: PresencePayload }>;
  members: Array<{ displayName: string; role: ServerRole; isActive: boolean }>;
};

/** ── Dashboard API contract ───────────────────────────────────────────────── */

export type ApiError = {
  error: { code: string; message: string; fields?: Record<string, string> };
};

export type PresenceDto = {
  id: string;
  name: string;
  payload: PresencePayload;
  isActive: boolean;
  source: string;
  serverId: string | null;
  serverName: string | null;
  activityType: ActivityType;
  createdAt: string;
  updatedAt: string;
};

export type ActivityLogDto = {
  id: string;
  action: string;
  actorType: string;
  message: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export type IntegrationDto = {
  id: string;
  kind: IntegrationKind;
  name: string;
  status: string;
  hasCredentials: boolean;
  config: Record<string, unknown>;
  lastSyncedAt: string | null;
  lastError: string | null;
};

export type DeviceDto = {
  id: string;
  name: string;
  os: string;
  status: string;
  lastSeenAt: string | null;
  appVersion: string | null;
  createdAt: string;
};

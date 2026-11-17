import type { PresencePayload } from '@avenqio/shared';

/** Raw row shapes (snake_case) as stored in PostgreSQL. */

export type DbUser = {
  id: string;
  display_name: string;
  email: string | null;
  avatar_url: string | null;
  locale: string;
  preferences: Record<string, unknown>;
  is_dev: boolean;
  created_at: Date | string;
  updated_at: Date | string;
  last_seen_at: Date | string | null;
};

export type DbDiscordAccount = {
  id: string;
  user_id: string;
  discord_user_id: string;
  username: string;
  global_name: string | null;
  avatar_hash: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

export type DbSession = {
  id: string;
  user_id: string;
  token_hash: string;
  user_agent: string | null;
  ip_hash: string | null;
  created_at: Date | string;
  last_used_at: Date | string | null;
  expires_at: Date | string;
  revoked_at: Date | string | null;
};

export type DbServer = {
  id: string;
  discord_guild_id: string;
  name: string;
  icon_hash: string | null;
  owner_discord_user_id: string | null;
  member_count: number | null;
  bot_present: boolean;
  bot_synced_at: Date | string | null;
  verification_status: 'unverified' | 'pending' | 'verified' | 'rejected';
  verification_note: string | null;
  settings: Record<string, unknown>;
  created_at: Date | string;
  updated_at: Date | string;
};

export type DbMembership = {
  id: string;
  user_id: string;
  server_id: string;
  role: 'owner' | 'admin' | 'preset_manager' | 'member';
  discord_permissions: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

export type DbPresence = {
  id: string;
  user_id: string;
  server_id: string | null;
  name: string;
  payload: PresencePayload;
  is_active: boolean;
  source: 'manual' | 'template' | 'fivem' | 'erlc';
  integration_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

export type DbTemplate = {
  id: string;
  owner_user_id: string;
  name: string;
  description: string | null;
  payload: PresencePayload;
  created_at: Date | string;
  updated_at: Date | string;
};

export type DbPreset = {
  id: string;
  server_id: string;
  name: string;
  description: string | null;
  payload: PresencePayload;
  status: 'draft' | 'published' | 'archived';
  min_role: 'owner' | 'admin' | 'preset_manager' | 'member';
  created_by: string | null;
  published_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

export type DbPresetGrant = {
  id: string;
  preset_id: string;
  user_id: string;
  can_use: boolean;
  created_at: Date | string;
};

export type DbIntegration = {
  id: string;
  owner_user_id: string;
  server_id: string | null;
  kind: 'fivem' | 'erlc';
  label: string;
  config: Record<string, unknown>;
  credentials_encrypted: string | null;
  status: 'manual' | 'connected' | 'error' | 'disabled';
  last_synced_at: Date | string | null;
  last_error: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

export type DbDevice = {
  id: string;
  user_id: string;
  name: string;
  os: string;
  app_version: string | null;
  status: 'pending' | 'linked' | 'revoked';
  pairing_code_hash: string | null;
  pairing_code_expires_at: Date | string | null;
  token_hash: string | null;
  last_seen_at: Date | string | null;
  last_rpc_connected: boolean | null;
  last_applied_presence_id: string | null;
  last_error: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

export type DbActivityLog = {
  id: string;
  user_id: string | null;
  server_id: string | null;
  actor_type: 'user' | 'bot' | 'companion' | 'system';
  action: string;
  message: string;
  metadata: Record<string, unknown> | null;
  ip_hash: string | null;
  created_at: Date | string;
};

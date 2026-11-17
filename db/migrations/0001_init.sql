-- ─────────────────────────────────────────────────────────────────────────────
-- AvenqioPresence — core schema (portable PostgreSQL 15+)
-- Applied automatically in development (embedded PGlite) and on Supabase via
--   npm run db:migrate
-- Row Level Security policies live in db/policies and are applied separately.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── Accounts ─────────────────────────────────────────────────────────────────
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (char_length(display_name) between 1 and 64),
  email text,
  avatar_url text,
  locale text not null default 'en' check (locale in ('en', 'it')),
  preferences jsonb not null default '{}'::jsonb,
  is_dev boolean not null default false,
  active_community_preset_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz
);
drop trigger if exists users_updated_at on users;
create trigger users_updated_at before update on users for each row execute function set_updated_at();

create table if not exists discord_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  discord_user_id text not null unique,
  username text not null,
  global_name text,
  avatar_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists discord_accounts_user_idx on discord_accounts(user_id);
drop trigger if exists discord_accounts_updated_at on discord_accounts;
create trigger discord_accounts_updated_at before update on discord_accounts
  for each row execute function set_updated_at();
-- Note: Discord OAuth access/refresh tokens are intentionally NOT stored.

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  user_agent text,
  ip_hash text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  expires_at timestamptz not null,
  revoked_at timestamptz
);
create index if not exists sessions_user_idx on sessions(user_id);
create index if not exists sessions_expiry_idx on sessions(expires_at);

-- ── Communities ──────────────────────────────────────────────────────────────
create table if not exists discord_servers (
  id uuid primary key default gen_random_uuid(),
  discord_guild_id text not null unique,
  name text not null,
  icon_hash text,
  owner_discord_user_id text,
  member_count integer check (member_count is null or member_count >= 0),
  bot_present boolean not null default false,
  bot_synced_at timestamptz,
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified', 'pending', 'verified', 'rejected')),
  verification_note text,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists discord_servers_updated_at on discord_servers;
create trigger discord_servers_updated_at before update on discord_servers
  for each row execute function set_updated_at();

create table if not exists server_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  server_id uuid not null references discord_servers(id) on delete cascade,
  role text not null default 'member'
    check (role in ('owner', 'admin', 'preset_manager', 'member')),
  discord_permissions text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, server_id)
);
create index if not exists server_memberships_server_idx on server_memberships(server_id);
drop trigger if exists server_memberships_updated_at on server_memberships;
create trigger server_memberships_updated_at before update on server_memberships
  for each row execute function set_updated_at();

-- ── Presences ────────────────────────────────────────────────────────────────
create table if not exists presence_templates (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  description text,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists presence_templates_owner_idx on presence_templates(owner_user_id);
drop trigger if exists presence_templates_updated_at on presence_templates;
create trigger presence_templates_updated_at before update on presence_templates
  for each row execute function set_updated_at();

create table if not exists presences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  server_id uuid references discord_servers(id) on delete set null,
  name text not null check (char_length(name) between 1 and 80),
  payload jsonb not null,
  is_active boolean not null default false,
  source text not null default 'manual'
    check (source in ('manual', 'template', 'fivem', 'erlc')),
  integration_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists presences_user_idx on presences(user_id);
create index if not exists presences_server_idx on presences(server_id);
-- A user can activate exactly one presence at a time.
create unique index if not exists presences_one_active_per_user on presences(user_id) where is_active;
drop trigger if exists presences_updated_at on presences;
create trigger presences_updated_at before update on presences
  for each row execute function set_updated_at();

create table if not exists community_presets (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references discord_servers(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  description text,
  payload jsonb not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  min_role text not null default 'member'
    check (min_role in ('owner', 'admin', 'preset_manager', 'member')),
  created_by uuid references users(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists community_presets_server_idx on community_presets(server_id, status);
drop trigger if exists community_presets_updated_at on community_presets;
create trigger community_presets_updated_at before update on community_presets
  for each row execute function set_updated_at();

-- Per-member overrides on top of min_role (grant or revoke a specific preset).
create table if not exists community_preset_grants (
  id uuid primary key default gen_random_uuid(),
  preset_id uuid not null references community_presets(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  can_use boolean not null default true,
  created_at timestamptz not null default now(),
  unique (preset_id, user_id)
);

-- A community preset can be the user's active presence: the payload is resolved
-- live from the preset row, so centrally updated templates propagate instantly.
alter table users drop constraint if exists users_active_preset_fk;
alter table users add constraint users_active_preset_fk
  foreign key (active_community_preset_id) references community_presets(id) on delete set null;
create index if not exists users_active_preset_idx on users(active_community_preset_id);

-- ── Integrations ─────────────────────────────────────────────────────────────
create table if not exists integrations (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references users(id) on delete cascade,
  server_id uuid references discord_servers(id) on delete set null,
  kind text not null check (kind in ('fivem', 'erlc')),
  label text not null check (char_length(label) between 1 and 60),
  config jsonb not null default '{}'::jsonb,
  credentials_encrypted text,
  status text not null default 'manual'
    check (status in ('manual', 'connected', 'error', 'disabled')),
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists integrations_owner_idx on integrations(owner_user_id);
drop trigger if exists integrations_updated_at on integrations;
create trigger integrations_updated_at before update on integrations
  for each row execute function set_updated_at();

alter table presences
  drop constraint if exists presences_integration_fk;
alter table presences
  add constraint presences_integration_fk
  foreign key (integration_id) references integrations(id) on delete set null;

-- ── Companion devices ────────────────────────────────────────────────────────
create table if not exists companion_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  os text not null default 'windows',
  app_version text,
  status text not null default 'pending' check (status in ('pending', 'linked', 'revoked')),
  pairing_code_hash text,
  pairing_code_expires_at timestamptz,
  token_hash text unique,
  last_seen_at timestamptz,
  last_rpc_connected boolean,
  last_applied_presence_id uuid references presences(id) on delete set null,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists companion_devices_user_idx on companion_devices(user_id);
create index if not exists companion_devices_pairing_idx on companion_devices(pairing_code_hash);
drop trigger if exists companion_devices_updated_at on companion_devices;
create trigger companion_devices_updated_at before update on companion_devices
  for each row execute function set_updated_at();

-- ── Audit trail ──────────────────────────────────────────────────────────────
create table if not exists activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  server_id uuid references discord_servers(id) on delete set null,
  actor_type text not null default 'user' check (actor_type in ('user', 'bot', 'companion', 'system')),
  action text not null,
  message text not null,
  metadata jsonb,
  ip_hash text,
  created_at timestamptz not null default now()
);
create index if not exists activity_logs_user_idx on activity_logs(user_id, created_at desc);
create index if not exists activity_logs_server_idx on activity_logs(server_id, created_at desc);

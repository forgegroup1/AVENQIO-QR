-- ─────────────────────────────────────────────────────────────────────────────
-- Supabase Row Level Security — defence in depth.
--
-- The application talks to Postgres from its own server (never from the browser),
-- and every request is authorised in the service layer. These policies protect the
-- data if the Supabase REST/Realtime surface is ever exposed with the anon key,
-- and they document the intended access model.
--
-- Apply with:  npm run db:policies
-- Requires Supabase's auth schema (auth.uid()).
-- ─────────────────────────────────────────────────────────────────────────────

alter table users enable row level security;
alter table discord_accounts enable row level security;
alter table sessions enable row level security;
alter table discord_servers enable row level security;
alter table server_memberships enable row level security;
alter table presence_templates enable row level security;
alter table presences enable row level security;
alter table community_presets enable row level security;
alter table community_preset_grants enable row level security;
alter table integrations enable row level security;
alter table companion_devices enable row level security;
alter table activity_logs enable row level security;

-- Helpers -------------------------------------------------------------------
create or replace function current_user_id() returns uuid
language sql stable as $$
  select nullif(auth.uid()::text, '')::uuid;
$$;

create or replace function is_server_member(target_server uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from server_memberships m
    where m.server_id = target_server and m.user_id = current_user_id()
  );
$$;

create or replace function can_manage_server(target_server uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from server_memberships m
    where m.server_id = target_server
      and m.user_id = current_user_id()
      and m.role in ('owner', 'admin', 'preset_manager')
  );
$$;

-- Users ---------------------------------------------------------------------
drop policy if exists users_select_self on users;
create policy users_select_self on users for select using (id = current_user_id());
drop policy if exists users_update_self on users;
create policy users_update_self on users for update using (id = current_user_id()) with check (id = current_user_id());

-- Discord accounts ----------------------------------------------------------
drop policy if exists discord_accounts_self on discord_accounts;
create policy discord_accounts_self on discord_accounts for select using (user_id = current_user_id());

-- Sessions / devices / credentials are server-only --------------------------
-- No policies are created: with RLS enabled and no policy, anon/authenticated
-- clients can never read session tokens or device secrets.

-- Servers -------------------------------------------------------------------
drop policy if exists servers_select_member on discord_servers;
create policy servers_select_member on discord_servers for select
  using (is_server_member(id));

drop policy if exists servers_update_admin on discord_servers;
create policy servers_update_admin on discord_servers for update
  using (can_manage_server(id)) with check (can_manage_server(id));

-- Memberships ---------------------------------------------------------------
drop policy if exists memberships_select_member on server_memberships;
create policy memberships_select_member on server_memberships for select
  using (is_server_member(server_id));

drop policy if exists memberships_update_admin on server_memberships;
create policy memberships_update_admin on server_memberships for update
  using (can_manage_server(server_id)) with check (can_manage_server(server_id));

-- Personal presences --------------------------------------------------------
drop policy if exists presences_owner_all on presences;
create policy presences_owner_all on presences for all
  using (user_id = current_user_id()) with check (user_id = current_user_id());

drop policy if exists templates_owner_all on presence_templates;
create policy templates_owner_all on presence_templates for all
  using (owner_user_id = current_user_id()) with check (owner_user_id = current_user_id());

-- Community presets: readable by members, writable by managers ---------------
drop policy if exists presets_select_member on community_presets;
create policy presets_select_member on community_presets for select
  using (status = 'published' and is_server_member(server_id) or can_manage_server(server_id));

drop policy if exists presets_write_manager on community_presets;
create policy presets_write_manager on community_presets for insert
  with check (can_manage_server(server_id));

drop policy if exists presets_update_manager on community_presets;
create policy presets_update_manager on community_presets for update
  using (can_manage_server(server_id)) with check (can_manage_server(server_id));

drop policy if exists preset_grants_select on community_preset_grants;
create policy preset_grants_select on community_preset_grants for select
  using (
    user_id = current_user_id()
    or exists (
      select 1 from community_presets p
      where p.id = preset_id and can_manage_server(p.server_id)
    )
  );

-- Integrations --------------------------------------------------------------
drop policy if exists integrations_owner_all on integrations;
create policy integrations_owner_all on integrations for all
  using (owner_user_id = current_user_id()) with check (owner_user_id = current_user_id());

-- Activity logs: users see their own, managers see their community's ---------
drop policy if exists activity_select_own on activity_logs;
create policy activity_select_own on activity_logs for select
  using (user_id = current_user_id() or (server_id is not null and can_manage_server(server_id)));

-- Insert-only audit trail from authenticated sessions
drop policy if exists activity_insert_own on activity_logs;
create policy activity_insert_own on activity_logs for insert
  with check (user_id = current_user_id());

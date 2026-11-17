# AvenqioPresence — delivery report

**Company:** Avenqio · **Product:** AvenqioPresence (Discord Rich Presence management)
**Repository:** `forgegroup1/AVENQIO-QR`, branch `arena/ba0b33c2-avenqio-qr`
**Verified on:** Node 22.22, Linux sandbox (no Discord client, no Windows, no PostgreSQL server)

---

## 1. Project structure

```
package.json                 npm workspaces; dev/build/test/bot/companion scripts
tsconfig.base.json           strict TS baseline (noUncheckedIndexedAccess)
.env.example                 complete template (placeholders only)
db/migrations/0001_init.sql  schema: 15 tables, indexes, one-active presence partial unique index
db/policies/0001_rls.sql     RLS policies for Supabase/hosted PostgreSQL
packages/shared/src/         contracts shared by dashboard, bot and companion:
                             limits.ts, presence.ts, presence-modifiers.ts, discord.ts, roles.ts,
                             integrations.ts, api.ts
apps/web/                    Next.js 15.5.29 App Router + React 19.3 + Tailwind v4 + zod
  src/app/                   24 routes: marketing, login, docs, dashboard (overview, presences,
                             presences/new, presences/[id], communities, communities/[id],
                             integrations, settings, admin) and 30 API route handlers
  src/components/            design system (button/form/display/overlay/tabs), presence editor,
                             Discord preview, communities, integrations, settings, admin queue
  src/server/                config, env loader, db driver, session/auth, http helpers (errors,
                             respond, rate limit, origin), services, integrations, validation
apps/companion/              Electron 33 + TS tray app, esbuild bundle, electron-builder config,
                             core/ (pure, unit-tested), renderer (HTML/CSS/JS, sandboxed)
services/discord-bot/        discord.js 14 bot: config validation, API client, slash commands, logging
scripts/                     db CLI, seed, env loader, production start helper
tests/smoke.mjs              73-assertion end-to-end HTTP suite
legacy/qr-studio/            previous app preserved untouched for reference
```

## 2. Implemented features

**Dashboard (working, no dead buttons)**

* Discord OAuth2 sign-in (state cookie, server-side code exchange, guild import limited to guilds the
  user can manage) and a development picker that is disabled in production.
* Overview: welcome, account info, connected servers, active presence resolution, companion status
  (device seen in the last 5 minutes), recent activity, stat cards.
* My Presences: create/edit/duplicate/delete/activate/deactivate, live Discord preview, validation
  with field-level messages, editor warnings, save-as-template and create-from-template.
* Presence editor fields: application name, activity type, details, state, large/small image with
  tooltips and source validation, start/end timestamps (elapsed, range, or none), party size,
  up to two buttons with https URL validation, templates.
* Communities: connected servers, per-server configuration, member list with role management
  (owner > admin > preset_manager > member, no self-edits), verification request/status, community
  presets with publish/revoke, per-member grants/revocations, and "activate preset".
* Integrations: Discord, Windows Companion (pairing, device list, revoke), FiveM, ER:LC, plus the
  community tab. Automated data is clearly marked unavailable where no verified source exists and
  falls back to manual configuration.
* Settings: profile (display name, locale), preferences (editor + notification toggles), security
  (sessions, revoke, sign out everywhere), connected devices (pairing codes, revoke), notifications.
  Deep-linkable via `?tab=security`.
* Staff verification queue (404 for non-staff), error boundary, empty states, skeletons, toasts,
  collapsible sidebar, responsive layout, dark purple design system.

**Bot (single central official bot)**

* Validated configuration with actionable startup errors, structured redacting logger, graceful
  shutdown.
* Slash commands `/avenqio status|presets|link|verify`; guild-scoped registration for development.
* Guild sync on ready/join/update, removal flagging, service-token-only API calls
  (`/api/bot/sync-guild`, `/api/bot/leave-guild`, `/api/bot/communities/:guildId`).
* Explicitly no per-user presence capability — the bot only manages community data.

**Companion (Electron + TypeScript)**

* Pairing flow with the 8-character single-use code, device token stored through Windows DPAPI
  (`safeStorage`), in-memory-only fallback.
* Local Discord RPC via `@xhayper/discord-rpc`: connect/reconnect with backoff, apply changed payloads
  only (fingerprint diffing), clear presence, publish presets from the tray.
* Backend sync loop, heartbeat with RPC state, revoked-token handling, tray menu, start with Windows,
  minimize to tray, settings, update check, rotating log file, activity log viewer.
* Sandboxed renderer (`contextIsolation`, `sandbox`, CSP, no Node integration, navigation blocked).

## 3. Features that need external credentials or a Windows host

| Feature | Needs |
| --- | --- |
| Real Discord sign-in and server import | `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, redirect URI |
| Bot online / slash commands | `DISCORD_BOT_TOKEN`, Server Members intent, invite with `applications.commands` |
| Rich Presence actually appearing in Discord | Discord desktop client running + `DISCORD_RPC_CLIENT_ID` + companion built on Windows |
| ER:LC automated data | ERLC PRC API server pack + `Server-Key` stored per integration |
| FiveM automated data | public `info.json` / `players.json` endpoint on the user's server |
| Automatic updates | signed installer + JSON update feed URL |
| Community verification | Avenqio staff Discord ids in `AVENQIO_ADMIN_DISCORD_IDS` |

## 4. Database setup

* One PostgreSQL dialect, two transports: PGlite (embedded, WASM, `.data/pglite`) for local/test and
  any PostgreSQL 15+ (Supabase) in production (`DB_DRIVER=postgres`, `DATABASE_URL`, `PGSSL`).
* `npm run db:reset` → drop, migrate, seed. `db:policies` applies RLS for hosted PostgreSQL.
* Tables: users, discord_accounts, discord_servers, server_memberships, presences,
  presence_templates, community_presets, community_preset_grants, integrations, companion_devices,
  pairing_codes, sessions, activity_logs, verification_requests.
* Guarantees enforced in SQL: one active presence per user (partial unique index), one active preset
  per user, unique `(preset, user)` grants, hashed session/device/pairing tokens.
* RLS is declared for Supabase but cannot run on PGlite; the application layer authorises every
  request independently, which is the real gate.

## 5. Local development

```bash
npm install
cp .env.example .env.local        # set APP_ENCRYPTION_KEY and BOT_SERVICE_TOKEN
npm run db:reset
npm run dev                        # http://localhost:3000
npm test                           # 35 unit tests
npm run test:smoke                 # 73 HTTP assertions (server must be running)
npm run bot                        # optional, needs DISCORD_BOT_TOKEN
```

The root `.env.local` is loaded by the web app (instrumentation + config), the bot, the companion
build and `npm start`, so a single file configures all three components.

## 6. Windows companion build

```bash
npm run companion:build      # esbuild → apps/companion/dist (main.cjs, preload.cjs, renderer, icon)
npm run companion:package    # electron-builder → NSIS installer + portable .exe
```

`companion:build` was executed successfully here. Packaging and RPC runtime behaviour require a
Windows host with the Electron binary and a running Discord client; this sandbox has neither
(Electron was installed with `ELECTRON_SKIP_BINARY_DOWNLOAD=1`), so those two steps are documented
rather than claimed as verified.

## 7. Test results

| Suite | Result |
| --- | --- |
| `npm run typecheck` (web, bot, companion, shared) | pass |
| `npm test` (Vitest) | 35/35 pass — payload limits, RPC mapping, editor warnings, preset access matrix, companion resolution/fingerprint/backoff/settings/update-feed |
| `node tests/smoke.mjs` | **73/73 pass** — public pages, auth, isolation (404s), role gates, presets, templates, companion, bot, CSRF, SSRF, rate limit, page rendering, staff 404, cleanup |
| `npm run build` (shared + web) | pass (24 routes, middleware 34.6 kB) |
| `npm run companion:build` | pass (main 678 kB, preload 760 B) |
| `npm run bot -- --print-commands` | pass (command JSON emitted) |

Two real defects were found and fixed during testing: a self-deadlocking transaction (audit log written
outside the open transaction on a single-connection embedded database) and a soft-404 caused by a
route-level `loading.tsx` (replaced by in-page Suspense + segment skeletons so cross-account resources
return a true 404).

## 8. Known limitations / next steps

1. **Presence is local by design** — the companion must run; the server never claims to change it.
2. **Distributed rate limiting** — current limiter is per process; move to Redis for multi-instance.
3. **Companion verification on Windows** — package, code-sign and test RPC against a real client, then
   publish a release feed for automatic updates.
4. **Email/push notifications** — preferences persist, but no transport is configured.
5. **RLS enforcement** — run `db:policies` on Supabase and give the app a per-user connection (or
   `SET LOCAL role`/claims) if database-level isolation is required in addition to the service layer.
6. **Integration breadth** — only FiveM and ER:LC have verified endpoints; new adapters should follow
   `integrations/registry.ts` and must ship with a verifiable data source.
7. **Accessibility pass** — keyboard flows and focus states exist, but a full audit (screen reader,
   contrast on the Discord preview) is still worthwhile.

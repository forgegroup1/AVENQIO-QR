# AvenqioPresence

Discord Rich Presence, managed. AvenqioPresence is a three-part product:

| Component | Path | What it does |
| --- | --- | --- |
| **Web dashboard** | `apps/web` | Next.js 15 app: Discord sign-in, presence editor with live preview, communities, presets, integrations, settings, audit trail, staff verification queue. |
| **Official Discord bot** | `services/discord-bot` | One centralised bot (never one per customer). Syncs community metadata, serves `/avenqio` commands, and gates everything through server-side checks. |
| **Windows companion** | `apps/companion` | Electron + TypeScript tray app that publishes the selected presence through the **local** Discord IPC connection. |

> Rich Presence can only be changed by a process running on the same machine as the Discord client.
> The dashboard and the bot therefore never publish a presence themselves — they store, validate and
> resolve configurations, and the companion is the only component that talks to Discord RPC.

---

## 1. Quick start (no Discord credentials needed)

```bash
npm install
cp .env.example .env.local      # then set APP_ENCRYPTION_KEY and BOT_SERVICE_TOKEN
npm run db:reset                # create schema + seed local fixtures
npm run dev                     # http://localhost:3000
```

`db:reset` creates an embedded PostgreSQL (PGlite) database in `.data/pglite`, applies
`db/migrations`, and seeds two development accounts (the dev picker on `/login` lists them).

Generate the two mandatory secrets:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # APP_ENCRYPTION_KEY
openssl rand -hex 32                                                          # BOT_SERVICE_TOKEN
```

Development sign-in (`ALLOW_DEV_AUTH=true`) exists so the product can be evaluated and tested without
a Discord application. It is **not** an authentication factor and is refused whenever
`NODE_ENV=production`. For a public deployment set `ALLOW_DEV_AUTH=false` and configure the Discord
OAuth2 credentials below.

### Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Next.js dev server on `0.0.0.0:3000` |
| `npm run build` / `npm start` | Production build / start (loads the root `.env.local`) |
| `npm run db:migrate` / `db:seed` / `db:reset` / `db:policies` | Database lifecycle |
| `npm test` | Unit tests (Vitest): payload validation, preset access rules, companion logic |
| `npm run test:smoke` | End-to-end HTTP suite against a running server (73 assertions) |
| `npm run bot` | Start the official Discord bot |
| `npm run companion` / `companion:build` | Companion dev bundle / production bundle |
| `npm run companion:package` | Windows installers (`electron-builder`, run on Windows) |
| `npm run typecheck` | TypeScript for every workspace |

---

## 2. Project structure

```
apps/
  web/                     Next.js dashboard + API routes
    src/app/               pages (marketing, login, dashboard/*, docs) and API routes
      api/auth/*           Discord OAuth2 start/callback, session, logout, dev sign-in
      api/v1/*             user + community API (presences, templates, communities, presets,
                           members, devices, integrations, profile, admin)
      api/companion/*      device pairing, state, heartbeat, selection
      api/bot/*            bot-to-server sync, guild metadata, guild removal
    src/components/        design system (ui/*), presence editor, community, settings, admin
    src/server/            config, db driver, auth, http helpers, services, integrations, validation
  companion/               Electron main/preload/renderer, electron-builder.yml, build script
services/
  discord-bot/             discord.js bot: command registration, guild sync, logging
packages/
  shared/                  contracts shared by all three apps (payload schema, limits, roles, DTOs)
db/
  migrations/0001_init.sql schema (PostgreSQL, Supabase compatible)
  policies/0001_rls.sql    RLS policies for hosted PostgreSQL
scripts/                   db CLI, seed data, env loader, production start helper
tests/smoke.mjs            end-to-end HTTP suite
legacy/qr-studio/          previous QR Studio app, kept for reference only
```

---

## 3. Environment

Everything is configured by one file: the repository-root `.env.local` (created from `.env.example`).
The web app loads it from `apps/web/src/server/env.ts` at server start, the bot and the companion
build script read the same file, and `scripts/start.mjs` forwards it to `next start`.

Required for a complete deployment:

| Variable | Purpose |
| --- | --- |
| `APP_URL` | Public origin; used for OAuth redirects, cookies, links |
| `DB_DRIVER`, `DATABASE_URL`, `PGSSL` | `embedded` (PGlite) or `postgres` (Supabase, any PG 15+) |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_REDIRECT_URI` | OAuth2 sign-in and server import |
| `DISCORD_BOT_TOKEN` | Official bot login |
| `BOT_SERVICE_TOKEN` | Shared secret for bot → API calls |
| `APP_ENCRYPTION_KEY` | AES-256-GCM key for stored integration credentials |
| `AVENQIO_ADMIN_DISCORD_IDS` | Comma-separated Discord ids allowed to open the staff queue |
| `DISCORD_RPC_CLIENT_ID` | Discord application id used for local Rich Presence (inlined into the companion at build time) |

Optional: `DISCORD_BOT_INVITE_URL`, `DISCORD_DEV_GUILD_ID`, `BOT_API_URL`, `BOT_LOG_LEVEL`,
`COMPANION_API_URL`, `COMPANION_UPDATE_FEED_URL`, `OPS_TOKEN`, `ERLC_API_BASE_URL`,
`ALLOW_PRIVATE_INTEGRATION_TARGETS`, `ALLOW_DEV_AUTH`.

---

## 4. Discord application setup

1. Create an application at <https://discord.com/developers/applications>.
2. **OAuth2** → copy *Client ID* / *Client Secret*; add the redirect
   `{APP_URL}/api/auth/discord/callback`. Scopes used: `identify`, `guilds`.
3. **Bot** → *Reset Token*, put it in `DISCORD_BOT_TOKEN`; enable **Server Members Intent**
   (used by `/avenqio verify` to check Manage Server).
4. Invite the bot with the `bot` + `applications.commands` scopes. It needs no administrative
   permission — it reads guild metadata and answers slash commands.
5. Rich Presence artwork is uploaded under **Rich Presence → Art Assets**; the asset key is what the
   editor stores in `largeImage.source` / `smallImage.source`.
6. The companion connects over local IPC using the same application id (`DISCORD_RPC_CLIENT_ID`).
   Both the app and the user's Discord client must be running.

---

## 5. Database

One SQL dialect, two transports (`apps/web/src/server/db/index.ts`):

* **embedded** — PGlite (PostgreSQL compiled to WASM), zero setup, used for development and tests.
* **postgres** — any PostgreSQL 15+, including Supabase, selected with `DB_DRIVER=postgres`.

Migrations are plain PostgreSQL and are applied automatically on boot (`AUTO_MIGRATE=false` to
disable):

```bash
npm run db:migrate      # apply db/migrations
npm run db:policies     # apply db/policies (RLS) — hosted PostgreSQL / Supabase only
npm run db:seed         # local fixtures
npm run db:reset        # drop + migrate + seed
```

Tables: `users`, `discord_accounts`, `discord_servers`, `server_memberships`, `presences`,
`presence_templates`, `community_presets`, `community_preset_grants`, `integrations`,
`companion_devices`, `pairing_codes`, `sessions`, `activity_logs`, `verification_requests`.

For Supabase:

1. Set `DB_DRIVER=postgres`, `DATABASE_URL=postgresql://…`, `PGSSL=require`.
2. Run migrations (they are Supabase-safe: `gen_random_uuid()` is built in, no extensions required).
3. Run `npm run db:policies`. RLS is enabled with owner-scoped policies; the app still authorises
   server-side on every request, because the service connection is not a user session.

Seeded accounts are development fixtures only; a production database starts empty and real accounts
are created on the first Discord sign-in.

---

## 6. Rich Presence model

* One zod schema (`packages/shared/src/presence.ts`) is used by the editor, the API and the tests.
* Limits follow Discord: 128 chars for application name/details/state, 128 for tooltips, 32 for
  button labels, 512 for image sources and button URLs, 2 buttons, party ≤ 1000, 8 KB payload.
* `null` hides a field; the preview, the API and the RPC mapping all treat it the same way.
* `toRpcActivity()` is the only payload → RPC mapping used for documentation and tests; the
  companion maps the same payload to `@xhayper/discord-rpc` in `apps/companion/src/core/activity.ts`.
* Timestamps are epoch **milliseconds**.
* Activation is exclusive: activating a personal presence clears the active community preset and
  vice versa (enforced by a partial unique index plus the service layer).

### Community presets

Presets belong to a community, are published centrally, and resolve live: when a manager edits a
published preset, every member's companion picks the new version up on the next sync. Access is one
tested rule (`computePresetAccess`):

1. only published presets are usable;
2. an explicit per-member revoke wins;
3. an explicit per-member grant overrides the minimum role;
4. otherwise the member's role must reach the preset's `min_role`
   (`owner > admin > preset_manager > member`).

Verification is what prevents impersonation: the `verified` badge shown next to a preset is derived
from the community's `verification_status`, which only Avenqio staff can approve in
`/dashboard/admin`.

---

## 7. Official bot

```bash
npm run bot                 # connects, registers commands, syncs guilds
npm run bot -- --print-commands
```

* `avenqio.status` — community summary (verification, published presets, linked accounts).
* `avenqio.presets` — published presets and their minimum role.
* `avenqio.link` — how to pair the Windows companion.
* `avenqio.verify` — verification status and how to request it (Manage Server only).

On start, on guild join/update and on guild removal the bot calls
`POST /api/bot/sync-guild` / `POST /api/bot/leave-guild` with `Authorization: Bearer $BOT_SERVICE_TOKEN`.
Those routes are service-only: no cookie auth, no user impersonation, and they never return OAuth
tokens. The bot has no per-user presence capability by design.

---

## 8. Windows companion

```bash
npm run companion:build     # bundle main + preload + renderer into apps/companion/dist
npm run companion:package   # electron-builder: NSIS installer + portable .exe (run on Windows)
```

Packaging needs a Windows host (or a Windows CI runner) — `electron-builder` and the Electron binary
are not installed in this environment (`ELECTRON_SKIP_BINARY_DOWNLOAD=1`).

What it does:

* secure pairing: 8-character single-use code (10-minute TTL) → long-lived device token, stored with
  Windows DPAPI via Electron `safeStorage`; if OS encryption is unavailable the token is kept in
  memory only;
* polls `/api/companion/state` every 30 s (configurable by the server), applies the resolved presence
  to the local Discord client, and sends heartbeats with the RPC status;
* tray menu, start with Windows, minimize-to-tray, auto-publish toggle, update check, activity log;
* renderer runs with `contextIsolation`, `sandbox`, no Node integration, a strict CSP, and only the
  IPC surface defined in `src/preload.ts`;
* never stores or asks for a Discord password, and never receives OAuth secrets.

Automatic updates are only real when a signed release feed exists: set `COMPANION_UPDATE_FEED_URL`
to a JSON endpoint (`{"version":"0.1.1","url":"https://…","notes":"…"}`). Without it the app says
"automatic updates are not configured" instead of pretending.

---

## 9. Game integrations

`apps/web/src/server/integrations/` contains one adapter interface, an SSRF-guarded HTTP client and
two verifiable adapters:

| Integration | Automated data | Status |
| --- | --- | --- |
| **FiveM** | `GET {base}/info.json` (`sv_maxclients`, `sv_projectName`) and `/players.json` | works with a public server endpoint; player-level data stays manual |
| **Emergency Response: Liberty County** | `GET {base}/v1/server` and `/v1/server/players` with the `Server-Key` header | requires the ERLC PRC API server pack — `requires-credentials` until a key is stored |

Both are marked `requires-credentials` in the registry: the dashboard shows *automated data
unavailable* and offers **manual configuration** (server name, character name, role/job, duty status,
server info). No API is invented, and nothing is scraped.

Credentials (the ER:LC `Server-Key`) are encrypted with AES-256-GCM (`APP_ENCRYPTION_KEY`) and never
returned to the browser. Outbound calls refuse non-HTTP(S) URLs, embedded credentials, redirects,
private/loopback/link-local targets (unless `ALLOW_PRIVATE_INTEGRATION_TARGETS=true`), and responses
over 512 KB.

---

## 10. Security model

* **Sessions** — random 32-byte tokens, stored SHA-256 hashed, delivered in an `httpOnly`,
  `SameSite=Lax` cookie (`Secure` in production), 30-day TTL, revocable per device.
* **Authorization** — every API route resolves the session server-side and scopes queries by
  `user_id`; resources belonging to someone else return **404**, never 403, so ids cannot be probed.
  Community actions re-check roles in an ordered rank with no self-edits.
* **CSRF** — cookie-authenticated mutations require a same-origin `Origin`/`Referer`;
  bearer-authenticated endpoints (bot, companion) are exempt and cannot be called from a browser
  session.
* **Rate limiting** — fixed-window per process for auth, silent pairing, presence activation,
  companion state and bot sync, plus a generic API limit.
* **Secrets** — no key is hardcoded; integration credentials are AES-256-GCM encrypted; tokens are
  hashed; Discord OAuth access tokens are used transiently and never stored.
* **Input validation** — zod schemas on every route, including length limits derived from Discord
  and from `DISCORD_LIMITS`.
* **Audit trail** — `activity_logs` records sign-in, presence/preset changes, pairing, revocation and
  verification decisions with actor type and hashed IPs.
* **Dev sign-in** — disabled in production; staff pages return a real 404 for non-staff accounts.

Known deviation: with `DB_DRIVER=embedded` RLS cannot be enforced (single privileged connection), so
authorization lives in the service layer. With Supabase, run `db:policies` to add defence in depth.

---

## 11. Tests

```bash
npm test                         # 35 unit tests
npm run dev & npm run test:smoke # 73 end-to-end assertions
```

The smoke suite (`tests/smoke.mjs`) exercises public pages, dev sign-in, session cookies, trip-wire
validation, presence CRUD and the one-active rule, cross-account 404 isolation, community role gates,
preset publish/access/revoke/activate, templates, companion pairing and revocation, bot service-token
routes, CSRF origin checks, SSRF refusal, rate limiting, authenticated page rendering and the staff
404. It cleans up the rows it creates.

---

## 12. Limitations & next steps

* **Presence publishing is local by design.** A user must run the companion; the dashboard cannot and
  does not claim otherwise.
* **Automatic updates** need a signed installer + feed; the code checks a feed and never fakes it.
* **FiveM / ER:LC player data** is manual unless a verified endpoint is configured; ER:LC needs the
  paid API server pack.
* **Rate limiting is per process** — fine for a single instance, replace with Redis for horizontal
  scaling.
* **No team/organisation billing, no email delivery** (notification preferences are stored and shown,
  but no mail transport is configured).
* **Companion packaging and RPC behaviour must be verified on Windows**; this environment has no
  Electron binary and no Discord client.

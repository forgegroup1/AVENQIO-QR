import Link from 'next/link';
import { BrandLockup } from '@/components/layout/brand';
import { Badge, Callout, Card, CardBody, CardHeader } from '@/components/ui/display';
import { ButtonLink } from '@/components/ui/button';
import { IconArrowRight, IconExternal, IconInfo, IconTerminal } from '@/components/icons';

export const metadata = { title: 'Documentation' };

const SECTIONS = [
  { id: 'quickstart', label: 'Quick start' },
  { id: 'discord-oauth', label: 'Discord OAuth2' },
  { id: 'database', label: 'Database' },
  { id: 'bot', label: 'Discord bot' },
  { id: 'companion', label: 'Windows companion' },
  { id: 'api', label: 'API surface' },
  { id: 'security', label: 'Security notes' },
  { id: 'limits', label: 'Known limitations' },
];

function Step({ index, title, children }: { index: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-brand/40 bg-brand/10 text-[11px] font-semibold text-brand-soft">
        {index}
      </span>
      <div className="min-w-0 space-y-1">
        <p className="text-[13px] font-medium text-ink">{title}</p>
        <div className="text-[12.5px] leading-relaxed text-ink-muted">{children}</div>
      </div>
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <pre className="mt-1 overflow-x-auto rounded-lg border border-line bg-[#08060d] px-3 py-2 font-mono text-[11.5px] leading-relaxed text-ink-soft">
      {children}
    </pre>
  );
}

export default function DocsPage() {
  return (
    <div className="relative min-h-screen">
      <div className="grid-lines pointer-events-none absolute inset-x-0 top-0 h-[320px] opacity-40" aria-hidden="true" />
      <header className="relative z-10 mx-auto flex max-w-5xl items-center justify-between px-5 py-5 sm:px-8">
        <BrandLockup href="/" />
        <div className="flex items-center gap-2">
          <ButtonLink href="/dashboard" variant="ghost" size="sm">
            Dashboard
          </ButtonLink>
          <ButtonLink href="/login" size="sm">
            Sign in
          </ButtonLink>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-5xl px-5 pb-20 sm:px-8">
        <div className="pt-8">
          <Badge tone="brand">Documentation</Badge>
          <h1 className="mt-4 text-[32px] font-semibold tracking-tight text-ink sm:text-[38px]">
            Run AvenqioPresence locally.
          </h1>
          <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-ink-muted">
            The dashboard runs with an embedded PostgreSQL (PGlite) and seeded development accounts, so you can
            evaluate the product before creating a Discord application. Every external dependency is optional
            until you need it.
          </p>
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[180px_1fr]">
          <nav className="hidden lg:block">
            <div className="sticky top-6 space-y-1">
              {SECTIONS.map((section) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  className="block rounded-md px-2 py-1.5 text-[12.5px] text-ink-muted transition-colors hover:bg-elevated hover:text-ink-soft"
                >
                  {section.label}
                </a>
              ))}
            </div>
          </nav>

          <div className="min-w-0 space-y-6">
            <Card id="quickstart">
              <CardHeader title="Quick start" description="Node 22.6 or newer." icon={<IconTerminal className="h-4 w-4" />} />
              <CardBody className="space-y-4">
                <Code>{`git clone <this repository>
cd AVENQIO-QR
npm install
cp .env.example .env.local     # defaults work for local development
npm run db:reset               # migrate + insert development fixtures
npm run dev                    # http://localhost:3000`}</Code>
                <p className="text-[12.5px] leading-relaxed text-ink-muted">
                  Sign in from <code>/login</code> using one of the seeded development accounts. The dashboard
                  shows a permanent development banner while you are on a fixture account.
                </p>
                <Callout tone="warning" icon={<IconInfo className="h-4 w-4" />} title="Before any public deployment">
                  Set <code>ALLOW_DEV_AUTH=false</code>, use <code>DB_DRIVER=postgres</code> with a real
                  PostgreSQL database, and configure Discord OAuth2.
                </Callout>
              </CardBody>
            </Card>

            <Card id="discord-oauth">
              <CardHeader title="Discord OAuth2" description="Required for real sign-in and communities." />
              <CardBody className="space-y-4">
                <Step index={1} title="Create an application">
                  In the <a className="text-brand-soft hover:text-ink" href="https://discord.com/developers/applications" target="_blank" rel="noreferrer noopener">Discord Developer Portal</a>,
                  create an application. Copy the <em>Application ID</em> and <em>OAuth2 Client Secret</em>.
                </Step>
                <Step index={2} title="Add the redirect URI">
                  OAuth2 → Redirects → add <code>http://localhost:3000/api/auth/discord/callback</code> (and your
                  production URL when you deploy).
                </Step>
                <Step index={3} title="Configure the environment">
                  <Code>{`DISCORD_CLIENT_ID=...
DISCORD_CLIENT_SECRET=...
DISCORD_REDIRECT_URI=http://localhost:3000/api/auth/discord/callback
APP_URL=http://localhost:3000`}</Code>
                </Step>
                <Step index={4} title="Sign in">
                  The app requests <code>identify</code> and <code>guilds</code>. The OAuth token is used for two
                  API calls and discarded — it is never written to the database.
                </Step>
                <p className="text-[12px] leading-relaxed text-ink-muted">
                  Communities are imported from guilds where you are owner, administrator or hold{' '}
                  <code>Manage Server</code>. Sign in again after permission changes to refresh the list.
                </p>
              </CardBody>
            </Card>

            <Card id="database">
              <CardHeader title="Database" description="One PostgreSQL schema, two transports." />
              <CardBody className="space-y-4">
                <p className="text-[12.5px] leading-relaxed text-ink-muted">
                  Local development uses <strong className="text-ink-soft">PGlite</strong> — PostgreSQL compiled to
                  WebAssembly, persisted in <code>./.data/pglite</code>. Production uses any PostgreSQL 15+,
                  including Supabase. The schema, queries and migrations are identical.
                </p>
                <Step index={1} title="Point the app at Postgres">
                  <Code>{`DB_DRIVER=postgres
DATABASE_URL=postgresql://postgres:<password>@db.<project>.supabase.co:5432/postgres
PGSSL=require`}</Code>
                </Step>
                <Step index={2} title="Apply the schema">
                  <Code>{`npm run db:migrate`}</Code>
                </Step>
                <Step index={3} title="Optional: apply Supabase RLS policies">
                  <Code>{`npm run db:policies`}</Code>
                  The application authorises every request server-side; the policies in{' '}
                  <code>db/policies/0001_rls.sql</code> are defence in depth for Supabase’s REST surface.
                </Step>
                <p className="text-[12px] leading-relaxed text-ink-muted">
                  Entities: <code>users</code>, <code>discord_accounts</code>, <code>discord_servers</code>,{' '}
                  <code>server_memberships</code>, <code>presences</code>, <code>presence_templates</code>,{' '}
                  <code>community_presets</code>, <code>community_preset_grants</code>, <code>integrations</code>,{' '}
                  <code>companion_devices</code>, <code>sessions</code>, <code>activity_logs</code>.
                </p>
              </CardBody>
            </Card>

            <Card id="bot">
              <CardHeader title="Discord bot" description="One central bot for every server." />
              <CardBody className="space-y-4">
                <Code>{`# .env.local
DISCORD_BOT_TOKEN=...
BOT_SERVICE_TOKEN=$(openssl rand -hex 32)
DISCORD_CLIENT_ID=...

npm run bot   # registers slash commands and connects`}</Code>
                <p className="text-[12.5px] leading-relaxed text-ink-muted">
                  The bot authenticates to the dashboard with <code>BOT_SERVICE_TOKEN</code> and syncs guild
                  metadata. It exposes <code>/community</code>, <code>/presets</code>, <code>/link</code> and{' '}
                  <code>/presence</code>. It never changes a member’s Discord presence.
                </p>
                <p className="text-[12px] leading-relaxed text-ink-muted">
                  Without a bot token, run <code>npm run bot -- --print-commands</code> to inspect the command
                  definitions the service would register.
                </p>
              </CardBody>
            </Card>

            <Card id="companion">
              <CardHeader title="Windows companion" description="Electron + TypeScript, packaged as a portable executable." />
              <CardBody className="space-y-4">
                <Code>{`npm run companion:build      # bundles main/preload/renderer into apps/companion/dist
npm run companion            # starts Electron against the local build
npm run companion:package    # electron-builder -> portable .exe (Windows host)`}</Code>
                <Step index={1} title="Pair the device">
                  Dashboard → Settings → Devices → <em>Generate pairing code</em>.
                </Step>
                <Step index={2} title="Connect in the app">
                  Enter the API base URL (e.g. <code>http://localhost:3000</code>) and the 8-character code. The
                  app stores the returned device token with Electron <code>safeStorage</code>.
                </Step>
                <Step index={3} title="Discord must be running">
                  The companion connects to the local Discord IPC socket using the application id from{' '}
                  <code>DISCORD_CLIENT_ID</code> (or <code>DISCORD_RPC_CLIENT_ID</code>). Test with
                  “Connect Discord” in the app; presence updates only flow while Discord desktop is open.
                </Step>
                <Callout tone="neutral" icon={<IconInfo className="h-4 w-4" />}>
                  Asset keys used in a presence must exist under <em>Rich Presence → Art Assets</em> for that
                  Discord application. External https image URLs are passed through unchanged.
                </Callout>
              </CardBody>
            </Card>

            <Card id="api">
              <CardHeader title="API surface" description="All JSON, all authenticated." />
              <CardBody>
                <div className="space-y-2 font-mono text-[11.5px] text-ink-muted">
                  {[
                    ['GET', '/api/health', 'liveness + database readiness'],
                    ['GET', '/api/auth/discord/start', 'OAuth2 redirect'],
                    ['GET', '/api/auth/discord/callback', 'code exchange + guild sync'],
                    ['POST', '/api/auth/dev', 'development sign-in (flag-gated)'],
                    ['GET|POST', '/api/v1/presences', 'list / create'],
                    ['GET|PATCH|DELETE', '/api/v1/presences/:id', 'read / update / delete (owner only)'],
                    ['POST', '/api/v1/presences/:id/activate', 'single active presence'],
                    ['GET|POST', '/api/v1/communities/:id/presets', 'preset catalogue'],
                    ['PUT', '/api/v1/communities/:id/presets/:presetId/access', 'role + per-member overrides'],
                    ['GET|POST', '/api/v1/integrations', 'adapters and credentials'],
                    ['POST', '/api/companion/link', 'pairing code → device token'],
                    ['GET', '/api/companion/state', 'bearer device token'],
                    ['POST', '/api/bot/sync-guild', 'bot service token'],
                  ].map(([method, path, description]) => (
                    <div key={path} className="flex flex-wrap items-baseline gap-2">
                      <span className="w-[110px] shrink-0 text-brand-soft">{method}</span>
                      <span className="text-ink-soft">{path}</span>
                      <span className="text-ink-muted">— {description}</span>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>

            <Card id="security">
              <CardHeader title="Security notes" />
              <CardBody className="space-y-2 text-[12.5px] leading-relaxed text-ink-muted">
                <p>• Session tokens are 32 random bytes; only SHA-256 hashes are stored. Cookies are HttpOnly, SameSite=Lax, and Secure over HTTPS.</p>
                <p>• Every community read goes through your membership; other ids return 404 rather than 403 to avoid leaking existence.</p>
                <p>• Discord OAuth tokens are never persisted. Integration credentials use AES-256-GCM with <code>APP_ENCRYPTION_KEY</code>.</p>
                <p>• Cookie-authenticated mutations verify the Origin header. Companion and bot endpoints require bearer tokens.</p>
                <p>• Integration fetches block private/link-local targets and follow no redirects (SSRF defence).</p>
                <p>• Rate limits are per-process (see limitations).</p>
              </CardBody>
            </Card>

            <Card id="limits">
              <CardHeader title="Known limitations" />
              <CardBody className="space-y-2 text-[12.5px] leading-relaxed text-ink-muted">
                <p>• Rate limiting is in-memory: fine for one instance, use Redis/Upstash for multi-instance deployments.</p>
                <p>• Notifications are stored preferences only; no email/webhook delivery yet.</p>
                <p>• Member submissions store a preference but the review inbox is not implemented.</p>
                <p>• FiveM and ER:LC expose aggregate server data only; character, job and duty state stay manual.</p>
                <p>• Presets are updated centrally, but a client keeps the last payload until its next 30-second poll.</p>
                <p>• The companion is unsigned; Windows SmartScreen will warn on first launch.</p>
              </CardBody>
            </Card>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-5 py-4">
              <p className="text-[12.5px] text-ink-soft">Everything above ships in this repository.</p>
              <div className="flex gap-2">
                <Link href="/" className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-muted hover:text-ink">
                  Home <IconArrowRight className="h-3 w-3" />
                </Link>
                <a
                  href="https://discord.gg/XPvpVG38BD"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1.5 text-[12.5px] text-brand-soft hover:text-ink"
                >
                  Support <IconExternal className="h-3 w-3" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

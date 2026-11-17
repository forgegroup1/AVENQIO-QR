import Link from 'next/link';
import { getSessionUser } from '@/server/auth/session';
import { SITE } from '@/server/config';
import { BrandMasked } from '@/components/marketing/brand-masked';
import { HeroPreview } from '@/components/marketing/hero-preview';
import { ButtonLink } from '@/components/ui/button';
import { Badge } from '@/components/ui/display';
import {
  DiscordMark,
  IconArrowRight,
  IconCheck,
  IconLayers,
  IconMonitor,
  IconShield,
  IconUsers,
  IconX,
  IconServer,
} from '@/components/icons';

const FEATURES = [
  {
    icon: <IconLayers className="h-4 w-4" />,
    title: 'A presence editor that respects Discord',
    body: 'Every field is validated against Discord’s Rich Presence limits — 128-character text, two buttons, 1000-member parties. Warnings flag what the client silently drops.',
  },
  {
    icon: <IconUsers className="h-4 w-4" />,
    title: 'Community presets with real access rules',
    body: 'Publish approved presets, require a minimum community role, and override access per member. Central edits propagate to everyone using the preset.',
  },
  {
    icon: <IconMonitor className="h-4 w-4" />,
    title: 'A companion that actually publishes',
    body: 'The Windows app holds the local Discord RPC connection. Neither the dashboard nor the bot pretends it can change another user’s presence.',
  },
  {
    icon: <IconShield className="h-4 w-4" />,
    title: 'Authorisation that fails closed',
    body: 'Community resources are resolved through your membership, so a changed ID returns 404 instead of someone else’s data. Sensitive actions land in an audit log.',
  },
];

const STATUS = [
  {
    tone: 'success' as const,
    title: 'Works without external credentials',
    items: [
      'Dashboard, editor and live preview',
      'Presence CRUD, activation and templates',
      'Community presets, roles and access',
      'Companion pairing + device tokens',
      'Embedded Postgres (PGlite) development stack',
    ],
  },
  {
    tone: 'warning' as const,
    title: 'Needs your Discord application',
    items: [
      'Discord OAuth2 sign-in (client id + secret)',
      'Community list from your Discord servers',
      'The central bot (bot token)',
      'Real RPC publishing (Discord desktop + app id)',
      'ERP / FiveM live data (server address or API key)',
    ],
  },
  {
    tone: 'neutral' as const,
    title: 'Deliberately not automated',
    items: [
      'Reading another player’s presence',
      'Character/job data from FiveM or ER:LC',
      'Fake “verified” community badges',
      'Secrets in the browser or in git',
    ],
  },
];

export default async function LandingPage() {
  const session = await getSessionUser();

  return (
    <div className="relative overflow-hidden">
      <div className="grid-lines pointer-events-none absolute inset-x-0 top-0 h-[620px] opacity-50" aria-hidden="true" />

      <header className="relative z-20 mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <div className="flex items-center gap-2.5">
          <BrandMasked size={30} />
          <span className="leading-tight">
            <span className="block text-[13.5px] font-semibold text-ink">
              Avenqio<span className="text-brand-soft">Presence</span>
            </span>
            <span className="block text-[10px] uppercase tracking-[0.18em] text-ink-muted">by Avenqio</span>
          </span>
        </div>
        <nav className="hidden items-center gap-6 text-[13px] text-ink-soft md:flex">
          <a href="#product" className="hover:text-ink">
            Product
          </a>
          <a href="#architecture" className="hover:text-ink">
            Architecture
          </a>
          <a href="#status" className="hover:text-ink">
            Status
          </a>
          <Link href="/docs" className="hover:text-ink">
            Docs
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          {session ? (
            <ButtonLink href="/dashboard" size="sm" icon={<IconArrowRight className="h-3.5 w-3.5" />}>
              Open dashboard
            </ButtonLink>
          ) : (
            <>
              <ButtonLink href="/login" variant="ghost" size="sm">
                Sign in
              </ButtonLink>
              <ButtonLink href="/login" size="sm">
                Get started
              </ButtonLink>
            </>
          )}
        </div>
      </header>

      <section className="relative z-10 mx-auto max-w-6xl px-5 pb-16 pt-10 sm:px-8 sm:pt-16">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="animate-rise">
            <Badge tone="brand" dot>
              Discord Rich Presence management
            </Badge>
            <h1 className="mt-5 text-[40px] font-semibold leading-[1.05] tracking-[-0.03em] text-ink sm:text-[54px]">
              Your presence,
              <br />
              <span className="text-gradient">engineered.</span>
            </h1>
            <p className="mt-5 max-w-[520px] text-[15px] leading-relaxed text-ink-soft">
              AvenqioPresence gives individuals and communities one place to design, validate and
              distribute Discord Rich Presence configurations — with a desktop companion that talks to
              your own Discord client.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <ButtonLink href={session ? '/dashboard' : '/login'} size="lg" icon={<IconArrowRight className="h-4 w-4" />}>
                {session ? 'Open dashboard' : 'Sign in with Discord'}
              </ButtonLink>
              <ButtonLink href="/docs" variant="secondary" size="lg">
                Read the docs
              </ButtonLink>
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11.5px] text-ink-muted">
              <span className="flex items-center gap-1.5">
                <IconCheck className="h-3.5 w-3.5 text-success" /> Windows companion
              </span>
              <span className="flex items-center gap-1.5">
                <IconCheck className="h-3.5 w-3.5 text-success" /> Discord OAuth2
              </span>
              <span className="flex items-center gap-1.5">
                <IconCheck className="h-3.5 w-3.5 text-success" /> Postgres + row-level policies
              </span>
            </div>
          </div>

          <div className="animate-rise delay-2 relative">
            <div className="absolute -inset-6 rounded-[28px] bg-[radial-gradient(60%_60%_at_50%_20%,rgba(139,92,246,0.18),transparent_70%)]" />
            <HeroPreview />
          </div>
        </div>
      </section>

      <section id="product" className="relative z-10 border-t border-line bg-bg-deep/40">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
          <div className="max-w-2xl">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-brand-soft">The product</p>
            <h2 className="mt-3 text-[28px] font-semibold tracking-tight text-ink sm:text-[32px]">
              Built as a platform, not a demo.
            </h2>
            <p className="mt-3 text-[14px] leading-relaxed text-ink-muted">
              Multi-user accounts, isolated communities, paired desktop devices and audited actions —
              the parts that decide whether a presence tool survives contact with a real server.
            </p>
          </div>
          <div className="mt-9 grid gap-4 sm:grid-cols-2">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="card card-interactive p-5">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-line-strong bg-elevated text-brand-soft">
                  {feature.icon}
                </span>
                <h3 className="mt-4 text-[15px] font-semibold text-ink">{feature.title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">{feature.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="architecture" className="relative z-10 border-t border-line">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
          <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-brand-soft">Architecture</p>
              <h2 className="mt-3 text-[28px] font-semibold tracking-tight text-ink sm:text-[32px]">
                Three components, one contract.
              </h2>
              <p className="mt-3 text-[14px] leading-relaxed text-ink-muted">
                The dashboard and the central bot share a typed presence contract. Only the companion
                app opens a Discord RPC socket, using a device token scoped to one account.
              </p>
              <div className="mt-6 rounded-xl border border-line bg-bg-deep/60 p-4">
                <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-ink-soft">
                  <IconShield className="mt-0.5 h-4 w-4 shrink-0 text-brand-soft" />
                  Presence is published over the local Discord IPC socket
                  (<code className="text-ink-soft">discord-ipc-0</code>) by the Windows app, on the user’s own
                  machine. The web app cannot reach that socket, and the bot cannot set someone else’s
                  activity.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {[
                {
                  icon: <IconLayers className="h-4 w-4" />,
                  title: 'Web dashboard',
                  tech: 'Next.js · TypeScript · Tailwind CSS · Postgres',
                  body: 'Editor, communities, integrations, settings. Server-side authorisation on every route.',
                },
                {
                  icon: <DiscordMark className="h-4 w-4" />,
                  title: 'Central Discord bot',
                  tech: 'discord.js · service token API',
                  body: 'One bot for every server. Slash commands for community status, presets and account linking.',
                },
                {
                  icon: <IconMonitor className="h-4 w-4" />,
                  title: 'Windows companion',
                  tech: 'Electron · TypeScript · Discord RPC',
                  body: 'Tray app, single-instance lock, autostart, device pairing and automatic presence sync.',
                },
              ].map((item) => (
                <div key={item.title} className="card flex items-start gap-3.5 p-4">
                  <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line-strong bg-elevated text-brand-soft">
                    {item.icon}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-[14px] font-semibold text-ink">{item.title}</h3>
                      <span className="font-mono text-[10.5px] text-ink-muted">{item.tech}</span>
                    </div>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">{item.body}</p>
                  </div>
                </div>
              ))}
              <div className="grid grid-cols-3 gap-2 text-center">
                {['Postgres + RLS', 'Hashed tokens', 'Audit log'].map((label) => (
                  <div key={label} className="rounded-lg border border-line bg-surface px-2 py-2 text-[10.5px] text-ink-muted">
                    {label}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="status" className="relative z-10 border-t border-line bg-bg-deep/40">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
          <div className="max-w-2xl">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-brand-soft">Status</p>
            <h2 className="mt-3 text-[28px] font-semibold tracking-tight text-ink sm:text-[32px]">
              Honest about what runs.
            </h2>
            <p className="mt-3 text-[14px] leading-relaxed text-ink-muted">
              This is version 0.1.0 of a real application. Here is exactly what works locally, what
              requires your own credentials, and what has not been automated on purpose.
            </p>
          </div>
          <div className="mt-9 grid gap-4 lg:grid-cols-3">
            {STATUS.map((column) => (
              <div key={column.title} className="card p-5">
                <Badge tone={column.tone}>{column.title}</Badge>
                <ul className="mt-4 space-y-2.5">
                  {column.items.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-[12.5px] leading-relaxed text-ink-soft">
                      {column.tone === 'neutral' ? (
                        <IconX className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-muted" />
                      ) : (
                        <IconCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-muted" />
                      )}
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative z-10 border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-5 py-14 sm:flex-row sm:items-center sm:px-8">
          <div>
            <h2 className="text-[24px] font-semibold tracking-tight text-ink">Start with your own Discord app.</h2>
            <p className="mt-2 max-w-xl text-[13.5px] leading-relaxed text-ink-muted">
              Create a Discord application, enable OAuth2, add the redirect URI and drop the credentials
              into <code className="text-ink-soft">.env.local</code>. The docs walk through every step.
            </p>
          </div>
          <div className="flex gap-2">
            <ButtonLink href="/docs" variant="secondary" size="lg" icon={<IconServer className="h-4 w-4" />}>
              Setup guide
            </ButtonLink>
            <ButtonLink href={session ? '/dashboard' : '/login'} size="lg">
              {session ? 'Dashboard' : 'Sign in'}
            </ButtonLink>
          </div>
        </div>
      </section>

      <footer className="relative z-10 border-t border-line px-5 py-6 sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-3 text-[11.5px] text-ink-muted sm:flex-row sm:items-center">
          <span>© {new Date().getFullYear()} Avenqio · {SITE.tagline}</span>
          <div className="flex items-center gap-5">
            <Link href="/docs" className="hover:text-ink-soft">
              Docs
            </Link>
            <a href={SITE.supportUrl} target="_blank" rel="noreferrer noopener" className="hover:text-ink-soft">
              Discord support
            </a>
            <span className="flex items-center gap-1.5">
              <DiscordMark className="h-3.5 w-3.5" /> Built for Discord
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/server/auth/session';
import { config, discordOAuthConfigured } from '@/server/config';
import { LoginForm } from '@/components/auth/login-form';
import { BrandLockup } from '@/components/layout/brand';
import { ButtonLink } from '@/components/ui/button';

export const metadata = { title: 'Sign in' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const session = await getSessionUser();
  if (session) redirect('/dashboard');

  const params = await searchParams;
  const next = params.next?.startsWith('/') && !params.next.startsWith('//') ? params.next : '/dashboard';

  return (
    <div className="relative flex min-h-screen flex-col">
      <div className="grid-lines pointer-events-none absolute inset-0 opacity-40" aria-hidden="true" />
      <header className="relative z-10 flex items-center justify-between px-5 py-4 sm:px-8">
        <BrandLockup href="/" />
        <ButtonLink href="/" variant="ghost" size="sm">
          Back to site
        </ButtonLink>
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-5 py-8 sm:py-12">
        <div className="grid w-full max-w-5xl items-center gap-10 lg:grid-cols-[1fr_420px]">
          <div className="hidden lg:block">
            <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-line-strong bg-surface px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-ink-muted">
              AvenqioPresence
            </p>
            <h2 className="text-[34px] font-semibold leading-[1.1] tracking-tight text-ink">
              One account.
              <br />
              <span className="text-gradient">Every presence.</span>
            </h2>
            <p className="mt-4 max-w-md text-[13.5px] leading-relaxed text-ink-muted">
              Manage personal Rich Presence configurations, publish approved presets to your community,
              and let the Windows companion keep your Discord status in sync.
            </p>
            <ul className="mt-6 space-y-2 text-[12.5px] text-ink-soft">
              {[
                'You only see servers you manage — enforced server-side',
                'Presence payloads validated against Discord limits',
                'Companion devices are paired with single-use codes',
              ].map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <span className="h-1 w-1 rounded-full bg-brand" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="card relative p-6 sm:p-7">
            <LoginForm
              next={next}
              discordConfigured={discordOAuthConfigured()}
              devAuthEnabled={config.devAuthEnabled}
              errorCode={params.error}
            />
          </div>
        </div>
      </main>

      <footer className="relative z-10 border-t border-line px-5 py-4 text-center text-[11px] text-ink-muted">
        © {new Date().getFullYear()} Avenqio ·{' '}
        <Link href="/docs" className="hover:text-ink-soft">
          Documentation
        </Link>{' '}
        ·{' '}
        <a href="https://discord.gg/XPvpVG38BD" className="hover:text-ink-soft" rel="noreferrer noopener" target="_blank">
          Support
        </a>
      </footer>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiClientError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Badge, Callout, Divider } from '@/components/ui/display';
import { Spinner } from '@/components/ui/button';
import { useToast } from '@/components/ui/overlay';
import { DiscordMark, IconAlert, IconArrowRight, IconKey, IconTerminal } from '@/components/icons';

type DevUser = { id: string; displayName: string; username: string | null };

const ERROR_MESSAGES: Record<string, string> = {
  discord_not_configured:
    'Discord OAuth2 is not configured on this deployment. Add DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET to .env.local.',
  access_denied: 'You cancelled the Discord authorisation.',
  invalid_state: 'The sign-in attempt expired or was tampered with. Please try again.',
  discord_error: 'Discord rejected the exchange. Check the redirect URI and client secret.',
  rate_limited: 'Too many sign-in attempts. Wait a minute and try again.',
};

export function LoginForm({
  next,
  discordConfigured,
  devAuthEnabled,
  errorCode,
}: {
  next: string;
  discordConfigured: boolean;
  devAuthEnabled: boolean;
  errorCode?: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [devUsers, setDevUsers] = useState<DevUser[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [showDev, setShowDev] = useState(false);

  useEffect(() => {
    if (!devAuthEnabled) return;
    apiFetch<{ enabled: boolean; users: DevUser[] }>('/api/auth/dev')
      .then((data) => {
        setDevUsers(data.users);
        if (data.users.length > 0) setShowDev(true);
      })
      .catch(() => setDevUsers([]));
  }, [devAuthEnabled]);

  const signInDev = async (user: DevUser) => {
    setLoading(user.id);
    try {
      await apiFetch('/api/auth/dev', { method: 'POST', body: { userId: user.id } });
      toast({ title: `Signed in as ${user.displayName}`, tone: 'success' });
      router.push(next);
      router.refresh();
    } catch (error) {
      toast({
        title: 'Dev sign-in failed',
        description: error instanceof ApiClientError ? error.message : 'Unexpected error.',
        tone: 'error',
      });
      setLoading(null);
    }
  };

  return (
    <div className="w-full max-w-[420px] space-y-5">
      <div className="space-y-2">
        <h1 className="text-[26px] font-semibold tracking-tight text-ink">Sign in</h1>
        <p className="text-[13.5px] leading-relaxed text-ink-muted">
          AvenqioPresence uses Discord to identify you and to discover the servers you manage.
        </p>
      </div>

      {errorCode ? (
        <Callout tone="danger" icon={<IconAlert className="h-4 w-4" />} title="Sign-in did not complete">
          {ERROR_MESSAGES[errorCode] ?? 'Something went wrong while signing in. Please try again.'}
        </Callout>
      ) : null}

      <div className="card p-5">
        {discordConfigured ? (
          <Button
            variant="primary"
            size="lg"
            className="w-full !bg-[#5865F2] hover:!bg-[#4752c4]"
            icon={<DiscordMark className="h-[18px] w-[18px]" />}
            onClick={() => {
              window.location.href = `/api/auth/discord/start?next=${encodeURIComponent(next)}`;
            }}
          >
            Continue with Discord
          </Button>
        ) : (
          <div className="space-y-3">
            <Button variant="secondary" size="lg" className="w-full" disabled icon={<DiscordMark />}>
              Continue with Discord
            </Button>
            <Callout tone="warning" icon={<IconAlert className="h-4 w-4" />}>
              Discord OAuth is not configured on this deployment. Set <code className="text-ink-soft">DISCORD_CLIENT_ID</code>{' '}
              and <code className="text-ink-soft">DISCORD_CLIENT_SECRET</code> in <code className="text-ink-soft">.env.local</code>{' '}
              to enable it.
            </Callout>
          </div>
        )}

        <p className="mt-3 text-center text-[11.5px] leading-relaxed text-ink-muted">
          Scopes requested: <span className="text-ink-soft">identify</span> and{' '}
          <span className="text-ink-soft">guilds</span>. OAuth tokens are used once and never stored.
        </p>
      </div>

      {devAuthEnabled ? (
        <>
          <div className="flex items-center gap-3">
            <Divider className="flex-1" />
            <span className="text-[10.5px] uppercase tracking-[0.16em] text-ink-muted">Local development</span>
            <Divider className="flex-1" />
          </div>

          <div className="card overflow-hidden">
            <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
              <div className="flex items-center gap-2 text-[12px] text-ink-soft">
                <IconTerminal className="h-3.5 w-3.5 text-brand-soft" />
                Seeded dev accounts
              </div>
              <Badge tone="warning">not production auth</Badge>
            </div>
            <div className="divide-y divide-line">
              {!showDev || devUsers.length === 0 ? (
                <div className="flex items-center gap-2 px-4 py-4 text-[12.5px] text-ink-muted">
                  <Spinner className="h-3.5 w-3.5" />
                  {showDev ? 'No fixture accounts found. Run npm run db:seed.' : 'Looking for dev accounts…'}
                </div>
              ) : (
                devUsers.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => void signInDev(user)}
                    disabled={loading !== null}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-elevated/60"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium text-ink">{user.displayName}</span>
                      <span className="block truncate text-[11.5px] text-ink-muted">
                        @{user.username ?? 'dev'} · fixture
                      </span>
                    </span>
                    {loading === user.id ? (
                      <Spinner className="h-4 w-4 text-brand-soft" />
                    ) : (
                      <IconArrowRight className="h-4 w-4 text-ink-muted" />
                    )}
                  </button>
                ))
              )}
            </div>
            <p className="flex items-start gap-2 border-t border-line bg-bg-deep/50 px-4 py-2.5 text-[11px] leading-relaxed text-ink-muted">
              <IconKey className="mt-0.5 h-3 w-3 shrink-0" />
              Disable with <code className="text-ink-soft">ALLOW_DEV_AUTH=false</code> before exposing the app publicly.
            </p>
          </div>
        </>
      ) : null}
    </div>
  );
}

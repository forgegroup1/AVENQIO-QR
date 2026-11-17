'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { relativeTime } from '@avenqio/shared';
import { apiFetch } from '@/lib/api-client';
import { Avatar, Badge, Callout, Card, CardBody, CardHeader, Divider, EmptyState, SectionHeader } from '@/components/ui/display';
import { Button, ButtonLink } from '@/components/ui/button';
import { Field, Input, Select, Switch } from '@/components/ui/form';
import { Dialog, useToast } from '@/components/ui/overlay';
import { Tabs } from '@/components/ui/tabs';
import { DiscordMark, IconAlert, IconCheck, IconCopy, IconInfo, IconLock, IconLogout, IconMonitor, IconTrash } from '@/components/icons';

type Profile = {
  id: string;
  displayName: string;
  email: string | null;
  locale: 'en' | 'it';
  preferences: {
    notifications: { companionOffline: boolean; communityUpdates: boolean; productNews: boolean };
    editor: { showWarnings: boolean; confirmDelete: boolean };
  };
  createdAt: string;
  discord: { id: string; username: string; globalName: string | null } | null;
};

type Session = { id: string; userAgent: string | null; createdAt: string; lastUsedAt: string | null; current: boolean };
type Device = {
  id: string;
  name: string;
  status: 'pending' | 'linked' | 'revoked';
  lastSeenAt: string | null;
  appVersion: string | null;
  lastRpcConnected: boolean | null;
  createdAt: string;
};

function describeAgent(userAgent: string | null): string {
  if (!userAgent) return 'Unknown client';
  if (/Edg\//.test(userAgent)) return 'Microsoft Edge';
  if (/Chrome\//.test(userAgent)) return 'Chrome';
  if (/Firefox\//.test(userAgent)) return 'Firefox';
  if (/Safari\//.test(userAgent)) return 'Safari';
  if (/curl|node|undici/i.test(userAgent)) return 'API client';
  return 'Browser';
}

export function SettingsView({
  profile,
  sessions,
  devices,
  account,
  initialTab = 'profile',
}: {
  initialTab?: string;
  profile: Profile;
  sessions: Session[];
  devices: Device[];
  account: { isDev: boolean; sessionCreatedAt: string; discordId: string | null };
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [initial, setInitial] = useState(initialTab);
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [locale, setLocale] = useState(profile.locale);
  const [preferences, setPreferences] = useState(profile.preferences);
  const [busy, setBusy] = useState<string | null>(null);
  const [pairing, setPairing] = useState<{ code: string; expiresAt: string } | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<Device | null>(null);
  const [signOutAllOpen, setSignOutAllOpen] = useState(false);

  useEffect(() => {
    const hash = window.location.hash.replace('#', '');
    if (hash) setInitial(hash);
  }, []);

  const saveProfile = async () => {
    setBusy('profile');
    try {
      await apiFetch('/api/v1/profile', { method: 'PATCH', body: { displayName, locale } });
      toast({ title: 'Profile saved', tone: 'success' });
      router.refresh();
    } catch (error) {
      toast({ title: 'Could not save profile', description: error instanceof Error ? error.message : undefined, tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const savePreferences = async (next: typeof preferences, key: string) => {
    setPreferences(next);
    setBusy(key);
    try {
      await apiFetch('/api/v1/profile', { method: 'PATCH', body: { preferences: next } });
      toast({ title: 'Preferences saved', tone: 'success' });
    } catch (error) {
      toast({ title: 'Could not save preferences', description: error instanceof Error ? error.message : undefined, tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const revokeSession = async (session: Session) => {
    setBusy(`session-${session.id}`);
    try {
      await apiFetch(`/api/v1/profile/sessions/${session.id}`, { method: 'DELETE' });
      toast({ title: 'Session revoked', tone: 'success' });
      router.refresh();
    } catch (error) {
      toast({ title: 'Could not revoke session', description: error instanceof Error ? error.message : undefined, tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const revokeOthers = async () => {
    setBusy('revoke-others');
    try {
      const data = await apiFetch<{ revoked: number }>('/api/v1/profile/sessions', { method: 'DELETE' });
      toast({
        title: 'Other sessions signed out',
        description: `Revoked ${data.revoked} session${data.revoked === 1 ? '' : 's'}.`,
        tone: 'success',
      });
      setSignOutAllOpen(false);
      router.refresh();
    } catch (error) {
      toast({ title: 'Could not revoke sessions', description: error instanceof Error ? error.message : undefined, tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const createPairing = async () => {
    setBusy('pairing');
    try {
      const data = await apiFetch<{ code: string; expiresAt: string }>('/api/v1/devices', {
        method: 'POST',
        body: { name: 'New device' },
      });
      setPairing(data);
      router.refresh();
    } catch (error) {
      toast({ title: 'Could not create pairing code', description: error instanceof Error ? error.message : undefined, tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const revokeDevice = async () => {
    if (!revokeTarget) return;
    setBusy('revoke-device');
    try {
      await apiFetch(`/api/v1/devices/${revokeTarget.id}`, { method: 'DELETE' });
      toast({ title: 'Device revoked', tone: 'success' });
      setRevokeTarget(null);
      router.refresh();
    } catch (error) {
      toast({ title: 'Could not revoke device', description: error instanceof Error ? error.message : undefined, tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const signOut = async () => {
    setBusy('signout');
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
      router.refresh();
    } catch {
      toast({ title: 'Could not sign out', tone: 'error' });
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Settings"
        description="Your profile, preferences, security and connected companion devices."
      />

      <Tabs
        key={initial}
        initial={initial}
        items={[
          {
            id: 'profile',
            label: 'Profile',
            content: (
              <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                <Card>
                  <CardHeader title="Account" description="Shown inside the dashboard. Discord identity stays authoritative." />
                  <CardBody className="space-y-4">
                    <Field label="Display name" htmlFor="display-name" hint="1–64 characters. Does not change your Discord username.">
                      <Input
                        id="display-name"
                        value={displayName}
                        maxLength={64}
                        onChange={(event) => setDisplayName(event.target.value)}
                      />
                    </Field>
                    <Field label="Language" htmlFor="locale" hint="Interface language for the dashboard.">
                      <Select id="locale" value={locale} onChange={(event) => setLocale(event.target.value as 'en' | 'it')}>
                        <option value="en">English</option>
                        <option value="it">Italiano</option>
                      </Select>
                    </Field>
                    <Button loading={busy === 'profile'} onClick={() => void saveProfile()}>
                      Save profile
                    </Button>
                  </CardBody>
                </Card>

                <Card>
                  <CardHeader title="Discord account" icon={<DiscordMark className="h-4 w-4" />} />
                  <CardBody className="space-y-3">
                    {profile.discord ? (
                      <>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[12.5px] text-ink-soft">Username</span>
                          <span className="text-[12.5px] text-ink">@{profile.discord.username}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[12.5px] text-ink-soft">Discord ID</span>
                          <span className="font-mono text-[11px] text-ink-muted">{profile.discord.id}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[12.5px] text-ink-soft">Email</span>
                          <span className="text-[12px] text-ink-muted">{profile.email ?? 'not shared'}</span>
                        </div>
                        <Divider />
                        <ButtonLink href="/api/auth/discord/start?next=/dashboard/settings" variant="secondary" size="sm">
                          Refresh from Discord
                        </ButtonLink>
                      </>
                    ) : (
                      <Callout tone="warning" icon={<IconAlert className="h-4 w-4" />}>
                        This is a development fixture account with no Discord identity. Configure Discord OAuth to
                        sign in with a real account.
                      </Callout>
                    )}
                    <p className="text-[11px] text-ink-muted">
                      Member since {new Date(profile.createdAt).toLocaleDateString()}
                    </p>
                  </CardBody>
                </Card>
              </div>
            ),
          },
          {
            id: 'preferences',
            label: 'Preferences',
            content: (
              <Card>
                <CardHeader title="Editor" description="How the presence editor behaves." />
                <CardBody className="space-y-4">
                  <Switch
                    id="show-warnings"
                    checked={preferences.editor.showWarnings}
                    onChange={(next) =>
                      void savePreferences(
                        { ...preferences, editor: { ...preferences.editor, showWarnings: next } },
                        'pref-editor',
                      )
                    }
                    label="Show advisory warnings"
                    description="Warnings highlight fields Discord accepts but may not render as expected."
                  />
                  <Divider />
                  <Switch
                    id="confirm-delete"
                    checked={preferences.editor.confirmDelete}
                    onChange={(next) =>
                      void savePreferences(
                        { ...preferences, editor: { ...preferences.editor, confirmDelete: next } },
                        'pref-editor',
                      )
                    }
                    label="Confirm before deleting"
                    description="Ask for confirmation before removing presences or devices."
                  />
                  <p className="text-[11px] text-ink-muted">
                    Preferences are stored per account in Postgres and applied to your session immediately.
                  </p>
                </CardBody>
              </Card>
            ),
          },
          {
            id: 'notifications',
            label: 'Notifications',
            content: (
              <Card>
                <CardHeader
                  title="Notifications"
                  description="In-app notifications. Email delivery is not implemented in this version."
                />
                <CardBody className="space-y-4">
                  {[
                    {
                      key: 'companionOffline' as const,
                      label: 'Companion goes offline',
                      description: 'Warn when no device heartbeat has been received for five minutes.',
                    },
                    {
                      key: 'communityUpdates' as const,
                      label: 'Community preset updates',
                      description: 'Notify when a preset you use is edited or archived by managers.',
                    },
                    {
                      key: 'productNews' as const,
                      label: 'Product news',
                      description: 'Occasional updates about AvenqioPresence releases.',
                    },
                  ].map((item, index) => (
                    <div key={item.key}>
                      {index > 0 ? <Divider className="mb-4" /> : null}
                      <Switch
                        id={`notify-${item.key}`}
                        checked={preferences.notifications[item.key]}
                        onChange={(next) =>
                          void savePreferences(
                            {
                              ...preferences,
                              notifications: { ...preferences.notifications, [item.key]: next },
                            },
                            'pref-notify',
                          )
                        }
                        label={item.label}
                        description={item.description}
                      />
                    </div>
                  ))}
                  <Callout tone="neutral" icon={<IconInfo className="h-4 w-4" />}>
                    These preferences are stored today; the notification delivery service (email/webhooks) is a
                    documented next step, not a shipped feature.
                  </Callout>
                </CardBody>
              </Card>
            ),
          },
          {
            id: 'security',
            label: 'Security',
            content: (
              <div className="space-y-4">
                <Card>
                  <CardHeader
                    title="Active sessions"
                    description="Session tokens are stored as SHA-256 hashes; revoking removes access immediately."
                    icon={<IconLock className="h-4 w-4" />}
                    action={
                      <Button variant="secondary" size="sm" onClick={() => setSignOutAllOpen(true)}>
                        Sign out everywhere
                      </Button>
                    }
                  />
                  <ul className="divide-y divide-line">
                    {sessions.map((session) => (
                      <li key={session.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-line-strong bg-elevated text-ink-muted">
                          <IconMonitor className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[12.5px] text-ink">
                            {describeAgent(session.userAgent)}
                            {session.current ? <Badge tone="success" className="ml-2">This device</Badge> : null}
                          </p>
                          <p className="text-[10.5px] text-ink-muted">
                            Started {relativeTime(session.createdAt)} · last used{' '}
                            {session.lastUsedAt ? relativeTime(session.lastUsedAt) : 'just now'}
                          </p>
                        </div>
                        {!session.current ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            loading={busy === `session-${session.id}`}
                            onClick={() => void revokeSession(session)}
                          >
                            Revoke
                          </Button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </Card>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Card>
                    <CardHeader title="Security model" icon={<IconLock className="h-4 w-4" />} />
                    <CardBody className="space-y-2 text-[11.5px] leading-relaxed text-ink-muted">
                      <p className="flex items-start gap-2">
                        <IconCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                        HttpOnly, SameSite=Lax session cookies; Secure when served over HTTPS.
                      </p>
                      <p className="flex items-start gap-2">
                        <IconCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                        Discord OAuth tokens are never persisted.
                      </p>
                      <p className="flex items-start gap-2">
                        <IconCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                        Integration credentials encrypted with AES-256-GCM.
                      </p>
                      <p className="flex items-start gap-2">
                        <IconCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                        Origin checks on every cookie-authenticated mutation.
                      </p>
                    </CardBody>
                  </Card>
                  <Card>
                    <CardHeader title="Session" />
                    <CardBody className="space-y-3">
                      <div className="flex items-center justify-between gap-3 text-[12.5px]">
                        <span className="text-ink-soft">Signed in since</span>
                        <span className="text-ink-muted">{new Date(account.sessionCreatedAt).toLocaleString()}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3 text-[12.5px]">
                        <span className="text-ink-soft">Account type</span>
                        <Badge tone={account.isDev ? 'warning' : 'success'}>{account.isDev ? 'Development' : 'Discord'}</Badge>
                      </div>
                      <Button variant="danger" size="sm" icon={<IconLogout className="h-3.5 w-3.5" />} loading={busy === 'signout'} onClick={() => void signOut()}>
                        Sign out
                      </Button>
                    </CardBody>
                  </Card>
                </div>
              </div>
            ),
          },
          {
            id: 'devices',
            label: 'Devices',
            content: (
              <div className="space-y-4">
                <Card>
                  <CardHeader
                    title="Companion devices"
                    description="Each device holds its own hashed token. Revoking one does not affect the others."
                    icon={<IconMonitor className="h-4 w-4" />}
                    action={
                      <Button size="sm" loading={busy === 'pairing'} onClick={() => void createPairing()}>
                        Generate pairing code
                      </Button>
                    }
                  />
                  {pairing ? (
                    <CardBody>
                      <div className="rounded-xl border border-brand/30 bg-brand/8 p-4">
                        <p className="text-[11px] uppercase tracking-[0.14em] text-brand-soft">Pairing code</p>
                        <div className="mt-1 flex items-center gap-3">
                          <code className="font-mono text-[24px] font-semibold tracking-[0.2em] text-ink">
                            {pairing.code}
                          </code>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Copy pairing code"
                            onClick={() => {
                              void navigator.clipboard.writeText(pairing.code);
                              toast({ title: 'Copied', description: 'Paste it into the companion app.', tone: 'success' });
                            }}
                          >
                            <IconCopy className="h-4 w-4" />
                          </Button>
                        </div>
                        <p className="mt-2 text-[11.5px] leading-relaxed text-ink-muted">
                          Valid for 10 minutes, single use. Open the companion → “Connect device” → paste this code.
                          It expires at {new Date(pairing.expiresAt).toLocaleTimeString()}.
                        </p>
                      </div>
                    </CardBody>
                  ) : null}
                  {devices.length === 0 ? (
                    <EmptyState
                      icon={<IconMonitor className="h-5 w-5" />}
                      title="No devices"
                      description="Build the Windows companion and link it with a pairing code."
                      action={
                        <ButtonLink href="/docs#companion" variant="secondary" size="sm">
                          Build instructions
                        </ButtonLink>
                      }
                    />
                  ) : (
                    <ul className="divide-y divide-line">
                      {devices.map((device) => (
                        <li key={device.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                          <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-line-strong bg-elevated text-ink-muted">
                            <IconMonitor className="h-3.5 w-3.5" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="flex items-center gap-2 text-[12.5px] text-ink">
                              {device.name}
                              <Badge
                                tone={device.status === 'linked' ? 'success' : device.status === 'pending' ? 'warning' : 'outline'}
                              >
                                {device.status}
                              </Badge>
                            </p>
                            <p className="text-[10.5px] text-ink-muted">
                              {device.lastSeenAt ? `Last seen ${relativeTime(device.lastSeenAt)}` : 'Not connected yet'}
                              {device.appVersion ? ` · v${device.appVersion}` : ''}
                              {device.lastRpcConnected ? ' · Discord RPC ready' : ''}
                            </p>
                          </div>
                          {device.status !== 'revoked' ? (
                            <Button variant="ghost" size="sm" onClick={() => setRevokeTarget(device)}>
                              Revoke
                            </Button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>

                <Callout tone="neutral" icon={<IconInfo className="h-4 w-4" />}>
                  The companion stores its device token with Electron <code>safeStorage</code> (Windows DPAPI) and
                  polls <code>/api/companion/state</code> every 30 seconds. It never receives your Discord password
                  or OAuth token.
                </Callout>
              </div>
            ),
          },
        ]}
      />

      <Dialog
        open={revokeTarget !== null}
        onClose={() => setRevokeTarget(null)}
        title={`Revoke ${revokeTarget?.name ?? ''}?`}
        description="The device loses access immediately and must be paired again."
        footer={
          <>
            <Button variant="ghost" onClick={() => setRevokeTarget(null)}>
              Cancel
            </Button>
            <Button variant="danger" loading={busy === 'revoke-device'} onClick={() => void revokeDevice()}>
              Revoke device
            </Button>
          </>
        }
      />

      <Dialog
        open={signOutAllOpen}
        onClose={() => setSignOutAllOpen(false)}
        title="Sign out everywhere else?"
        description="Every other browser session is revoked. Your current session stays active."
        footer={
          <>
            <Button variant="ghost" onClick={() => setSignOutAllOpen(false)}>
              Cancel
            </Button>
            <Button loading={busy === 'revoke-others'} onClick={() => void revokeOthers()}>
              Sign out other sessions
            </Button>
          </>
        }
      />
    </div>
  );
}

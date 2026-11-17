'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  INTEGRATION_LIST,
  getIntegration,
  relativeTime,
  type IntegrationKind,
  type IntegrationSnapshot,
} from '@avenqio/shared';
import { apiFetch } from '@/lib/api-client';
import { Badge, Callout, Card, CardBody, CardHeader, EmptyState, SectionHeader } from '@/components/ui/display';
import { Button, ButtonLink } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/form';
import { Dialog, useToast } from '@/components/ui/overlay';
import {
  DiscordMark,
  IconAlert,
  IconArrowRight,
  IconCheck,
  IconCopy,
  IconExternal,
  IconInfo,
  IconMonitor,
  IconPlus,
  IconRefresh,
  IconTerminal,
  IconTrash,
  IconUsers,
} from '@/components/icons';

type Integration = {
  id: string;
  kind: IntegrationKind;
  label: string;
  status: 'manual' | 'connected' | 'error' | 'disabled';
  hasCredentials: boolean;
  config: Record<string, unknown>;
  lastSyncedAt: string | null;
  lastError: string | null;
  lastSnapshot: IntegrationSnapshot | null;
};

type Device = {
  id: string;
  name: string;
  status: 'pending' | 'linked' | 'revoked';
  lastSeenAt: string | null;
  appVersion: string | null;
  lastRpcConnected: boolean | null;
};

const STATUS_TONE = {
  connected: 'success',
  manual: 'neutral',
  error: 'danger',
  disabled: 'outline',
} as const;

export function IntegrationsView({
  integrations,
  devices,
  discord,
  companionOnline,
  botInviteUrl,
}: {
  integrations: Integration[];
  devices: Device[];
  discord: { connected: boolean; username: string | null; isDev: boolean };
  companionOnline: boolean;
  botInviteUrl: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [presenceFor, setPresenceFor] = useState<Integration | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Integration | null>(null);
  const [pairing, setPairing] = useState<{ code: string; expiresAt: string } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const [form, setForm] = useState({
    kind: 'fivem' as IntegrationKind,
    label: '',
    serverAddress: '',
    serverName: '',
    communityName: '',
    serverKey: '',
  });
  const [presenceForm, setPresenceForm] = useState({ name: '', values: {} as Record<string, string> });

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const run = async (key: string, action: () => Promise<unknown>, success?: { title: string; description?: string }) => {
    setBusy(key);
    try {
      const result = await action();
      if (success) toast({ ...success, tone: 'success' });
      router.refresh();
      return result;
    } catch (error) {
      toast({ title: 'Action failed', description: error instanceof Error ? error.message : undefined, tone: 'error' });
      return null;
    } finally {
      setBusy(null);
    }
  };

  const createIntegration = async () => {
    setBusy('create');
    try {
      const config =
        form.kind === 'fivem'
          ? { serverAddress: form.serverAddress.trim(), serverName: form.serverName.trim() || undefined }
          : { communityName: form.communityName.trim() || undefined };
      await apiFetch('/api/v1/integrations', {
        method: 'POST',
        body: {
          kind: form.kind,
          label: form.label.trim() || getIntegration(form.kind).name,
          config,
          credentials: form.kind === 'erlc' && form.serverKey ? { serverKey: form.serverKey } : undefined,
        },
      });
      toast({ title: 'Integration added', description: 'Run “Test connection” to verify the data source.', tone: 'success' });
      setAddOpen(false);
      setForm({ kind: 'fivem', label: '', serverAddress: '', serverName: '', communityName: '', serverKey: '' });
      router.refresh();
    } catch (error) {
      toast({ title: 'Could not add integration', description: error instanceof Error ? error.message : undefined, tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const createPresence = async () => {
    if (!presenceFor) return;
    setBusy('presence');
    try {
      const created = await apiFetch<{ presenceId: string }>(`/api/v1/integrations/${presenceFor.id}/presence`, {
        method: 'POST',
        body: { name: presenceForm.name.trim() || presenceFor.label, values: presenceForm.values },
      });
      toast({ title: 'Presence drafted', description: 'Review it in the editor before activating.', tone: 'success' });
      setPresenceFor(null);
      router.push(`/dashboard/presences/${created.presenceId}`);
    } catch (error) {
      toast({ title: 'Could not create presence', description: error instanceof Error ? error.message : undefined, tone: 'error' });
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
      toast({ title: 'Could not create a pairing code', description: error instanceof Error ? error.message : undefined, tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const revoke = async (device: Device) => {
    await run('revoke-' + device.id, () => apiFetch(`/api/v1/devices/${device.id}`, { method: 'DELETE' }), {
      title: 'Device revoked',
      description: 'The companion will be signed out on its next request.',
    });
  };

  const deleteIntegration = async () => {
    if (!deleteTarget) return;
    await run('delete', () => apiFetch(`/api/v1/integrations/${deleteTarget.id}`, { method: 'DELETE' }), {
      title: 'Integration removed',
    });
    setDeleteTarget(null);
  };

  const definition = getIntegration(form.kind);
  const secondsLeft = pairing ? Math.max(0, Math.floor((new Date(pairing.expiresAt).getTime() - now) / 1000)) : 0;
  const linked = devices.filter((device) => device.status === 'linked');

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Integrations"
        description="Discord, the Windows companion, and game-server data sources. Every integration states exactly what it can automate."
        action={
          <Button icon={<IconPlus className="h-4 w-4" />} onClick={() => setAddOpen(true)}>
            Add integration
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Discord account" description="Identity and communities come from Discord OAuth2." icon={<DiscordMark className="h-4 w-4" />} />
          <CardBody className="space-y-3">
            <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-bg-deep/50 px-3 py-2.5">
              <div>
                <p className="text-[12.5px] font-medium text-ink">
                  {discord.connected ? `@${discord.username}` : 'Not linked'}
                </p>
                <p className="text-[11px] text-ink-muted">
                  {discord.connected ? 'Scopes: identify, guilds' : 'Development account without a Discord identity'}
                </p>
              </div>
              <Badge tone={discord.connected ? 'success' : 'warning'} dot>
                {discord.connected ? 'Connected' : 'Dev session'}
              </Badge>
            </div>
            <p className="text-[11.5px] leading-relaxed text-ink-muted">
              OAuth tokens are used once to read your profile and managed guilds, then discarded. Reconnecting
              refreshes your community list after permission changes.
            </p>
            <ButtonLink
              href="/api/auth/discord/start?next=/dashboard/integrations"
              variant="secondary"
              size="sm"
              icon={<IconRefresh className="h-3.5 w-3.5" />}
            >
              Reconnect Discord
            </ButtonLink>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Windows companion"
            description="Pairs with a one-time code; authenticates with a hashed device token."
            icon={<IconMonitor className="h-4 w-4" />}
            action={<Badge tone={companionOnline ? 'success' : 'outline'} dot>{companionOnline ? 'Online' : 'Offline'}</Badge>}
          />
          <CardBody className="space-y-3">
            {pairing ? (
              <div className="rounded-xl border border-brand/30 bg-brand/8 p-3">
                <p className="text-[11px] uppercase tracking-[0.14em] text-brand-soft">Pairing code</p>
                <div className="mt-1 flex items-center gap-2">
                  <code className="font-mono text-[20px] font-semibold tracking-[0.18em] text-ink">
                    {pairing.code}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Copy pairing code"
                    onClick={() => {
                      void navigator.clipboard.writeText(pairing.code);
                      toast({ title: 'Code copied', tone: 'success' });
                    }}
                  >
                    <IconCopy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="mt-1 text-[11px] text-ink-muted">
                  {secondsLeft > 0
                    ? `Expires in ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`
                    : 'Expired — generate a new code.'}
                </p>
              </div>
            ) : null}
            <Button variant="secondary" size="sm" loading={busy === 'pairing'} onClick={() => void createPairing()}>
              {pairing ? 'Generate another code' : 'Generate pairing code'}
            </Button>
            <div className="space-y-2">
              {linked.length === 0 ? (
                <p className="text-[11.5px] leading-relaxed text-ink-muted">
                  No linked devices. Generate a code, open the companion and paste it there.
                </p>
              ) : (
                linked.map((device) => (
                  <div key={device.id} className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-[12.5px] text-ink">{device.name}</p>
                      <p className="text-[10.5px] text-ink-muted">
                        {device.lastSeenAt ? `Seen ${relativeTime(device.lastSeenAt)}` : 'Never connected'}
                        {device.appVersion ? ` · v${device.appVersion}` : ''}
                        {device.lastRpcConnected ? ' · RPC ready' : ''}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={busy === `revoke-${device.id}`}
                      onClick={() => void revoke(device)}
                    >
                      Revoke
                    </Button>
                  </div>
                ))
              )}
            </div>
            <Link2 href="/docs#companion" label="How to build the companion" />
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Game & roleplay integrations"
          description="Adapters fetch only documented, public data. Player-level state stays manual unless a verified source exists."
          icon={<IconTerminal className="h-4 w-4" />}
        />
        {integrations.length === 0 ? (
          <EmptyState
            icon={<IconTerminal className="h-5 w-5" />}
            title="No integrations yet"
            description="Add a FiveM server address or an ER:LC server key to pull live server data into a presence."
            action={<Button onClick={() => setAddOpen(true)}>Add integration</Button>}
          />
        ) : (
          <ul className="divide-y divide-line">
            {integrations.map((integration) => {
              const adapter = getIntegration(integration.kind);
              return (
                <li key={integration.id} className="space-y-3 px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[13.5px] font-medium text-ink">{integration.label}</p>
                        <Badge tone={STATUS_TONE[integration.status]}>{integration.status}</Badge>
                        <Badge tone="outline">{adapter.name}</Badge>
                        {integration.hasCredentials ? <Badge tone="brand">credentials stored</Badge> : null}
                      </div>
                      <p className="mt-1 text-[11.5px] leading-relaxed text-ink-muted">{adapter.automation.detail}</p>
                      {integration.lastSnapshot ? (
                        <p className="mt-1 font-mono text-[10.5px] text-ink-muted">
                          {integration.lastSnapshot.serverName ?? 'unknown server'}
                          {integration.lastSnapshot.playersOnline !== null
                            ? ` · ${integration.lastSnapshot.playersOnline}${
                                integration.lastSnapshot.maxPlayers ? `/${integration.lastSnapshot.maxPlayers}` : ''
                              } players`
                            : ''}
                          {integration.lastSyncedAt ? ` · synced ${relativeTime(integration.lastSyncedAt)}` : ''}
                        </p>
                      ) : null}
                      {integration.lastError ? (
                        <p className="mt-1 flex items-start gap-1.5 text-[11px] text-danger">
                          <IconAlert className="mt-0.5 h-3 w-3 shrink-0" /> {integration.lastError}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Button
                        size="sm"
                        variant="secondary"
                        loading={busy === `test-${integration.id}`}
                        icon={<IconRefresh className="h-3.5 w-3.5" />}
                        onClick={() =>
                          void run(
                            `test-${integration.id}`,
                            () => apiFetch(`/api/v1/integrations/${integration.id}/test`, { method: 'POST' }),
                            { title: 'Connection succeeded', description: 'Live server data stored.' },
                          )
                        }
                      >
                        Test
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setPresenceForm({ name: `${integration.label} presence`, values: {} });
                          setPresenceFor(integration);
                        }}
                      >
                        Create presence
                      </Button>
                      <Button size="sm" variant="ghost" aria-label="Remove integration" onClick={() => setDeleteTarget(integration)}>
                        <IconTrash className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="Community integrations" description="One central bot, scoped by Discord permissions." icon={<IconUsers className="h-4 w-4" />} />
        <CardBody className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-center">
          <div className="space-y-2">
            <p className="text-[12.5px] leading-relaxed text-ink-soft">
              The bot adds slash commands in each server: <code className="text-ink">/community</code> for preset
              status, <code className="text-ink">/presets</code> for published templates and{' '}
              <code className="text-ink">/link</code> to hand out a companion pairing code.
            </p>
            <p className="text-[11px] text-ink-muted">
              It never sets a member’s presence — only the companion can do that, via local RPC.
            </p>
          </div>
          {botInviteUrl ? (
            <ButtonLink href={botInviteUrl} external variant="secondary" icon={<DiscordMark />}>
              Invite bot
            </ButtonLink>
          ) : (
            <Badge tone="warning">Set DISCORD_CLIENT_ID</Badge>
          )}
        </CardBody>
      </Card>

      <Dialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add an integration"
        description="Choose a data source. Automated fields are listed before you save."
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button loading={busy === 'create'} onClick={() => void createIntegration()}>
              Add integration
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            {INTEGRATION_LIST.map((adapter) => (
              <button
                key={adapter.key}
                type="button"
                onClick={() => setForm((current) => ({ ...current, kind: adapter.key }))}
                className={`rounded-xl border p-3 text-left transition-colors ${
                  form.kind === adapter.key ? 'border-brand/50 bg-brand/8' : 'border-line hover:border-line-strong'
                }`}
              >
                <p className="text-[12.5px] font-medium text-ink">{adapter.name}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">
                  {adapter.automation.status === 'requires-credentials'
                    ? `Requires: ${adapter.automation.requires?.join(', ')}`
                    : 'Manual configuration only'}
                </p>
              </button>
            ))}
          </div>

          <Field label="Label" htmlFor="integration-label" required hint="Shown only in your dashboard.">
            <Input
              id="integration-label"
              value={form.label}
              onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))}
              placeholder={definition.name}
            />
          </Field>

          {form.kind === 'fivem' ? (
            <>
              <Field label="Server address" htmlFor="fivem-address" hint="Queried at http://address/info.json — public data only.">
                <Input
                  id="fivem-address"
                  value={form.serverAddress}
                  onChange={(event) => setForm((current) => ({ ...current, serverAddress: event.target.value }))}
                  placeholder="203.0.113.10:30120"
                />
              </Field>
              <Field label="Display name" htmlFor="fivem-name" hint="Optional override if the server does not expose one.">
                <Input
                  id="fivem-name"
                  value={form.serverName}
                  onChange={(event) => setForm((current) => ({ ...current, serverName: event.target.value }))}
                  placeholder="Los Santos Life RP"
                />
              </Field>
            </>
          ) : (
            <>
              <Field label="Community name" htmlFor="erlc-community">
                <Input
                  id="erlc-community"
                  value={form.communityName}
                  onChange={(event) => setForm((current) => ({ ...current, communityName: event.target.value }))}
                  placeholder="Liberty County Roleplay"
                />
              </Field>
              <Field
                label="ER:LC server key"
                htmlFor="erlc-key"
                hint="From the ER settings UI on your private server. Requires the ERLC API server pack. Encrypted with AES-256-GCM."
              >
                <Input
                  id="erlc-key"
                  type="password"
                  value={form.serverKey}
                  onChange={(event) => setForm((current) => ({ ...current, serverKey: event.target.value }))}
                  placeholder="Server-Key"
                  autoComplete="off"
                />
              </Field>
            </>
          )}

          <Callout tone="neutral" icon={<IconInfo className="h-4 w-4" />}>
            {definition.automation.playerLevel}
          </Callout>
        </div>
      </Dialog>

      <Dialog
        open={presenceFor !== null}
        onClose={() => setPresenceFor(null)}
        title="Create presence from integration"
        description={
          presenceFor
            ? `${getIntegration(presenceFor.kind).name} fills the automated fields; the rest are yours.`
            : undefined
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setPresenceFor(null)}>
              Cancel
            </Button>
            <Button loading={busy === 'presence'} onClick={() => void createPresence()}>
              Create draft
            </Button>
          </>
        }
      >
        {presenceFor ? (
          <div className="space-y-3">
            <Field label="Presence name" htmlFor="integration-presence-name" required>
              <Input
                id="integration-presence-name"
                value={presenceForm.name}
                onChange={(event) => setPresenceForm((current) => ({ ...current, name: event.target.value }))}
              />
            </Field>
            {getIntegration(presenceFor.kind).fields.map((field) => (
              <Field key={field.key} label={field.label} htmlFor={`field-${field.key}`} hint={field.help} required={field.required}>
                {field.kind === 'select' ? (
                  <Select
                    id={`field-${field.key}`}
                    value={presenceForm.values[field.key] ?? field.options?.[0]?.value ?? ''}
                    onChange={(event) =>
                      setPresenceForm((current) => ({
                        ...current,
                        values: { ...current.values, [field.key]: event.target.value },
                      }))
                    }
                  >
                    {field.options?.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    id={`field-${field.key}`}
                    value={presenceForm.values[field.key] ?? ''}
                    placeholder={field.placeholder}
                    maxLength={field.maxLength}
                    onChange={(event) =>
                      setPresenceForm((current) => ({
                        ...current,
                        values: { ...current.values, [field.key]: event.target.value },
                      }))
                    }
                  />
                )}
              </Field>
            ))}
            <Callout tone="brand" icon={<IconInfo className="h-4 w-4" />}>
              The draft opens in the editor where you can add artwork, party size and buttons before activating.
            </Callout>
          </div>
        ) : null}
      </Dialog>

      <Dialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title={`Remove “${deleteTarget?.label ?? ''}”?`}
        description="Stored credentials are deleted with the integration. Presences created from it are kept."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="danger" loading={busy === 'delete'} onClick={() => void deleteIntegration()}>
              Remove
            </Button>
          </>
        }
      />
    </div>
  );
}

function Link2({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} className="inline-flex items-center gap-1.5 text-[12px] text-brand-soft hover:text-ink">
      {label} <IconArrowRight className="h-3 w-3" />
    </a>
  );
}

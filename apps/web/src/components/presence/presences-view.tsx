'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { summarizePresence, type PresencePayload } from '@avenqio/shared';
import { apiFetch } from '@/lib/api-client';
import { Badge, Card, CardBody, CardHeader, EmptyState, SectionHeader } from '@/components/ui/display';
import { Button, ButtonLink } from '@/components/ui/button';
import { Dialog, Dropdown, useToast } from '@/components/ui/overlay';
import { DiscordPreview } from '@/components/presence/discord-preview';
import {
  IconAlert,
  IconCheck,
  IconCopy,
  IconLayers,
  IconMore,
  IconPencil,
  IconPlay,
  IconPlus,
  IconTrash,
  IconUsers,
} from '@/components/icons';
import { cn } from '@/lib/cn';

type Presence = {
  id: string;
  name: string;
  payload: PresencePayload;
  isActive: boolean;
  source: string;
  serverName: string | null;
  updatedAt: string;
};

type Preset = {
  id: string;
  name: string;
  payload: PresencePayload;
  serverName: string;
  serverId: string;
  verifiedCommunity: boolean;
  canUse: boolean;
};

type Template = { id: string; name: string; payload: PresencePayload };

export function PresencesView({
  presences,
  presets,
  templates,
  user,
  activePresetId,
}: {
  presences: Presence[];
  presets: Preset[];
  templates: Template[];
  user: { displayName: string; avatarUrl: string | null; username: string | null };
  activePresetId: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Presence | null>(null);
  const [tab, setTab] = useState<'mine' | 'community' | 'templates'>('mine');

  const run = async (key: string, action: () => Promise<void>, success?: { title: string; description?: string }) => {
    setBusy(key);
    try {
      await action();
      if (success) toast({ ...success, tone: 'success' });
      router.refresh();
    } catch (error) {
      toast({
        title: 'Action failed',
        description: error instanceof Error ? error.message : undefined,
        tone: 'error',
      });
    } finally {
      setBusy(null);
    }
  };

  const setActive = (presence: Presence) =>
    run(
      `activate-${presence.id}`,
      () =>
        apiFetch(`/api/v1/presences/${presence.id}/activate`, {
          method: 'POST',
          body: { active: !presence.isActive },
        }).then(() => undefined),
      {
        title: presence.isActive ? 'Presence deactivated' : 'Presence activated',
        description: presence.isActive
          ? 'Your companion will clear it on the next sync.'
          : 'The companion publishes it within 30 seconds.',
      },
    );

  const activatePreset = (preset: Preset) =>
    run(
      `preset-${preset.id}`,
      () =>
        apiFetch(`/api/v1/communities/${preset.serverId}/presets/${preset.id}/activate`, {
          method: 'POST',
        }).then(() => undefined),
      { title: `Using “${preset.name}”`, description: 'Community presets update centrally.' },
    );

  const duplicate = (presence: Presence) =>
    run(
      `copy-${presence.id}`,
      () => apiFetch(`/api/v1/presences/${presence.id}/duplicate`, { method: 'POST' }).then(() => undefined),
      { title: 'Presence duplicated' },
    );

  const remove = async () => {
    if (!deleteTarget) return;
    await run(
      'delete',
      () => apiFetch(`/api/v1/presences/${deleteTarget.id}`, { method: 'DELETE' }).then(() => undefined),
      { title: 'Presence deleted' },
    );
    setDeleteTarget(null);
  };

  const useTemplate = (template: Template) =>
    run(
      `template-${template.id}`,
      async () => {
        const created = await apiFetch<{ presenceId: string }>(`/api/v1/templates/${template.id}/use`, {
          method: 'POST',
          body: {},
        });
        router.push(`/dashboard/presences/${created.presenceId}`);
      },
      { title: 'Presence created from template' },
    );

  const deleteTemplate = (template: Template) =>
    run(
      `template-del-${template.id}`,
      () => apiFetch(`/api/v1/templates/${template.id}`, { method: 'DELETE' }).then(() => undefined),
      { title: 'Template deleted' },
    );

  const activeCount = presences.filter((presence) => presence.isActive).length + (activePresetId ? 1 : 0);

  return (
    <div className="space-y-5">
      <SectionHeader
        title="My presences"
        description="Configurations you can publish from the Windows companion. Only one is active at a time — personal or from a community."
        action={
          <ButtonLink href="/dashboard/presences/new" icon={<IconPlus className="h-4 w-4" />}>
            New presence
          </ButtonLink>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-xl border border-line bg-surface p-1">
          {[
            { id: 'mine' as const, label: 'Mine', count: presences.length },
            { id: 'community' as const, label: 'Community', count: presets.length },
            { id: 'templates' as const, label: 'Templates', count: templates.length },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors',
                tab === item.id ? 'bg-elevated text-ink' : 'text-ink-muted hover:text-ink-soft',
              )}
            >
              {item.label}
              <span className="ml-1.5 text-[11px] text-ink-muted">{item.count}</span>
            </button>
          ))}
        </div>
        <p className="text-[12px] text-ink-muted">
          {activeCount === 0 ? 'Nothing active' : '1 active configuration'}
        </p>
      </div>

      {tab === 'mine' ? (
        presences.length === 0 ? (
          <Card>
            <EmptyState
              icon={<IconLayers className="h-5 w-5" />}
              title="No presences yet"
              description="Build a configuration, check the live Discord preview, and activate it. The companion takes it from there."
              action={
                <ButtonLink href="/dashboard/presences/new" icon={<IconPlus className="h-4 w-4" />}>
                  Create presence
                </ButtonLink>
              }
            />
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {presences.map((presence) => (
              <Card key={presence.id} className={cn('flex flex-col', presence.isActive && 'border-brand/35')}>
                <CardHeader
                  title={
                    <span className="flex items-center gap-2">
                      {presence.name}
                      {presence.isActive ? <Badge tone="success" dot>Active</Badge> : null}
                    </span>
                  }
                  description={`${presence.serverName ?? 'Personal'} · ${presence.source}`}
                  action={
                    <Dropdown
                      label={`Actions for ${presence.name}`}
                      trigger={
                        <span className="inline-flex h-8 w-7 items-center justify-center rounded-md border border-line-strong bg-elevated text-ink-soft hover:text-ink">
                          <IconMore className="h-4 w-4" />
                        </span>
                      }
                      items={[
                        {
                          label: 'Duplicate',
                          icon: <IconCopy className="h-4 w-4" />,
                          onSelect: () => void duplicate(presence),
                        },
                        {
                          label: 'Delete',
                          icon: <IconTrash className="h-4 w-4" />,
                          tone: 'danger',
                          onSelect: () => setDeleteTarget(presence),
                        },
                      ]}
                    />
                  }
                />

                <CardBody className="flex flex-1 flex-col items-center gap-3 py-4">
                  <DiscordPreview payload={presence.payload} user={user} variant="compact" showBanner={false} />
                  <p className="line-clamp-2 text-center text-[11.5px] leading-relaxed text-ink-muted">
                    {summarizePresence(presence.payload)}
                  </p>
                </CardBody>

                <div className="flex items-center gap-2 border-t border-line px-4 py-3">
                  <ButtonLink
                    href={`/dashboard/presences/${presence.id}`}
                    variant="secondary"
                    size="sm"
                    className="flex-1"
                    icon={<IconPencil className="h-3.5 w-3.5" />}
                  >
                    Edit
                  </ButtonLink>
                  <Button
                    variant={presence.isActive ? 'ghost' : 'primary'}
                    size="sm"
                    className="flex-1"
                    loading={busy === `activate-${presence.id}`}
                    icon={presence.isActive ? <IconCheck className="h-3.5 w-3.5" /> : <IconPlay className="h-3.5 w-3.5" />}
                    onClick={() => void setActive(presence)}
                  >
                    {presence.isActive ? 'Deactivate' : 'Activate'}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )
      ) : null}

      {tab === 'community' ? (
        presets.length === 0 ? (
          <Card>
            <EmptyState
              icon={<IconUsers className="h-5 w-5" />}
              title="No community presets available"
              description="When a community you belong to publishes an approved preset, it appears here — and updates automatically whenever managers edit it."
              action={
                <ButtonLink href="/dashboard/communities" variant="secondary">
                  Browse communities
                </ButtonLink>
              }
            />
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {presets.map((preset) => {
              const isActive = preset.id === activePresetId;
              return (
                <Card key={preset.id} className={cn('flex flex-col', isActive && 'border-brand/35')}>
                  <CardHeader
                    title={
                      <span className="flex flex-wrap items-center gap-1.5">
                        {preset.name}
                        {isActive ? <Badge tone="success" dot>Active</Badge> : null}
                        {preset.verifiedCommunity ? <Badge tone="brand">Verified</Badge> : null}
                      </span>
                    }
                    description={preset.serverName}
                    icon={<IconUsers className="h-4 w-4" />}
                  />
                  <CardBody className="flex flex-1 flex-col items-center gap-3 py-4">
                    <DiscordPreview payload={preset.payload} user={user} variant="compact" showBanner={false} />
                  </CardBody>
                  <div className="border-t border-line px-4 py-3">
                    <Button
                      variant={isActive ? 'ghost' : 'primary'}
                      size="sm"
                      className="w-full"
                      loading={busy === `preset-${preset.id}`}
                      onClick={() => void activatePreset(preset)}
                    >
                      {isActive ? 'Deactivate' : 'Use this preset'}
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )
      ) : null}

      {tab === 'templates' ? (
        templates.length === 0 ? (
          <Card>
            <EmptyState
              icon={<IconLayers className="h-5 w-5" />}
              title="No templates yet"
              description="Open a presence and use “Save as template” to reuse its configuration."
              action={
                <ButtonLink href="/dashboard/presences" variant="secondary">
                  Back to presences
                </ButtonLink>
              }
            />
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {templates.map((template) => (
              <Card key={template.id} className="flex flex-col">
                <CardHeader title={template.name} description={summarizePresence(template.payload)} />
                <div className="flex items-center gap-2 px-4 py-3">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="flex-1"
                    loading={busy === `template-${template.id}`}
                    onClick={() => void useTemplate(template)}
                  >
                    Use template
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete template ${template.name}`}
                    onClick={() => void deleteTemplate(template)}
                    loading={busy === `template-del-${template.id}`}
                  >
                    <IconTrash className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )
      ) : null}

      <Dialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title={`Delete “${deleteTarget?.name ?? ''}”?`}
        description="This cannot be undone. If it is active, your companion clears it on the next sync."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="danger" loading={busy === 'delete'} onClick={() => void remove()}>
              Delete
            </Button>
          </>
        }
      >
        <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-ink-muted">
          <IconAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
          Templates created from this presence are kept.
        </p>
      </Dialog>

      <p className="text-center text-[11px] text-ink-muted">
        <Link href="/dashboard/settings#devices" className="hover:text-ink-soft">
          Companion not connected?
        </Link>{' '}
        Pair it in two clicks.
      </p>
    </div>
  );
}

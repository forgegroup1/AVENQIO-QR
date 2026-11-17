'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  PRESET_STATUS_LABELS,
  SERVER_ROLE_LABELS,
  relativeTime,
  roleAtLeast,
  summarizePresence,
  type PresencePayload,
  type ServerRole,
} from '@avenqio/shared';
import { apiFetch } from '@/lib/api-client';
import { Avatar, Badge, Callout, Card, CardBody, CardHeader, EmptyState } from '@/components/ui/display';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Switch } from '@/components/ui/form';
import { Dialog, useToast } from '@/components/ui/overlay';
import { Tabs } from '@/components/ui/tabs';
import { PresetDialog, type EditablePreset } from '@/components/communities/preset-dialog';
import { PresetAccessDialog } from '@/components/communities/preset-access-dialog';
import {
  DiscordMark,
  IconActivity,
  IconAlert,
  IconCheck,
  IconExternal,
  IconInfo,
  IconPencil,
  IconPlay,
  IconPlus,
  IconShield,
  IconTrash,
  IconUsers,
} from '@/components/icons';

export type CommunityDetail = {
  id: string;
  name: string;
  iconUrl: string | null;
  discordGuildId: string;
  role: ServerRole;
  verificationStatus: 'unverified' | 'pending' | 'verified' | 'rejected';
  verificationNote: string | null;
  settings: { defaultPresetRole?: string; allowMemberSubmissions?: boolean };
  memberCount: number | null;
  botPresent: boolean;
};

export type CommunityPreset = {
  id: string;
  name: string;
  description: string | null;
  payload: PresencePayload;
  status: 'draft' | 'published' | 'archived';
  minRole: ServerRole;
  verifiedCommunity: boolean;
  canUse: boolean;
  updatedAt: string;
};

export type CommunityMemberRow = {
  membershipId: string;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  role: ServerRole;
  createdAt: string;
};

const VERIFICATION_COPY = {
  unverified: { tone: 'outline' as const, label: 'Unverified community' },
  pending: { tone: 'warning' as const, label: 'Verification pending' },
  verified: { tone: 'success' as const, label: 'Verified community' },
  rejected: { tone: 'danger' as const, label: 'Verification rejected' },
};

export function CommunityView({
  community,
  presets,
  members,
  activity,
  botInviteUrl,
  user,
}: {
  community: CommunityDetail;
  presets: CommunityPreset[];
  members: CommunityMemberRow[];
  activity: Array<{ id: string; message: string; createdAt: string; actorType: string }>;
  botInviteUrl: string | null;
  user: { displayName: string; avatarUrl: string | null; username: string | null };
}) {
  const router = useRouter();
  const { toast } = useToast();
  const canManage = roleAtLeast(community.role, 'preset_manager');
  const isAdmin = roleAtLeast(community.role, 'admin');

  const [composerOpen, setComposerOpen] = useState(false);
  const [editing, setEditing] = useState<EditablePreset | null>(null);
  const [accessTarget, setAccessTarget] = useState<CommunityPreset | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CommunityPreset | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [settings, setSettings] = useState({
    defaultPresetRole: community.settings.defaultPresetRole ?? 'member',
    allowMemberSubmissions: community.settings.allowMemberSubmissions ?? false,
  });

  const run = async (key: string, action: () => Promise<unknown>, success: { title: string; description?: string }) => {
    setBusy(key);
    try {
      await action();
      toast({ ...success, tone: 'success' });
      router.refresh();
    } catch (error) {
      toast({ title: 'Action failed', description: error instanceof Error ? error.message : undefined, tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const setStatus = (preset: CommunityPreset, status: 'draft' | 'published' | 'archived') =>
    run(
      `status-${preset.id}`,
      () =>
        apiFetch(`/api/v1/communities/${community.id}/presets/${preset.id}`, {
          method: 'PATCH',
          body: { status },
        }),
      {
        title: status === 'published' ? 'Preset published' : status === 'archived' ? 'Preset archived' : 'Moved to draft',
        description:
          status === 'published'
            ? 'Members with access can now activate it.'
            : status === 'archived'
              ? 'Members using it stop seeing it as available.'
              : 'Only managers can see it now.',
      },
    );

  const activate = (preset: CommunityPreset) =>
    run(
      `activate-${preset.id}`,
      () =>
        apiFetch(`/api/v1/communities/${community.id}/presets/${preset.id}/activate`, {
          method: 'POST',
        }),
      { title: `Using “${preset.name}”`, description: 'The companion applies it within 30 seconds.' },
    );

  const remove = async () => {
    if (!deleteTarget) return;
    await run(
      'delete',
      () => apiFetch(`/api/v1/communities/${community.id}/presets/${deleteTarget.id}`, { method: 'DELETE' }),
      { title: 'Preset deleted' },
    );
    setDeleteTarget(null);
  };

  const updateMember = (member: CommunityMemberRow, role: ServerRole) =>
    run(
      `member-${member.membershipId}`,
      () =>
        apiFetch(`/api/v1/communities/${community.id}/members/${member.membershipId}`, {
          method: 'PATCH',
          body: { role },
        }),
      { title: 'Role updated', description: `${member.displayName} is now ${SERVER_ROLE_LABELS[role]}.` },
    );

  const saveSettings = () =>
    run(
      'settings',
      () =>
        apiFetch(`/api/v1/communities/${community.id}`, {
          method: 'PATCH',
          body: { settings },
        }),
      { title: 'Community settings saved' },
    );

  const requestVerification = () =>
    run('verify', () => apiFetch(`/api/v1/communities/${community.id}/verification`, { method: 'POST' }), {
      title: 'Verification requested',
      description: 'Avenqio staff review community presets before granting the verified badge.',
    });

  const presetCount = presets.length;
  const publishedCount = presets.filter((preset) => preset.status === 'published').length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3.5">
          <Avatar src={community.iconUrl} name={community.name} size={48} ring />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-[22px] font-semibold tracking-tight text-ink">{community.name}</h1>
              <Badge tone={VERIFICATION_COPY[community.verificationStatus].tone}>
                {VERIFICATION_COPY[community.verificationStatus].label}
              </Badge>
              <Badge tone="outline">{SERVER_ROLE_LABELS[community.role]}</Badge>
            </div>
            <p className="mt-1 font-mono text-[11px] text-ink-muted">guild {community.discordGuildId}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {botInviteUrl && !community.botPresent ? (
            <a
              href={botInviteUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-line-strong bg-elevated px-4 text-sm text-ink hover:border-[#3d3552]"
            >
              <DiscordMark /> Add the bot <IconExternal className="h-3.5 w-3.5" />
            </a>
          ) : null}
          {canManage ? (
            <Button icon={<IconPlus className="h-4 w-4" />} onClick={() => { setEditing(null); setComposerOpen(true); }}>
              New preset
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.13em] text-ink-muted">Presets</p>
          <p className="mt-1 text-xl font-semibold text-ink">{presetCount}</p>
          <p className="text-[11px] text-ink-muted">{publishedCount} published</p>
        </div>
        <div className="card px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.13em] text-ink-muted">Linked members</p>
          <p className="mt-1 text-xl font-semibold text-ink">{members.length || '—'}</p>
          <p className="text-[11px] text-ink-muted">
            {community.memberCount !== null ? `${community.memberCount} in Discord` : 'Discord count unavailable'}
          </p>
        </div>
        <div className="card px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.13em] text-ink-muted">Bot</p>
          <p className="mt-1 flex items-center gap-2 text-xl font-semibold text-ink">
            {community.botPresent ? 'Present' : 'Not added'}
            <span className={`h-2 w-2 rounded-full ${community.botPresent ? 'bg-success' : 'bg-ink-muted'}`} />
          </p>
          <p className="text-[11px] text-ink-muted">
            {community.botPresent ? 'Slash commands available' : 'Invite it to enable commands'}
          </p>
        </div>
      </div>

      <Tabs
        initial="presets"
        items={[
          {
            id: 'presets',
            label: 'Presets',
            badge: <span className="text-[11px] text-ink-muted">{presetCount}</span>,
            content: (
              <Card>
                <CardHeader
                  title="Community presets"
                  description={
                    canManage
                      ? 'Published presets are available to members who meet the role requirement.'
                      : 'Presets published by your community managers that you can use.'
                  }
                  icon={<IconUsers className="h-4 w-4" />}
                />
                {presets.length === 0 ? (
                  <EmptyState
                    icon={<IconUsers className="h-5 w-5" />}
                    title="No presets yet"
                    description="Create an approved configuration once, then let members use it without rebuilding it themselves."
                    action={
                      canManage ? (
                        <Button onClick={() => { setEditing(null); setComposerOpen(true); }}>
                          Create preset
                        </Button>
                      ) : undefined
                    }
                  />
                ) : (
                  <ul className="divide-y divide-line">
                    {presets.map((preset) => (
                      <li key={preset.id} className="px-5 py-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-[13.5px] font-medium text-ink">{preset.name}</p>
                              <Badge
                                tone={
                                  preset.status === 'published' ? 'success' : preset.status === 'draft' ? 'neutral' : 'outline'
                                }
                              >
                                {PRESET_STATUS_LABELS[preset.status]}
                              </Badge>
                              <Badge tone="outline">{SERVER_ROLE_LABELS[preset.minRole]}+</Badge>
                              {preset.verifiedCommunity ? <Badge tone="brand">Verified</Badge> : null}
                            </div>
                            <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-ink-muted">
                              {preset.description ?? summarizePresence(preset.payload)}
                            </p>
                            <p className="mt-1 text-[10.5px] text-ink-muted">Updated {relativeTime(preset.updatedAt)}</p>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {preset.canUse && preset.status === 'published' ? (
                              <Button
                                size="sm"
                                variant="secondary"
                                loading={busy === `activate-${preset.id}`}
                                icon={<IconPlay className="h-3.5 w-3.5" />}
                                onClick={() => void activate(preset)}
                              >
                                Use
                              </Button>
                            ) : null}
                            {canManage ? (
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  icon={<IconPencil className="h-3.5 w-3.5" />}
                                  onClick={() => {
                                    setEditing({
                                      id: preset.id,
                                      name: preset.name,
                                      description: preset.description,
                                      payload: preset.payload,
                                      minRole: preset.minRole,
                                      status: preset.status,
                                    });
                                    setComposerOpen(true);
                                  }}
                                >
                                  Edit
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => setAccessTarget(preset)}>
                                  Access
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  loading={busy === `status-${preset.id}`}
                                  onClick={() =>
                                    void setStatus(preset, preset.status === 'published' ? 'draft' : 'published')
                                  }
                                >
                                  {preset.status === 'published' ? 'Unpublish' : 'Publish'}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  aria-label={`Delete ${preset.name}`}
                                  onClick={() => setDeleteTarget(preset)}
                                >
                                  <IconTrash className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            ) : null}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            ),
          },
          ...(isAdmin
            ? [
                {
                  id: 'members',
                  label: 'Members',
                  badge: <span className="text-[11px] text-ink-muted">{members.length}</span>,
                  content: (
                    <Card>
                      <CardHeader
                        title="Members & permissions"
                        description="Product roles for people who signed in. Discord remains the source of truth for guild membership."
                        icon={<IconUsers className="h-4 w-4" />}
                      />
                      <ul className="divide-y divide-line">
                        {members.map((member) => (
                          <li key={member.membershipId} className="flex flex-wrap items-center gap-3 px-5 py-3">
                            <Avatar src={member.avatarUrl} name={member.displayName} size={30} />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[13px] text-ink">{member.displayName}</p>
                              <p className="text-[10.5px] text-ink-muted">Joined {relativeTime(member.createdAt)}</p>
                            </div>
                            {member.role === 'owner' ? (
                              <Badge tone="brand">Owner</Badge>
                            ) : (
                              <Select
                                aria-label={`Role for ${member.displayName}`}
                                className="h-8 w-[168px] text-[12px]"
                                value={member.role}
                                disabled={busy === `member-${member.membershipId}`}
                                onChange={(event) => void updateMember(member, event.target.value as ServerRole)}
                              >
                                <option value="member">Member</option>
                                <option value="preset_manager">Preset manager</option>
                                <option value="admin">Administrator</option>
                              </Select>
                            )}
                          </li>
                        ))}
                      </ul>
                      <CardBody>
                        <p className="flex items-start gap-2 text-[11.5px] leading-relaxed text-ink-muted">
                          <IconInfo className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          Only the guild owner can grant administrator. You cannot change your own role, and
                          roles are never imported automatically from Discord role names.
                        </p>
                      </CardBody>
                    </Card>
                  ),
                },
                {
                  id: 'settings',
                  label: 'Settings',
                  content: (
                    <div className="grid gap-4 lg:grid-cols-2">
                      <Card>
                        <CardHeader title="Preset defaults" description="How new presets and member submissions behave." icon={<IconShield className="h-4 w-4" />} />
                        <CardBody className="space-y-4">
                          <Field
                            label="Default minimum role"
                            htmlFor="default-role"
                            hint="Pre-selected when creating a preset. Each preset can override it."
                          >
                            <Select
                              id="default-role"
                              value={settings.defaultPresetRole}
                              onChange={(event) =>
                                setSettings((current) => ({ ...current, defaultPresetRole: event.target.value }))
                              }
                            >
                              <option value="member">All members</option>
                              <option value="preset_manager">Preset managers and above</option>
                              <option value="admin">Administrators only</option>
                            </Select>
                          </Field>
                          <Switch
                            id="member-submissions"
                            checked={settings.allowMemberSubmissions}
                            onChange={(next) => setSettings((current) => ({ ...current, allowMemberSubmissions: next }))}
                            label="Allow member submissions"
                            description="Lets members propose presets that managers review before publishing. The proposal inbox ships in a later version — today this only stores the preference."
                          />
                          <Button loading={busy === 'settings'} onClick={() => void saveSettings()}>
                            Save settings
                          </Button>
                        </CardBody>
                      </Card>

                      <div className="space-y-4">
                        <Card>
                          <CardHeader title="Verification" description="The verified badge is granted by Avenqio staff after review." icon={<IconShield className="h-4 w-4" />} />
                          <CardBody className="space-y-3">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-[12.5px] text-ink-soft">Status</span>
                              <Badge tone={VERIFICATION_COPY[community.verificationStatus].tone}>
                                {VERIFICATION_COPY[community.verificationStatus].label}
                              </Badge>
                            </div>
                            {community.verificationNote ? (
                              <p className="text-[11.5px] leading-relaxed text-ink-muted">{community.verificationNote}</p>
                            ) : null}
                            <p className="text-[11.5px] leading-relaxed text-ink-muted">
                              Verification prevents impersonation: only reviewed communities can present their
                              presets with a verified badge, and members always see which community owns a preset.
                            </p>
                            {community.verificationStatus === 'verified' ? (
                              <p className="flex items-center gap-2 text-[12px] text-success">
                                <IconCheck className="h-4 w-4" /> Verified by Avenqio staff
                              </p>
                            ) : (
                              <Button
                                variant="secondary"
                                loading={busy === 'verify'}
                                disabled={community.verificationStatus === 'pending'}
                                onClick={() => void requestVerification()}
                              >
                                {community.verificationStatus === 'pending' ? 'Request pending' : 'Request verification'}
                              </Button>
                            )}
                          </CardBody>
                        </Card>

                        <Card>
                          <CardHeader title="Discord bot" description="One central bot serves every community." icon={<DiscordMark className="h-4 w-4" />} />
                          <CardBody className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-[12.5px] text-ink-soft">Presence in this guild</span>
                              <Badge tone={community.botPresent ? 'success' : 'warning'} dot>
                                {community.botPresent ? 'Connected' : 'Not connected'}
                              </Badge>
                            </div>
                            <p className="text-[11.5px] leading-relaxed text-ink-muted">
                              The bot syncs guild metadata, exposes community presets through slash commands and
                              never changes member presences.
                            </p>
                            {botInviteUrl ? (
                              <a
                                href={botInviteUrl}
                                target="_blank"
                                rel="noreferrer noopener"
                                className="inline-flex items-center gap-2 text-[12.5px] text-brand-soft hover:text-ink"
                              >
                                <DiscordMark className="h-3.5 w-3.5" /> Bot invite <IconExternal className="h-3 w-3" />
                              </a>
                            ) : (
                              <p className="text-[11px] text-ink-muted">
                                Set <code>DISCORD_CLIENT_ID</code> to generate an invite URL.
                              </p>
                            )}
                          </CardBody>
                        </Card>
                      </div>
                    </div>
                  ),
                },
                {
                  id: 'activity',
                  label: 'Activity',
                  content: (
                    <Card>
                      <CardHeader title="Community activity" description="Audited actions from members and the bot." icon={<IconActivity className="h-4 w-4" />} />
                      {activity.length === 0 ? (
                        <EmptyState title="No activity yet" description="Preset publications and role changes appear here." />
                      ) : (
                        <ul className="divide-y divide-line">
                          {activity.map((entry) => (
                            <li key={entry.id} className="flex items-start gap-3 px-5 py-3">
                              <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-md border border-line-strong bg-elevated text-ink-muted">
                                <IconActivity className="h-3 w-3" />
                              </span>
                              <div className="min-w-0">
                                <p className="text-[12.5px] text-ink-soft">{entry.message}</p>
                                <p className="text-[10.5px] text-ink-muted">
                                  {entry.actorType} · {relativeTime(entry.createdAt)}
                                </p>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </Card>
                  ),
                },
              ]
            : [
                {
                  id: 'settings',
                  label: 'Server',
                  content: (
                    <Card>
                      <CardHeader title="Server information" description="Read-only details for members." />
                      <CardBody className="space-y-2 text-[12.5px] text-ink-soft">
                        <p className="flex items-center justify-between gap-4">
                          <span>Discord server id</span>
                          <span className="font-mono text-[11px] text-ink-muted">{community.discordGuildId}</span>
                        </p>
                        <p className="flex items-center justify-between gap-4">
                          <span>Your role</span>
                          <Badge tone="outline">{SERVER_ROLE_LABELS[community.role]}</Badge>
                        </p>
                        <p className="flex items-center justify-between gap-4">
                          <span>Bot present</span>
                          <Badge tone={community.botPresent ? 'success' : 'warning'}>{community.botPresent ? 'Yes' : 'No'}</Badge>
                        </p>
                        <Callout tone="neutral" icon={<IconInfo className="h-4 w-4" />}>
                          You can use published presets. Ask a community administrator for the Preset manager role
                          if you need to publish presets.
                        </Callout>
                      </CardBody>
                    </Card>
                  ),
                },
              ]),
        ]}
      />

      <PresetDialog
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        communityId={community.id}
        preset={editing}
        onSaved={() => router.refresh()}
        user={user}
      />

      <PresetAccessDialog
        open={accessTarget !== null}
        onClose={() => setAccessTarget(null)}
        communityId={community.id}
        preset={accessTarget ? { id: accessTarget.id, name: accessTarget.name, minRole: accessTarget.minRole } : null}
        members={members.map((member) => ({
          userId: member.userId,
          displayName: member.displayName,
          avatarUrl: member.avatarUrl,
          role: member.role,
        }))}
        onSaved={() => router.refresh()}
      />

      <Dialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title={`Delete “${deleteTarget?.name ?? ''}”?`}
        description="Members using this preset lose it on their next sync. This cannot be undone."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="danger" loading={busy === 'delete'} onClick={() => void remove()}>
              Delete preset
            </Button>
          </>
        }
      >
        <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-ink-muted">
          <IconAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
          Consider archiving instead: it removes availability without destroying the payload.
        </p>
      </Dialog>
    </div>
  );
}

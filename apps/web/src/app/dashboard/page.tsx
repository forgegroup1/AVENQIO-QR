import Link from 'next/link';
import { Suspense } from 'react';
import { relativeTime } from '@avenqio/shared';
import { requirePageUser } from '@/server/auth/session';
import { getOverview } from '@/server/services/overview';
import { botInviteUrl } from '@/server/services/communities';
import { DiscordPreview } from '@/components/presence/discord-preview';
import { Avatar, Badge, Callout, Card, CardBody, CardHeader, EmptyState, SectionHeader, Skeleton, Stat } from '@/components/ui/display';
import { Button, ButtonLink } from '@/components/ui/button';
import {
  DiscordMark,
  IconActivity,
  IconAlert,
  IconArrowRight,
  IconLayers,
  IconMonitor,
  IconPlus,
  IconSparkles,
  IconUsers,
} from '@/components/icons';

export const metadata = { title: 'Overview' };
export const dynamic = 'force-dynamic';

const ACTIVITY_LABEL: Record<string, string> = {
  'presence.activated': 'Presence activated',
  'presence.created': 'Presence created',
  'presence.updated': 'Presence updated',
  'presence.deleted': 'Presence deleted',
  'preset.published': 'Preset published',
  'preset.activated': 'Community preset activated',
  'device.linked': 'Companion linked',
  'device.pairing_created': 'Pairing code generated',
  'device.revoked': 'Device revoked',
  'account.signed_in': 'Signed in',
};

/**
 * The skeleton lives in an in-page Suspense boundary rather than in a
 * `loading.tsx`, because a route-level loading boundary flushes the response
 * before pages can report a real 404 for other users' resources.
 */
export default async function OverviewPage() {
  const user = await requirePageUser('/dashboard');
  return (
    <Suspense fallback={<OverviewSkeleton />}>
      <OverviewContent userId={user.id} avatarUrl={user.avatarUrl} />
    </Suspense>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading dashboard">
      <div className="space-y-2">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-[86px] rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.25fr_0.95fr]">
        <Skeleton className="h-[320px] rounded-2xl" />
        <Skeleton className="h-[320px] rounded-2xl" />
      </div>
    </div>
  );
}

async function OverviewContent({ userId, avatarUrl }: { userId: string; avatarUrl: string | null }) {
  const overview = await getOverview(userId);
  const { profile, stats, communities, presences, presets, devices, active, activity } = overview;

  const linkedDevice = devices.find((device) => device.status === 'linked');
  const companionOnline = Boolean(
    linkedDevice?.lastSeenAt && Date.now() - new Date(linkedDevice.lastSeenAt).getTime() < 5 * 60 * 1000,
  );
  const activePresence = presences.find((presence) => presence.id === active.presenceId);
  const activePreset = presets.find((preset) => preset.id === active.presetId);
  const firstName = profile.displayName.split(' ')[0] ??profile.displayName;
  const invite = botInviteUrl();

  return (
    <div className="space-y-6">
      <SectionHeader
        title={`Welcome back, ${firstName}`}
        description={
          active.kind === 'none'
            ? 'Nothing is published right now. Activate a presence and the companion will pick it up on its next sync.'
            : `Your companion is publishing “${active.label}”. Edits reach it within 30 seconds.`
        }
        action={
          <div className="flex gap-2">
            <ButtonLink href="/dashboard/presences/new" icon={<IconPlus className="h-4 w-4" />}>
              New presence
            </ButtonLink>
          </div>
        }
      />

      {profile.discord === null ? (
        <Callout tone="warning" icon={<IconAlert className="h-4 w-4" />} title="Development account">
          This account is a seeded fixture (no Discord identity). Sign in with Discord to import the servers
          you manage.
        </Callout>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Communities"
          value={stats.communities}
          hint={
            communities.length
              ? communities.map((community) => community.name).slice(0, 2).join(', ')
              : 'None connected yet'
          }
          icon={<IconUsers />}
          tone="brand"
        />
        <Stat
          label="My presences"
          value={stats.presences}
          hint={`${stats.presences === 0 ? 'No' : stats.presences} configuration${stats.presences === 1 ? '' : 's'}`}
          icon={<IconLayers />}
        />
        <Stat
          label="Published now"
          value={active.kind === 'none' ? '—' : 'Live'}
          hint={active.label ?? 'Nothing active'}
          icon={<IconActivity />}
          tone={active.kind === 'none' ? 'neutral' : 'success'}
        />
        <Stat
          label="Companion"
          value={companionOnline ? 'Online' : 'Offline'}
          hint={linkedDevice ? `${linkedDevice.name}${linkedDevice.appVersion ? ` · v${linkedDevice.appVersion}` : ''}` : 'No device linked'}
          icon={<IconMonitor />}
          tone={companionOnline ? 'success' : 'warning'}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.25fr_0.95fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Active presence"
              description={
                active.kind === 'community_preset'
                  ? 'Resolved live from a community preset — central edits apply instantly.'
                  : active.kind === 'presence'
                    ? 'Your companion publishes this configuration.'
                    : 'Nothing is being published to Discord right now.'
              }
              icon={<IconActivity className="h-4 w-4" />}
              action={
                active.kind === 'none' ? null : (
                  <ButtonLink
                    href={
                      active.presenceId
                        ? `/dashboard/presences/${active.presenceId}`
                        : `/dashboard/communities/${activePreset?.serverId ?? ''}`
                    }
                    variant="secondary"
                    size="sm"
                  >
                    Open
                  </ButtonLink>
                )
              }
            />
            <CardBody>
              {active.payload ? (
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                  <DiscordPreview
                    payload={active.payload}
                    user={{
                      displayName: profile.displayName,
                      avatarUrl,
                      username: profile.discord?.username ?? null,
                    }}
                    variant="compact"
                  />
                  <div className="min-w-0 flex-1 space-y-2">
                    <p className="text-[13px] font-medium text-ink">{active.label}</p>
                    {active.kind === 'community_preset' ? (
                      <Badge tone="brand">Community preset</Badge>
                    ) : (
                      <Badge tone="neutral">{activePresence?.source ?? 'manual'}</Badge>
                    )}
                    {activePresence?.serverName ? (
                      <p className="text-[12px] text-ink-muted">{activePresence.serverName}</p>
                    ) : null}
                    <p className="text-[12px] leading-relaxed text-ink-muted">
                      {companionOnline
                        ? 'Companion connected. Changes are applied on its next poll (30s).'
                        : 'Link the Windows companion to publish this presence to Discord.'}
                    </p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <ButtonLink href="/dashboard/presences" variant="secondary" size="sm">
                        Manage presences
                      </ButtonLink>
                      <ButtonLink href="/dashboard/settings#devices" variant="ghost" size="sm" icon={<IconMonitor className="h-3.5 w-3.5" />}>
                        Companion
                      </ButtonLink>
                    </div>
                  </div>
                </div>
              ) : (
                <EmptyState
                  icon={<IconSparkles className="h-5 w-5" />}
                  title="No active presence"
                  description="Create a configuration, validate it against Discord's limits, then activate it. The companion publishes it from your PC."
                  action={
                    <ButtonLink href="/dashboard/presences/new" icon={<IconPlus className="h-4 w-4" />}>
                      Create your first presence
                    </ButtonLink>
                  }
                  className="py-8"
                />
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Recent activity"
              description="Audited actions on your account and communities."
              icon={<IconActivity className="h-4 w-4" />}
            />
            {activity.length === 0 ? (
              <EmptyState title="No activity yet" description="Actions like activating a presence or linking a device appear here." className="py-8" />
            ) : (
              <ul className="divide-y divide-line">
                {activity.map((entry) => (
                  <li key={entry.id} className="flex items-start gap-3 px-5 py-3">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-line-strong bg-elevated text-ink-muted">
                      {entry.actorType === 'companion' ? <IconMonitor className="h-3 w-3" /> : <IconActivity className="h-3 w-3" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] text-ink-soft">{entry.message}</p>
                      <p className="mt-0.5 text-[10.5px] text-ink-muted">
                        {ACTIVITY_LABEL[entry.action] ?? entry.action} · {relativeTime(entry.createdAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Your communities"
              description="Servers where you can manage presences."
              icon={<IconUsers className="h-4 w-4" />}
              action={
                <Link href="/dashboard/communities" className="text-[12px] text-brand-soft hover:text-ink">
                  View all
                </Link>
              }
            />
            {communities.length === 0 ? (
              <EmptyState
                title="No communities yet"
                description={
                  profile.discord
                    ? 'You do not manage any Discord servers yet, or the bot has not been added. Sign in again after gaining Manage Server.'
                    : 'Sign in with Discord to import the servers you manage.'
                }
                action={
                  invite ? (
                    <ButtonLink href={invite} external variant="secondary" size="sm" icon={<DiscordMark />}>
                      Add the bot
                    </ButtonLink>
                  ) : undefined
                }
                className="py-8"
              />
            ) : (
              <ul className="divide-y divide-line">
                {communities.slice(0, 5).map((community) => (
                  <li key={community.id}>
                    <Link
                      href={`/dashboard/communities/${community.id}`}
                      className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-elevated/50"
                    >
                      <Avatar src={community.iconUrl} name={community.name} size={30} ring />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-ink">{community.name}</p>
                        <p className="text-[11px] text-ink-muted">
                          {community.publishedPresetCount} published preset{community.publishedPresetCount === 1 ? '' : 's'}
                          {community.memberCount !== null ? ` · ${community.memberCount} members` : ''}
                        </p>
                      </div>
                      {community.verificationStatus === 'verified' ? (
                        <Badge tone="success">Verified</Badge>
                      ) : community.verificationStatus === 'pending' ? (
                        <Badge tone="warning">Pending</Badge>
                      ) : (
                        <Badge tone="outline">{[community.role]}</Badge>
                      )}
                      <IconArrowRight className="h-3.5 w-3.5 text-ink-muted" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Companion"
              description="The desktop app that owns the Discord RPC connection."
              icon={<IconMonitor className="h-4 w-4" />}
              action={
                <Link href="/dashboard/settings#devices" className="text-[12px] text-brand-soft hover:text-ink">
                  Devices
                </Link>
              }
            />
            <CardBody className="space-y-3">
              <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-bg-deep/50 px-3 py-2.5">
                <div>
                  <p className="text-[12.5px] font-medium text-ink">
                    {linkedDevice ? linkedDevice.name : 'No device linked'}
                  </p>
                  <p className="text-[11px] text-ink-muted">
                    {linkedDevice?.lastSeenAt
                      ? `Last heartbeat ${relativeTime(linkedDevice.lastSeenAt)}`
                      : 'Generate a pairing code to connect'}
                  </p>
                </div>
                <Badge tone={companionOnline ? 'success' : 'outline'} dot>
                  {companionOnline ? 'Online' : 'Offline'}
                </Badge>
              </div>
              {linkedDevice?.lastRpcConnected === false ? (
                <p className="text-[11.5px] leading-relaxed text-warning">
                  The companion is running but Discord is not — start the Discord desktop client.
                </p>
              ) : null}
              <ButtonLink href="/dashboard/settings#devices" variant="secondary" size="sm" className="w-full">
                {linkedDevice ? 'Manage devices' : 'Connect companion'}
              </ButtonLink>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Community presets you can use"
              description={presets.length ? 'Activate one from the presences page.' : 'Published presets appear here.'}
              icon={<IconUsers className="h-4 w-4" />}
            />
            {presets.length === 0 ? (
              <CardBody>
                <p className="text-[12.5px] leading-relaxed text-ink-muted">
                  No presets available. Community managers can publish presets from the community page.
                </p>
              </CardBody>
            ) : (
              <ul className="divide-y divide-line">
                {presets.slice(0, 4).map((preset) => (
                  <li key={preset.id} className="flex items-center gap-2 px-5 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] text-ink">{preset.name}</p>
                      <p className="truncate text-[10.5px] text-ink-muted">
                        {preset.serverName}
                        {preset.verifiedCommunity ? ' · verified' : ''}
                      </p>
                    </div>
                    {preset.id === active.presetId ? <Badge tone="success">Active</Badge> : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

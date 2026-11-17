import Link from 'next/link';
import { requirePageUser } from '@/server/auth/session';
import { listCommunities, botInviteUrl } from '@/server/services/communities';
import { Avatar, Badge, Card, CardHeader, EmptyState, SectionHeader } from '@/components/ui/display';
import { ButtonLink } from '@/components/ui/button';
import { DiscordMark, IconArrowRight, IconExternal, IconShield, IconUsers } from '@/components/icons';
import { SERVER_ROLE_LABELS } from '@avenqio/shared';

export const metadata = { title: 'Communities' };
export const dynamic = 'force-dynamic';

export default async function CommunitiesPage() {
  const user = await requirePageUser('/dashboard/communities');
  const communities = await listCommunities(user.id);
  const invite = botInviteUrl();

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Communities"
        description="Discord servers where you can manage or use presets. AvenqioPresence only lists servers you actually manage — checked at sign-in against Discord permissions."
        action={
          invite ? (
            <ButtonLink href={invite} external variant="secondary" icon={<DiscordMark />}>
              Add the bot
            </ButtonLink>
          ) : null
        }
      />

      {communities.length === 0 ? (
        <Card>
          <EmptyState
            icon={<IconUsers className="h-5 w-5" />}
            title="No communities connected"
            description={
              user.discord
                ? 'Sign in again after gaining “Manage Server” on a Discord server, or invite the bot and let an administrator sign in.'
                : 'Sign in with Discord to import the servers you manage.'
            }
            action={
              invite ? (
                <ButtonLink href={invite} external icon={<DiscordMark />}>
                  Invite AvenqioPresence
                </ButtonLink>
              ) : (
                <ButtonLink href="/docs" variant="secondary">
                  Read setup docs
                </ButtonLink>
              )
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {communities.map((community) => (
            <Card key={community.id} interactive className="flex flex-col">
              <CardHeader
                title={
                  <span className="flex flex-wrap items-center gap-2">
                    {community.name}
                    {community.verificationStatus === 'verified' ? (
                      <Badge tone="success">
                        <IconShield className="h-3 w-3" /> Verified
                      </Badge>
                    ) : community.verificationStatus === 'pending' ? (
                      <Badge tone="warning">Pending</Badge>
                    ) : null}
                  </span>
                }
                description={`${SERVER_ROLE_LABELS[community.role]} · ${community.discordGuildId}`}
                icon={<Avatar src={community.iconUrl} name={community.name} size={28} />}
              />
              <div className="grid grid-cols-3 divide-x divide-line border-b border-line">
                {[
                  { label: 'Presets', value: community.presetCount },
                  { label: 'Published', value: community.publishedPresetCount },
                  { label: 'Members', value: community.memberCount ?? '—' },
                ].map((stat) => (
                  <div key={stat.label} className="px-4 py-3">
                    <p className="text-[10px] uppercase tracking-[0.12em] text-ink-muted">{stat.label}</p>
                    <p className="mt-0.5 text-[15px] font-semibold text-ink">{stat.value}</p>
                  </div>
                ))}
              </div>
              <div className="flex flex-1 flex-wrap items-center justify-between gap-2 px-5 py-3">
                <span className="flex items-center gap-2 text-[11.5px] text-ink-muted">
                  <DiscordMark className="h-3.5 w-3.5" />
                  {community.botPresent ? 'Bot connected' : 'Bot not added'}
                </span>
                <Link
                  href={`/dashboard/communities/${community.id}`}
                  className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-brand-soft hover:text-ink"
                >
                  Manage <IconArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader
          title="How community access works"
          description="Three independent checks, all server-side."
          icon={<IconShield className="h-4 w-4" />}
        />
        <div className="grid gap-4 px-5 py-4 sm:grid-cols-3">
          {[
            {
              title: 'Discord permissions',
              body: 'Only servers where you are owner, administrator or hold Manage Server are imported at sign-in.',
            },
            {
              title: 'Community roles',
              body: 'Product roles (member, preset manager, admin) gate preset management inside the dashboard.',
            },
            {
              title: 'Per-preset access',
              body: 'Each preset has a minimum role plus explicit per-member grants or revokes.',
            },
          ].map((item) => (
            <div key={item.title} className="space-y-1">
              <p className="text-[12.5px] font-medium text-ink">{item.title}</p>
              <p className="text-[11.5px] leading-relaxed text-ink-muted">{item.body}</p>
            </div>
          ))}
        </div>
      </Card>

      {invite ? (
        <p className="flex items-center justify-center gap-2 text-center text-[11.5px] text-ink-muted">
          <IconExternal className="h-3 w-3" /> The same bot serves every community — never one bot per customer.
        </p>
      ) : null}
    </div>
  );
}

import { notFound } from 'next/navigation';
import { roleAtLeast } from '@avenqio/shared';
import { requirePageUser } from '@/server/auth/session';
import { botInviteUrl, getCommunityContext, listCommunityMembers } from '@/server/services/communities';
import { communityActivity } from '@/server/services/activity';
import { listCommunityPresets } from '@/server/services/presets';
import { ApiError } from '@/server/http/errors';
import { CommunityView } from '@/components/communities/community-view';

export const metadata = { title: 'Community' };
export const dynamic = 'force-dynamic';

export default async function CommunityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePageUser(`/dashboard/communities/${id}`);

  let context;
  try {
    context = await getCommunityContext(user.id, id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  const isAdmin = roleAtLeast(context.role, 'admin');
  const [presets, members, activity] = await Promise.all([
    listCommunityPresets(user.id, id),
    isAdmin ? listCommunityMembers(user.id, id) : Promise.resolve([]),
    isAdmin ? communityActivity(id, 15) : Promise.resolve([]),
  ]);

  const settings = (context.server.settings ?? {}) as {
    defaultPresetRole?: string;
    allowMemberSubmissions?: boolean;
  };

  return (
    <CommunityView
      community={{
        id: context.server.id,
        name: context.server.name,
        iconUrl: context.iconUrl,
        discordGuildId: context.server.discord_guild_id,
        role: context.role,
        verificationStatus: context.server.verification_status,
        verificationNote: context.server.verification_note,
        settings,
        memberCount: context.server.member_count,
        botPresent: context.server.bot_present,
      }}
      presets={presets.map((preset) => ({
        id: preset.id,
        name: preset.name,
        description: preset.description,
        payload: preset.payload,
        status: preset.status,
        minRole: preset.minRole,
        verifiedCommunity: preset.verifiedCommunity,
        canUse: preset.canUse,
        updatedAt: preset.updatedAt,
      }))}
      members={members.map((member) => ({
        membershipId: member.membershipId,
        userId: member.userId,
        displayName: member.displayName,
        avatarUrl: member.avatarUrl,
        role: member.role,
        createdAt: member.createdAt,
      }))}
      activity={activity.map((entry) => ({
        id: entry.id,
        message: entry.message,
        createdAt: entry.createdAt,
        actorType: entry.actorType,
      }))}
      botInviteUrl={botInviteUrl()}
      user={{
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        username: user.discord?.username ?? null,
      }}
    />
  );
}

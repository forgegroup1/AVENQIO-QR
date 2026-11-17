import { apiSession } from '@/server/http/auth';
import { ok, readJson, route } from '@/server/http/respond';
import { getCommunityContext, updateCommunitySettings } from '@/server/services/communities';
import { communitySettingsSchema } from '@/server/validation/schemas';

type Context = { params: Promise<{ id: string }> };

export const GET = route(async (request: Request, context: Context) => {
  const user = await apiSession(request);
  const { id } = await context.params;
  const community = await getCommunityContext(user.id, id);
  return ok({
    community: {
      id: community.server.id,
      name: community.server.name,
      discordGuildId: community.server.discord_guild_id,
      role: community.role,
      verificationStatus: community.server.verification_status,
      settings: community.server.settings,
      memberCount: community.server.member_count,
      botPresent: community.server.bot_present,
      iconUrl: community.iconUrl,
    },
  });
});

export const PATCH = route(async (request: Request, context: Context) => {
  const user = await apiSession(request);
  const { id } = await context.params;
  const body = await readJson(request, communitySettingsSchema);
  await updateCommunitySettings(user.id, id, body);
  return ok({ ok: true });
});

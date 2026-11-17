import { requireBotService } from '@/server/http/auth';
import { ok, route } from '@/server/http/respond';
import { getCommunityForBot } from '@/server/services/bot';

type Context = { params: Promise<{ guildId: string }> };

export const GET = route(async (request: Request, context: Context) => {
  requireBotService(request);
  const { guildId } = await context.params;
  return ok(await getCommunityForBot(guildId));
});

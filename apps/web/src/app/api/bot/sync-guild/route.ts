import { requireBotService } from '@/server/http/auth';
import { ok, readJson, route } from '@/server/http/respond';
import { syncGuildFromBot } from '@/server/services/bot';
import { botSyncGuildSchema } from '@/server/validation/schemas';

export const POST = route(async (request: Request) => {
  requireBotService(request);
  const body = await readJson(request, botSyncGuildSchema);
  return ok(await syncGuildFromBot(body));
});

import { requireBotService } from '@/server/http/auth';
import { ok, readJson, route } from '@/server/http/respond';
import { markGuildLeft } from '@/server/services/bot';
import { botLeaveGuildSchema } from '@/server/validation/schemas';

/**
 * Called by the official bot when it is removed from a guild. The community row
 * is kept (presets, audit history) but flagged so the dashboard can tell the
 * admin that the bot is no longer present.
 */
export const POST = route(async (request: Request) => {
  requireBotService(request);
  const body = await readJson(request, botLeaveGuildSchema);
  await markGuildLeft(body.guildId);
  return ok({ ok: true });
});

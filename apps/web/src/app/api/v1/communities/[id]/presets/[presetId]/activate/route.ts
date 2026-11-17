import { apiSession } from '@/server/http/auth';
import { enforceRateLimit } from '@/server/http/rate-limit';
import { ok, route } from '@/server/http/respond';
import { activatePreset } from '@/server/services/presets';

type Context = { params: Promise<{ id: string; presetId: string }> };

export const POST = route(async (request: Request, context: Context) => {
  const user = await apiSession(request);
  const { presetId } = await context.params;
  enforceRateLimit(`preset:activate:${user.id}`, 60, 60_000);
  return ok({ preset: await activatePreset(user.id, presetId) });
});

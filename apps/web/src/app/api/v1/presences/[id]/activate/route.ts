import { apiSession } from '@/server/http/auth';
import { enforceRateLimit } from '@/server/http/rate-limit';
import { ok, readJson, route } from '@/server/http/respond';
import { getPresence, setActivePresence } from '@/server/services/presences';
import { presenceActivateSchema } from '@/server/validation/schemas';

type Context = { params: Promise<{ id: string }> };

export const POST = route(async (request: Request, context: Context) => {
  const user = await apiSession(request);
  const { id } = await context.params;
  enforceRateLimit(`presence:activate:${user.id}`, 60, 60_000);
  const body = await readJson(request, presenceActivateSchema);
  await setActivePresence(user.id, id, body.active);
  return ok({ presence: await getPresence(user.id, id) });
});

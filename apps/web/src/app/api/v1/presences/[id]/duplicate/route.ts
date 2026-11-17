import { apiSession } from '@/server/http/auth';
import { enforceRateLimit } from '@/server/http/rate-limit';
import { ok, route } from '@/server/http/respond';
import { duplicatePresence } from '@/server/services/presences';

type Context = { params: Promise<{ id: string }> };

export const POST = route(async (request: Request, context: Context) => {
  const user = await apiSession(request);
  const { id } = await context.params;
  enforceRateLimit(`presence:duplicate:${user.id}`, 30, 60_000);
  return ok({ presence: await duplicatePresence(user.id, id) }, 201);
});

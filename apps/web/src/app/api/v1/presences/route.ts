import { apiSession } from '@/server/http/auth';
import { clientIp, enforceRateLimit } from '@/server/http/rate-limit';
import { ok, readJson, route } from '@/server/http/respond';
import { createPresence, listPresences } from '@/server/services/presences';
import { presenceCreateSchema } from '@/server/validation/schemas';

export const GET = route(async (request: Request) => {
  const user = await apiSession(request);
  return ok({ presences: await listPresences(user.id) });
});

export const POST = route(async (request: Request) => {
  const user = await apiSession(request);
  enforceRateLimit(`presence:create:${user.id}:${clientIp(request)}`, 30, 60_000);
  const body = await readJson(request, presenceCreateSchema);
  const presence = await createPresence(user.id, body);
  return ok({ presence }, 201);
});

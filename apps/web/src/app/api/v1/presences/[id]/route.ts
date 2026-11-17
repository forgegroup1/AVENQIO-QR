import { apiSession } from '@/server/http/auth';
import { clientIp, enforceRateLimit } from '@/server/http/rate-limit';
import { ok, readJson, route } from '@/server/http/respond';
import { deletePresence, getPresence, updatePresence } from '@/server/services/presences';
import { presenceUpdateSchema } from '@/server/validation/schemas';

type Context = { params: Promise<{ id: string }> };

export const GET = route(async (request: Request, context: Context) => {
  const user = await apiSession(request);
  const { id } = await context.params;
  return ok({ presence: await getPresence(user.id, id) });
});

export const PATCH = route(async (request: Request, context: Context) => {
  const user = await apiSession(request);
  const { id } = await context.params;
  enforceRateLimit(`presence:update:${user.id}`, 60, 60_000);
  const body = await readJson(request, presenceUpdateSchema);
  return ok({ presence: await updatePresence(user.id, id, body) });
});

export const DELETE = route(async (request: Request, context: Context) => {
  const user = await apiSession(request);
  const { id } = await context.params;
  const ip = clientIp(request);
  enforceRateLimit(`presence:delete:${user.id}:${ip}`, 30, 60_000);
  await deletePresence(user.id, id);
  return ok({ ok: true });
});

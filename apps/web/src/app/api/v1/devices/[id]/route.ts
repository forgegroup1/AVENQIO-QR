import { apiSession } from '@/server/http/auth';
import { ok, route } from '@/server/http/respond';
import { revokeDevice } from '@/server/services/devices';

type Context = { params: Promise<{ id: string }> };

export const DELETE = route(async (request: Request, context: Context) => {
  const user = await apiSession(request);
  const { id } = await context.params;
  await revokeDevice(user.id, id);
  return ok({ ok: true });
});

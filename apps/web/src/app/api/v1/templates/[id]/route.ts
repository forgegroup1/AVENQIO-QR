import { apiSession } from '@/server/http/auth';
import { ok, route } from '@/server/http/respond';
import { deleteTemplate } from '@/server/services/templates';

type Context = { params: Promise<{ id: string }> };

export const DELETE = route(async (request: Request, context: Context) => {
  const user = await apiSession(request);
  const { id } = await context.params;
  await deleteTemplate(user.id, id);
  return ok({ ok: true });
});

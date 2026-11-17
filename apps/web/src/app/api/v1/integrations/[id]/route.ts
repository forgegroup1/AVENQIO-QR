import { apiSession } from '@/server/http/auth';
import { ok, readJson, route } from '@/server/http/respond';
import { deleteIntegration, updateIntegration } from '@/server/services/integrations';
import { integrationUpdateSchema } from '@/server/validation/schemas';

type Context = { params: Promise<{ id: string }> };

export const PATCH = route(async (request: Request, context: Context) => {
  const user = await apiSession(request);
  const { id } = await context.params;
  const body = await readJson(request, integrationUpdateSchema);
  return ok({ integration: await updateIntegration(user.id, id, body) });
});

export const DELETE = route(async (request: Request, context: Context) => {
  const user = await apiSession(request);
  const { id } = await context.params;
  await deleteIntegration(user.id, id);
  return ok({ ok: true });
});

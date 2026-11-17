import { apiSession } from '@/server/http/auth';
import { enforceRateLimit } from '@/server/http/rate-limit';
import { ok, readJson, route } from '@/server/http/respond';
import { createPresenceFromIntegration } from '@/server/services/integrations';
import { integrationPresenceSchema } from '@/server/validation/schemas';

type Context = { params: Promise<{ id: string }> };

export const POST = route(async (request: Request, context: Context) => {
  const user = await apiSession(request);
  const { id } = await context.params;
  enforceRateLimit(`integration:presence:${user.id}`, 30, 60_000);
  const body = await readJson(request, integrationPresenceSchema);
  return ok(await createPresenceFromIntegration(user.id, id, { name: body.name, values: body.values ?? {} }), 201);
});

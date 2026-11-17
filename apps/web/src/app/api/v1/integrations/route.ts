import { apiSession } from '@/server/http/auth';
import { enforceRateLimit } from '@/server/http/rate-limit';
import { ok, readJson, route } from '@/server/http/respond';
import { createIntegration, listIntegrations } from '@/server/services/integrations';
import { integrationCreateSchema } from '@/server/validation/schemas';

export const GET = route(async (request: Request) => {
  const user = await apiSession(request);
  return ok({ integrations: await listIntegrations(user.id) });
});

export const POST = route(async (request: Request) => {
  const user = await apiSession(request);
  enforceRateLimit(`integration:create:${user.id}`, 20, 60_000);
  const body = await readJson(request, integrationCreateSchema);
  return ok({ integration: await createIntegration(user.id, body) }, 201);
});

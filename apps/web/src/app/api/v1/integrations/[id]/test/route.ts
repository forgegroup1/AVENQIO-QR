import { apiSession } from '@/server/http/auth';
import { clientIp, enforceRateLimit } from '@/server/http/rate-limit';
import { ok, route } from '@/server/http/respond';
import { testIntegration } from '@/server/services/integrations';

type Context = { params: Promise<{ id: string }> };

/** Performs the real network request declared by the adapter and stores the result. */
export const POST = route(async (request: Request, context: Context) => {
  const user = await apiSession(request);
  const { id } = await context.params;
  enforceRateLimit(`integration:test:${user.id}:${clientIp(request)}`, 10, 60_000);
  const integration = await testIntegration(user.id, id);
  return ok({ integration });
});

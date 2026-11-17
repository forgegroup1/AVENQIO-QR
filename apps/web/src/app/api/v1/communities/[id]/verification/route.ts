import { apiSession } from '@/server/http/auth';
import { enforceRateLimit } from '@/server/http/rate-limit';
import { ok, route } from '@/server/http/respond';
import { requestCommunityVerification } from '@/server/services/communities';

type Context = { params: Promise<{ id: string }> };

export const POST = route(async (request: Request, context: Context) => {
  const user = await apiSession(request);
  const { id } = await context.params;
  enforceRateLimit(`verification:${user.id}`, 5, 60 * 60_000);
  await requestCommunityVerification(user.id, id);
  return ok({ ok: true });
});

import { revokeCurrentSession } from '@/server/auth/session';
import { ok, route } from '@/server/http/respond';
import { assertSameOrigin } from '@/server/http/origin';

export const POST = route(async (request: Request) => {
  assertSameOrigin(request);
  await revokeCurrentSession();
  return ok({ ok: true });
});

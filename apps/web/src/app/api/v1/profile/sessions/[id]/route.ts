import { apiSession } from '@/server/http/auth';
import { ApiError } from '@/server/http/errors';
import { ok, route } from '@/server/http/respond';
import { revokeSessionById } from '@/server/auth/session';

type Context = { params: Promise<{ id: string }> };

export const DELETE = route(async (request: Request, context: Context) => {
  const user = await apiSession(request);
  const { id } = await context.params;
  if (id === user.sessionId) throw ApiError.badRequest('Use “Sign out” to end the current session.');
  const revoked = await revokeSessionById(user.id, id);
  if (!revoked) throw ApiError.notFound('Session not found.');
  return ok({ ok: true });
});

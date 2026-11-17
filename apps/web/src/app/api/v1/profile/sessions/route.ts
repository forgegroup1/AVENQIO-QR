import { apiSession } from '@/server/http/auth';
import { ok, route } from '@/server/http/respond';
import { listSessions } from '@/server/services/profile';
import { revokeAllSessions } from '@/server/auth/session';
import { logActivity } from '@/server/services/activity';

export const GET = route(async (request: Request) => {
  const user = await apiSession(request);
  return ok({ sessions: await listSessions(user.id, user.sessionId) });
});

/** "Sign out everywhere else" — the current session survives. */
export const DELETE = route(async (request: Request) => {
  const user = await apiSession(request);
  const revoked = await revokeAllSessions(user.id, user.sessionId);
  await logActivity({
    userId: user.id,
    action: 'account.sessions_revoked',
    message: `Signed out ${revoked} other session(s)`,
    metadata: { revoked },
  });
  return ok({ revoked });
});

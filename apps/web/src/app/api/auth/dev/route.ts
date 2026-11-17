import { config } from '@/server/config';
import { establishSession } from '@/server/auth/session';
import { getReadyDb } from '@/server/db';
import { ApiError } from '@/server/http/errors';
import { ok, readJson, route } from '@/server/http/respond';
import { assertSameOrigin } from '@/server/http/origin';
import { clientIp, enforceRateLimit } from '@/server/http/rate-limit';
import { devSignInSchema } from '@/server/validation/schemas';
import { logActivity } from '@/server/services/activity';
import { hashIp } from '@/server/security/crypto';

/**
 * Development-only sign-in against seeded fixture accounts.
 * Disabled unless ALLOW_DEV_AUTH=true. It is not an authentication factor and must
 * never be enabled on a public deployment.
 */
export const POST = route(async (request: Request) => {
  assertSameOrigin(request);
  if (!config.devAuthEnabled) {
    throw ApiError.notFound('Dev sign-in is disabled.');
  }
  enforceRateLimit(`auth:dev:${clientIp(request)}`, 10, 60_000);
  const body = await readJson(request, devSignInSchema);

  const db = await getReadyDb();
  const rows = await db.query<{ id: string; is_dev: boolean }>('select id, is_dev from users where id = $1', [
    body.userId,
  ]);
  const user = rows[0];
  if (!user || !user.is_dev) throw ApiError.badRequest('That development account does not exist.');

  await establishSession(user.id, { userAgent: request.headers.get('user-agent'), ip: clientIp(request) });
  await logActivity({
    userId: user.id,
    actorType: 'system',
    action: 'account.dev_signed_in',
    message: 'Signed in with a development account',
    ipHash: hashIp(clientIp(request)),
  });
  return ok({ ok: true });
});

/** Lists the seeded fixture accounts so the sign-in screen can offer them. */
export const GET = route(async () => {
  if (!config.devAuthEnabled) return ok({ enabled: false, users: [] });
  const db = await getReadyDb();
  const users = await db.query<{ id: string; display_name: string; username: string | null }>(
    `select u.id, u.display_name, d.username
       from users u left join discord_accounts d on d.user_id = u.id
      where u.is_dev = true
      order by u.display_name`,
  );
  return ok({
    enabled: true,
    users: users.map((row) => ({ id: row.id, displayName: row.display_name, username: row.username })),
  });
});

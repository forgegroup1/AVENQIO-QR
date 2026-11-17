import { getSessionUser } from '@/server/auth/session';
import { ok, route } from '@/server/http/respond';

export const GET = route(async () => {
  const user = await getSessionUser();
  if (!user) return ok({ authenticated: false }, 200);
  return ok({
    authenticated: true,
    user: {
      id: user.id,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      locale: user.locale,
      isDev: user.isDev,
      isStaff: user.isStaff,
      discord: user.discord,
    },
  });
});

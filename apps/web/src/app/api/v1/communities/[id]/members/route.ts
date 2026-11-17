import { apiSession } from '@/server/http/auth';
import { ok, route } from '@/server/http/respond';
import { listCommunityMembers } from '@/server/services/communities';

type Context = { params: Promise<{ id: string }> };

export const GET = route(async (request: Request, context: Context) => {
  const user = await apiSession(request);
  const { id } = await context.params;
  return ok({ members: await listCommunityMembers(user.id, id) });
});

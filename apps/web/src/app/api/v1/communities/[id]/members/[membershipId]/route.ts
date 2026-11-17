import { apiSession } from '@/server/http/auth';
import { ok, readJson, route } from '@/server/http/respond';
import { updateMemberRole } from '@/server/services/communities';
import { memberRoleSchema } from '@/server/validation/schemas';

type Context = { params: Promise<{ id: string; membershipId: string }> };

export const PATCH = route(async (request: Request, context: Context) => {
  const user = await apiSession(request);
  const { id, membershipId } = await context.params;
  const body = await readJson(request, memberRoleSchema);
  await updateMemberRole(user.id, id, membershipId, body.role);
  return ok({ ok: true });
});

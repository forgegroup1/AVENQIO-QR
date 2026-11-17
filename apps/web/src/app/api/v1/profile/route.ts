import { apiSession } from '@/server/http/auth';
import { ok, readJson, route } from '@/server/http/respond';
import { getProfile, updateProfile } from '@/server/services/profile';
import { profileUpdateSchema } from '@/server/validation/schemas';

export const GET = route(async (request: Request) => {
  const user = await apiSession(request);
  return ok({ profile: await getProfile(user.id) });
});

export const PATCH = route(async (request: Request) => {
  const user = await apiSession(request);
  const body = await readJson(request, profileUpdateSchema);
  return ok({ profile: await updateProfile(user.id, body) });
});

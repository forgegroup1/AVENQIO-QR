import { apiSession } from '@/server/http/auth';
import { ok, readJson, route } from '@/server/http/respond';
import { listPresetGrants, setPresetAccess } from '@/server/services/presets';
import { presetAccessSchema } from '@/server/validation/schemas';

type Context = { params: Promise<{ id: string; presetId: string }> };

export const GET = route(async (request: Request, context: Context) => {
  const user = await apiSession(request);
  const { id, presetId } = await context.params;
  return ok({ grants: await listPresetGrants(user.id, id, presetId) });
});

/** PUT replaces the overrides listed in the request; omitted members are untouched. */
export const PUT = route(async (request: Request, context: Context) => {
  const user = await apiSession(request);
  const { id, presetId } = await context.params;
  const body = await readJson(request, presetAccessSchema);
  return ok({ preset: await setPresetAccess(user.id, id, presetId, body) });
});

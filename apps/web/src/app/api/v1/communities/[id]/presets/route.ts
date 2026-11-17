import { apiSession } from '@/server/http/auth';
import { enforceRateLimit } from '@/server/http/rate-limit';
import { ok, readJson, route } from '@/server/http/respond';
import { createPreset, listCommunityPresets } from '@/server/services/presets';
import { presetCreateSchema } from '@/server/validation/schemas';

type Context = { params: Promise<{ id: string }> };

export const GET = route(async (request: Request, context: Context) => {
  const user = await apiSession(request);
  const { id } = await context.params;
  return ok({ presets: await listCommunityPresets(user.id, id) });
});

export const POST = route(async (request: Request, context: Context) => {
  const user = await apiSession(request);
  const { id } = await context.params;
  enforceRateLimit(`preset:create:${user.id}`, 30, 60_000);
  const body = await readJson(request, presetCreateSchema);
  return ok({ preset: await createPreset(user.id, id, body) }, 201);
});

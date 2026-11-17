import { apiSession } from '@/server/http/auth';
import { ok, readJson, route } from '@/server/http/respond';
import { deletePreset, getPreset, setPresetStatus, updatePreset } from '@/server/services/presets';
import { presetStatusSchema, presetUpdateSchema } from '@/server/validation/schemas';

type Context = { params: Promise<{ id: string; presetId: string }> };

export const GET = route(async (request: Request, context: Context) => {
  const user = await apiSession(request);
  const { id, presetId } = await context.params;
  return ok({ preset: await getPreset(user.id, id, presetId) });
});

export const PATCH = route(async (request: Request, context: Context) => {
  const user = await apiSession(request);
  const { id, presetId } = await context.params;
  const raw = await request.clone().json().catch(() => ({}));
  if (raw && typeof raw === 'object' && 'status' in raw) {
    const body = presetStatusSchema.parse(raw);
    return ok({ preset: await setPresetStatus(user.id, id, presetId, body.status) });
  }
  const body = await readJson(request, presetUpdateSchema);
  return ok({ preset: await updatePreset(user.id, id, presetId, body) });
});

export const DELETE = route(async (request: Request, context: Context) => {
  const user = await apiSession(request);
  const { id, presetId } = await context.params;
  await deletePreset(user.id, id, presetId);
  return ok({ ok: true });
});

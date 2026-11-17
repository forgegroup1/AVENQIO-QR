import { apiSession } from '@/server/http/auth';
import { ok, readJson, route } from '@/server/http/respond';
import { savePresenceAsTemplate } from '@/server/services/templates';
import { saveTemplateSchema } from '@/server/validation/schemas';

type Context = { params: Promise<{ id: string }> };

export const POST = route(async (request: Request, context: Context) => {
  const user = await apiSession(request);
  const { id } = await context.params;
  const body = await readJson(request, saveTemplateSchema);
  return ok({ template: await savePresenceAsTemplate(user.id, id, body.name) }, 201);
});

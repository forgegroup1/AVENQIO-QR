import { apiSession } from '@/server/http/auth';
import { ok, readJson, route } from '@/server/http/respond';
import { createTemplate, listTemplates } from '@/server/services/templates';
import { templateCreateSchema } from '@/server/validation/schemas';

export const GET = route(async (request: Request) => {
  const user = await apiSession(request);
  return ok({ templates: await listTemplates(user.id) });
});

export const POST = route(async (request: Request) => {
  const user = await apiSession(request);
  const body = await readJson(request, templateCreateSchema);
  return ok({ template: await createTemplate(user.id, body) }, 201);
});

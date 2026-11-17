import { apiStaff } from '@/server/http/auth';
import { ok, readJson, route } from '@/server/http/respond';
import { decideCommunityVerification } from '@/server/services/communities';
import { verificationDecisionSchema } from '@/server/validation/schemas';

type Context = { params: Promise<{ id: string }> };

/**
 * Only accounts listed in AVENQIO_ADMIN_DISCORD_IDS can verify communities.
 * Community names shown in presets are therefore backed by a manual review,
 * not by self-declared branding.
 */
export const POST = route(async (request: Request, context: Context) => {
  const staff = await apiStaff(request);
  const { id } = await context.params;
  const body = await readJson(request, verificationDecisionSchema);
  await decideCommunityVerification(staff.id, id, body.decision, body.note ?? null);
  return ok({ ok: true });
});

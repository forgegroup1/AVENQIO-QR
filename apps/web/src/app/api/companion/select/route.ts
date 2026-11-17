import { ok, readJson, route } from '@/server/http/respond';
import { requireCompanionToken } from '@/server/http/auth';
import { enforceRateLimit } from '@/server/http/rate-limit';
import { authenticateDevice, getCompanionState, selectFromCompanion } from '@/server/services/devices';
import { companionSelectSchema } from '@/server/validation/schemas';

/** Lets the desktop tray switch the active presence without opening the dashboard. */
export const POST = route(async (request: Request) => {
  const token = requireCompanionToken(request);
  const { device, userId } = await authenticateDevice(token);
  enforceRateLimit(`companion:select:${device.id}`, 30, 60_000);
  const body = await readJson(request, companionSelectSchema);
  await selectFromCompanion(userId, device, body);
  return ok(await getCompanionState(userId, device));
});

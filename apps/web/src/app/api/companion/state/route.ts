import { ok, route } from '@/server/http/respond';
import { requireCompanionToken } from '@/server/http/auth';
import { enforceRateLimit } from '@/server/http/rate-limit';
import { authenticateDevice, getCompanionState } from '@/server/services/devices';

export const GET = route(async (request: Request) => {
  const token = requireCompanionToken(request);
  const { device, userId } = await authenticateDevice(token);
  enforceRateLimit(`companion:state:${device.id}`, 240, 60_000);
  return ok(await getCompanionState(userId, device));
});

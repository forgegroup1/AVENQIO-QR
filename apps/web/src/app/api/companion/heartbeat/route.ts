import { ok, readJson, route } from '@/server/http/respond';
import { requireCompanionToken } from '@/server/http/auth';
import { enforceRateLimit } from '@/server/http/rate-limit';
import { authenticateDevice, recordHeartbeat } from '@/server/services/devices';
import { companionHeartbeatSchema } from '@/server/validation/schemas';

export const POST = route(async (request: Request) => {
  const token = requireCompanionToken(request);
  const { device } = await authenticateDevice(token);
  enforceRateLimit(`companion:heartbeat:${device.id}`, 240, 60_000);
  const body = await readJson(request, companionHeartbeatSchema);
  await recordHeartbeat(device, body);
  return ok({ ok: true });
});

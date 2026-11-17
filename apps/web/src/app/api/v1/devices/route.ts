import { apiSession } from '@/server/http/auth';
import { enforceRateLimit } from '@/server/http/rate-limit';
import { ok, readJson, route } from '@/server/http/respond';
import { createPairingCode, listDevices } from '@/server/services/devices';
import { deviceCreateSchema } from '@/server/validation/schemas';

export const GET = route(async (request: Request) => {
  const user = await apiSession(request);
  return ok({ devices: await listDevices(user.id) });
});

export const POST = route(async (request: Request) => {
  const user = await apiSession(request);
  enforceRateLimit(`device:pair:${user.id}`, 10, 60_000);
  const body = await readJson(request, deviceCreateSchema);
  const pairing = await createPairingCode(user.id, { name: body.name });
  return ok(pairing, 201);
});

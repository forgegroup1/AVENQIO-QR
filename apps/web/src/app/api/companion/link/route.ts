import { ok, readJson, route } from '@/server/http/respond';
import { clientIp, enforceRateLimit } from '@/server/http/rate-limit';
import { hashIp } from '@/server/security/crypto';
import { linkDevice } from '@/server/services/devices';
import { getReadyDb } from '@/server/db';
import { getCompanionState } from '@/server/services/devices';
import { companionLinkSchema } from '@/server/validation/schemas';

/**
 * Exchanges a dashboard pairing code for a long-lived device token.
 * No cookies are involved: the desktop app proves possession of the code only.
 */
export const POST = route(async (request: Request) => {
  const ip = clientIp(request);
  enforceRateLimit(`companion:link:${ip}`, 8, 10 * 60_000);
  const body = await readJson(request, companionLinkSchema);

  const linked = await linkDevice({
    pairingCode: body.pairingCode,
    deviceName: body.deviceName,
    os: body.os,
    appVersion: body.appVersion,
    ipHash: hashIp(ip),
  });

  const db = await getReadyDb();
  const rows = await db.query(
    `select * from companion_devices where id = $1`,
    [linked.deviceId],
  );
  const device = rows[0] as never;
  const state = await getCompanionState(linked.userId, device);
  return ok({ deviceToken: linked.token, deviceId: linked.deviceId, account: state.account }, 201);
});

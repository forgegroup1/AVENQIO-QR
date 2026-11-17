import { apiStaff } from '@/server/http/auth';
import { ok, route } from '@/server/http/respond';
import { listVerificationQueue } from '@/server/services/communities';

export const GET = route(async (request: Request) => {
  await apiStaff(request);
  return ok({ queue: await listVerificationQueue() });
});

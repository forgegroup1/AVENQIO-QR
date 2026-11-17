import { requirePageUser } from '@/server/auth/session';
import { listIntegrations } from '@/server/services/integrations';
import { listDevices } from '@/server/services/devices';
import { botInviteUrl } from '@/server/services/communities';
import { IntegrationsView } from '@/components/integrations/integrations-view';

export const metadata = { title: 'Integrations' };
export const dynamic = 'force-dynamic';

const ONLINE_WINDOW_MS = 5 * 60 * 1000;

export default async function IntegrationsPage() {
  const user = await requirePageUser('/dashboard/integrations');
  const [integrations, devices] = await Promise.all([listIntegrations(user.id), listDevices(user.id)]);

  const companionOnline = devices.some(
    (device) =>
      device.status === 'linked' &&
      device.lastSeenAt !== null &&
      Date.now() - new Date(device.lastSeenAt).getTime() < ONLINE_WINDOW_MS,
  );

  return (
    <IntegrationsView
      integrations={integrations.map((integration) => ({
        id: integration.id,
        kind: integration.kind,
        label: integration.label,
        status: integration.status,
        hasCredentials: integration.hasCredentials,
        config: integration.config,
        lastSyncedAt: integration.lastSyncedAt,
        lastError: integration.lastError,
        lastSnapshot: integration.lastSnapshot,
      }))}
      devices={devices.map((device) => ({
        id: device.id,
        name: device.name,
        status: device.status,
        lastSeenAt: device.lastSeenAt,
        appVersion: device.appVersion,
        lastRpcConnected: device.lastRpcConnected,
      }))}
      discord={{
        connected: Boolean(user.discord),
        username: user.discord?.username ?? null,
        isDev: user.isDev,
      }}
      companionOnline={companionOnline}
      botInviteUrl={botInviteUrl()}
    />
  );
}

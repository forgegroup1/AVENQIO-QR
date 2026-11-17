import { requirePageUser } from '@/server/auth/session';
import { listCommunities } from '@/server/services/communities';
import { listDevices } from '@/server/services/devices';
import { AppShell, type CompanionStatus } from '@/components/layout/app-shell';

const ONLINE_WINDOW_MS = 5 * 60 * 1000;

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  const [devices, communities] = await Promise.all([listDevices(user.id), listCommunities(user.id)]);
  const linked = devices.filter((device) => device.status === 'linked');
  const latest = linked
    .slice()
    .sort((a, b) => new Date(b.lastSeenAt ?? 0).getTime() - new Date(a.lastSeenAt ?? 0).getTime())[0];

  const companion: CompanionStatus = {
    online: Boolean(latest?.lastSeenAt && Date.now() - new Date(latest.lastSeenAt).getTime() < ONLINE_WINDOW_MS),
    deviceName: latest?.name ?? null,
    rpcConnected: latest?.lastRpcConnected ?? null,
  };

  return (
    <AppShell
      user={{
        displayName: user.displayName,
        username: user.discord?.username ?? null,
        avatarUrl: user.avatarUrl,
        isDev: user.isDev,
        isStaff: user.isStaff,
      }}
      companion={companion}
      communities={communities.map((community) => ({ id: community.id, name: community.name }))}
    >
      {children}
    </AppShell>
  );
}

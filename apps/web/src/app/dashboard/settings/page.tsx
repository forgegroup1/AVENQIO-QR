import { requirePageUser } from '@/server/auth/session';
import { getProfile, listSessions } from '@/server/services/profile';
import { listDevices } from '@/server/services/devices';
import { SettingsView } from '@/components/settings/settings-view';

export const metadata = { title: 'Settings' };
export const dynamic = 'force-dynamic';

const TABS = ['profile', 'preferences', 'notifications', 'security'] as const;
type SettingsTab = (typeof TABS)[number];

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await requirePageUser('/dashboard/settings');
  const { tab } = await searchParams;
  const initialTab: SettingsTab = TABS.includes(tab as SettingsTab) ? (tab as SettingsTab) : 'profile';
  const [profile, sessions, devices] = await Promise.all([
    getProfile(user.id),
    listSessions(user.id, user.sessionId),
    listDevices(user.id),
  ]);

  return (
    <SettingsView
      initialTab={initialTab}
      profile={profile}
      sessions={sessions}
      devices={devices}
      account={{
        isDev: user.isDev,
        sessionCreatedAt: user.sessionCreatedAt.toISOString(),
        discordId: user.discord?.id ?? null,
      }}
    />
  );
}

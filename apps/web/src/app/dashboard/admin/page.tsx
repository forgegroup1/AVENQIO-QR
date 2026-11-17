import { notFound } from 'next/navigation';
import { requirePageUser } from '@/server/auth/session';
import { listVerificationQueue } from '@/server/services/communities';
import { SectionHeader, Callout } from '@/components/ui/display';
import { AdminQueue } from '@/components/admin/admin-queue';
import { IconShield } from '@/components/icons';

export const metadata = { title: 'Verification' };
export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const user = await requirePageUser('/dashboard/admin');
  if (!user.isStaff) notFound();

  const queue = await listVerificationQueue();

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Community verification"
        description="Staff-only review. Verification is what prevents a community from being impersonated inside shared presets."
      />
      <Callout tone="brand" icon={<IconShield className="h-4 w-4" />} title="How this is gated">
        Access requires your Discord id to appear in <code>AVENQIO_ADMIN_DISCORD_IDS</code>. The server checks
        this on every request; the page is not reachable by URL for other accounts.
      </Callout>
      <AdminQueue
        queue={queue.map((item) => ({
          id: item.id,
          name: item.name,
          discordGuildId: item.discordGuildId,
          iconUrl: item.iconUrl,
          status: item.status,
          requestedBy: item.requestedBy,
          memberCount: item.memberCount,
          updatedAt: item.updatedAt,
        }))}
      />
    </div>
  );
}

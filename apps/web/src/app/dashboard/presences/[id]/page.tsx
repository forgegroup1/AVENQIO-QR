import { notFound } from 'next/navigation';
import { requirePageUser } from '@/server/auth/session';
import { listCommunities } from '@/server/services/communities';
import { getPresence } from '@/server/services/presences';
import { listTemplates } from '@/server/services/templates';
import { PresenceEditor } from '@/components/presence/presence-editor';
import { ApiError } from '@/server/http/errors';

export const metadata = { title: 'Edit presence' };
export const dynamic = 'force-dynamic';

export default async function EditPresencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePageUser(`/dashboard/presences/${id}`);

  let presence;
  try {
    presence = await getPresence(user.id, id);
  } catch (error) {
    // Someone else's presence id is indistinguishable from a missing one.
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  const [communities, templates] = await Promise.all([listCommunities(user.id), listTemplates(user.id)]);

  return (
    <PresenceEditor
      mode="edit"
      presence={{
        id: presence.id,
        name: presence.name,
        payload: presence.payload,
        isActive: presence.isActive,
        serverId: presence.serverId,
        serverName: presence.serverName,
        updatedAt: presence.updatedAt,
      }}
      communities={communities.map((community) => ({ id: community.id, name: community.name, role: community.role }))}
      templates={templates.map((template) => ({ id: template.id, name: template.name, payload: template.payload }))}
      user={{
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        username: user.discord?.username ?? null,
      }}
    />
  );
}

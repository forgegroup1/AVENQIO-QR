import { requirePageUser } from '@/server/auth/session';
import { listCommunities } from '@/server/services/communities';
import { listTemplates } from '@/server/services/templates';
import { PresenceEditor } from '@/components/presence/presence-editor';
import { Callout } from '@/components/ui/display';
import { IconInfo } from '@/components/icons';

export const metadata = { title: 'New presence' };
export const dynamic = 'force-dynamic';

export default async function NewPresencePage() {
  const user = await requirePageUser('/dashboard/presences/new');
  const [communities, templates] = await Promise.all([listCommunities(user.id), listTemplates(user.id)]);

  return (
    <div className="space-y-5">
      <Callout tone="brand" icon={<IconInfo className="h-4 w-4" />}>
        New presences start inactive. You can activate it here or later from the presences list — the
        companion only publishes an active configuration.
      </Callout>
      <PresenceEditor
        mode="create"
        communities={communities.map((community) => ({ id: community.id, name: community.name, role: community.role }))}
        templates={templates.map((template) => ({ id: template.id, name: template.name, payload: template.payload }))}
        user={{
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
          username: user.discord?.username ?? null,
        }}
      />
    </div>
  );
}

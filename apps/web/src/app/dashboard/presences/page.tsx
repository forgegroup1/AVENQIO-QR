import { requirePageUser } from '@/server/auth/session';
import { listPresences } from '@/server/services/presences';
import { listUsablePresets } from '@/server/services/presets';
import { listTemplates } from '@/server/services/templates';
import { PresencesView } from '@/components/presence/presences-view';

export const metadata = { title: 'My presences' };
export const dynamic = 'force-dynamic';

export default async function PresencesPage() {
  const user = await requirePageUser('/dashboard/presences');
  const [presences, presets, templates] = await Promise.all([
    listPresences(user.id),
    listUsablePresets(user.id),
    listTemplates(user.id),
  ]);

  return (
    <PresencesView
      presences={presences.map((presence) => ({
        id: presence.id,
        name: presence.name,
        payload: presence.payload,
        isActive: presence.isActive,
        source: presence.source,
        serverName: presence.serverName,
        updatedAt: presence.updatedAt,
      }))}
      presets={presets.map((preset) => ({
        id: preset.id,
        name: preset.name,
        payload: preset.payload,
        serverName: preset.serverName,
        serverId: preset.serverId,
        verifiedCommunity: preset.verifiedCommunity,
        canUse: preset.canUse,
      }))}
      templates={templates.map((template) => ({ id: template.id, name: template.name, payload: template.payload }))}
      user={{
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        username: user.discord?.username ?? null,
      }}
      activePresetId={user.activeCommunityPresetId}
    />
  );
}

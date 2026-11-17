import { DiscordPreview } from '@/components/presence/discord-preview';
import type { PresencePayload } from '@avenqio/shared';

/** Static product illustration — explicitly not a real user's account. */
const EXAMPLE: PresencePayload = {
  applicationName: 'Visual Studio Code',
  activityType: 'playing',
  details: 'Building AvenqioPresence',
  state: 'Validating presence payloads',
  largeImage: null,
  smallImage: null,
  timestamps: { start: Date.now() - 1000 * 60 * 72, end: null },
  party: { current: 3, max: 8 },
  buttons: [
    { label: 'Open dashboard', url: 'https://example.com/dashboard' },
    { label: 'Documentation', url: 'https://example.com/docs' },
  ],
};

export function HeroPreview() {
  return (
    <div className="relative mx-auto w-fit">
      <div className="card overflow-hidden p-3">
        <div className="mb-2 flex items-center justify-between gap-3 px-1">
          <span className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.14em] text-ink-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-success" /> Example presence
          </span>
          <span className="font-mono text-[10px] text-ink-muted">live preview</span>
        </div>
        <DiscordPreview
          payload={EXAMPLE}
          user={{ displayName: 'Avenqio Demo', username: 'avenqio' }}
          showBanner
        />
      </div>
      <div className="absolute -bottom-4 -left-4 hidden rotate-[-2deg] rounded-xl border border-line-strong bg-[#14111c] px-3 py-2 shadow-pop sm:block">
        <p className="text-[10px] uppercase tracking-[0.14em] text-ink-muted">Validated against</p>
        <p className="text-[12px] font-medium text-ink">Discord RPC limits</p>
      </div>
    </div>
  );
}

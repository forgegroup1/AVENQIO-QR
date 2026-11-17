'use client';

import { useEffect, useState } from 'react';
import {
  ACTIVITY_LABELS,
  isAssetKey,
  type ActivityType,
  type PresencePayload,
} from '@avenqio/shared';
import { cn } from '@/lib/cn';

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

function pad(value: number) {
  return value.toString().padStart(2, '0');
}

/** Discord renders HH:MM:SS while under 24h, then "2 days". */
function elapsedLabel(startMs: number, now: number): string {
  const diff = Math.max(0, now - startMs);
  const totalSeconds = Math.floor(diff / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }
  return hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

function upcomingLabel(startMs: number, now: number): string {
  const diff = Math.max(0, startMs - now);
  const minutes = Math.floor(diff / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    return `in ${hours}h ${pad(minutes % 60)}m`;
  }
  return `in ${pad(minutes)}:${pad(seconds)}`;
}

function AssetTile({
  source,
  text,
  size,
}: {
  source: string;
  text: string | null;
  size: number;
}) {
  const [failed, setFailed] = useState(false);
  const isUrl = /^https:\/\//i.test(source);
  const showPlaceholder = !isUrl || failed;
  const label = text ?? (isAssetKey(source) ? source : 'Image');

  return (
    <div
      className="group/asset relative shrink-0 overflow-hidden rounded-md border border-white/10 bg-[#111214]"
      style={{ width: size, height: size }}
      title={label}
    >
      {showPlaceholder ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-[linear-gradient(135deg,#1e1f22,#2b2d31)] px-1 text-center">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-[#80848e]" fill="none" stroke="currentColor" strokeWidth={1.6}>
            <rect x="3" y="3" width="18" height="18" rx="3" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="m21 15-5-5L5 21" />
          </svg>
          <span className="line-clamp-2 break-all text-[7px] leading-[1.15] text-[#80848e]">
            {isAssetKey(source) ? source : 'unavailable'}
          </span>
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={source}
          alt={label}
          className="h-full w-full object-cover"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}

export type DiscordPreviewProps = {
  payload: PresencePayload;
  user: { displayName: string; avatarUrl?: string | null; username?: string | null };
  variant?: 'popout' | 'compact';
  className?: string;
  /** Shown under the card: "This is how Discord renders your presence". */
  footnote?: boolean;
  showBanner?: boolean;
};

export function DiscordPreview({
  payload,
  user,
  variant = 'popout',
  className,
  footnote,
  showBanner = true,
}: DiscordPreviewProps) {
  const start = payload.timestamps?.start ?? null;
  const end = payload.timestamps?.end ?? null;
  const now = useNow(Boolean(start || end));
  const activity = ACTIVITY_LABELS[payload.activityType as ActivityType] ?? ACTIVITY_LABELS.playing;
  const hasProgress = Boolean(start && end && end > start);
  const progress = hasProgress ? Math.min(100, Math.max(0, ((now - start!) / (end! - start!)) * 100)) : 0;
  const compact = variant === 'compact';

  return (
    <div className={cn('inline-flex flex-col gap-2', className)}>
      <div
        className={cn(
          'overflow-hidden rounded-xl border border-black/40 bg-[#232428] text-[#dbdee1] shadow-[0_24px_60px_-24px_rgba(0,0,0,0.9)]',
          compact ? 'w-[292px]' : 'w-[340px]',
        )}
      >
        {showBanner ? (
          <div className="relative h-[54px]">
            <div className="absolute inset-0 bg-[radial-gradient(120%_140%_at_10%_0%,#6d3ff0_0%,#3a2a63_45%,#232428_100%)]" />
            <div className="absolute inset-0 grid-lines opacity-30" />
          </div>
        ) : null}

        <div className={cn('relative px-4 pb-4', showBanner ? '-mt-[30px]' : 'pt-4')}>
          <div className="flex items-end justify-between">
            <div className="relative">
              <span
                className={cn(
                  'block overflow-hidden rounded-full border-[5px] border-[#232428] bg-[#111214]',
                  compact ? 'h-14 w-14' : 'h-[68px] w-[68px]',
                )}
              >
                {user.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.avatarUrl}
                    alt=""
                    className="h-full w-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-lg font-semibold text-[#b5bac1]">
                    {user.displayName.slice(0, 1).toUpperCase()}
                  </span>
                )}
              </span>
              <span className="absolute bottom-0.5 right-0.5 h-3.5 w-3.5 rounded-full border-[3px] border-[#232428] bg-[#23a55a]" />
            </div>
            <div className="mb-1 flex items-center gap-1 rounded bg-[#111214] px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-[#b5bac1]">
              Discord
            </div>
          </div>

          <div className="mt-2.5">
            <p className={cn('font-semibold text-white', compact ? 'text-[14px]' : 'text-[15px]')}>
              {user.displayName}
            </p>
            {user.username ? (
              <p className="text-[11.5px] leading-tight text-[#b5bac1]">@{user.username}</p>
            ) : null}
          </div>

          <div className="my-2.5 h-px bg-white/[0.07]" />

          <div className="space-y-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#b5bac1]">
              {activity.verb} {payload.applicationName}
            </p>

            <div className="flex gap-3">
              {payload.largeImage ? (
                <div className="relative">
                  <AssetTile
                    source={payload.largeImage.source}
                    text={payload.largeImage.text}
                    size={compact ? 48 : 56}
                  />
                  {payload.smallImage ? (
                    <div className="absolute -bottom-1.5 -right-1.5 rounded-full border-[3px] border-[#232428]">
                      <div className="overflow-hidden rounded-full">
                        <AssetTile
                          source={payload.smallImage.source}
                          text={payload.smallImage.text}
                          size={compact ? 17 : 20}
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="min-w-0 flex-1 space-y-1">
                <p className="truncate text-[13px] font-semibold text-white">{payload.applicationName}</p>
                {payload.details ? (
                  <p className="line-clamp-2 text-[12px] leading-snug text-[#dbdee1]">{payload.details}</p>
                ) : null}
                {payload.state ? (
                  <p className="line-clamp-2 text-[12px] leading-snug text-[#dbdee1]">{payload.state}</p>
                ) : null}
                {start && now < start ? (
                  <p className="text-[11.5px] leading-snug text-[#b5bac1]">Starts {upcomingLabel(start, now)}</p>
                ) : start ? (
                  <p className="text-[11.5px] leading-snug text-[#b5bac1]">{elapsedLabel(start, now)} elapsed</p>
                ) : null}
              </div>
            </div>

            {hasProgress ? (
              <div className="space-y-1">
                <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-[#dbdee1]/70" style={{ width: `${progress}%` }} />
                </div>
                <div className="flex justify-between text-[10px] text-[#b5bac1]">
                  <span>{elapsedLabel(start!, now)}</span>
                  <span>{elapsedLabel(end! - (end! - start!), now)}</span>
                </div>
              </div>
            ) : null}

            {payload.party ? (
              <p className="text-[11.5px] text-[#b5bac1]">
                {payload.party.current} of {payload.party.max}
              </p>
            ) : null}

            {payload.buttons.length ? (
              <div className="mt-1 grid gap-1.5">
                {payload.buttons.map((button, index) => (
                  <button
                    key={`${button.url}-${index}`}
                    type="button"
                    title={button.url}
                    disabled
                    className="w-full cursor-default rounded bg-[#4e5058] px-3 py-1.5 text-center text-[12px] font-medium text-white/95 disabled:opacity-100"
                  >
                    {button.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {footnote ? (
        <p className="max-w-[340px] text-[11px] leading-relaxed text-ink-muted">
          Live preview. Discord renders this card in the member list and profile popout once the
          companion publishes the presence through local RPC.
        </p>
      ) : null}
    </div>
  );
}

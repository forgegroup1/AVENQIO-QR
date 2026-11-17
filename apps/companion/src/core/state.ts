import type {
  CompanionPresence,
  CompanionStateResponse,
  PresencePayload,
} from '@avenqio/shared';

/** The dashboard is the source of truth for this contract (@avenqio/shared/api). */
export type CompanionState = CompanionStateResponse;
export type CompanionPreset = CompanionStateResponse['communityPresets'][number];
export type { CompanionPresence };

export type ResolvedActivity =
  | { kind: 'presence'; id: string; label: string; payload: PresencePayload; community: string | null }
  | { kind: 'community_preset'; id: string; label: string; payload: PresencePayload; community: string }
  | { kind: 'none' };

/**
 * Single decision point: what should be sent to Discord right now?
 * The dashboard resolves the active selection; the companion only maps ids to
 * payloads, so both apps cannot disagree about the rules.
 */
export function resolveActivity(state: CompanionState | null): ResolvedActivity {
  if (!state || state.active.kind === 'none') return { kind: 'none' };

  if (state.active.kind === 'presence' && state.active.presenceId) {
    const presence = state.presences.find((entry) => entry.id === state.active.presenceId);
    if (!presence) return { kind: 'none' };
    return {
      kind: 'presence',
      id: presence.id,
      label: presence.name,
      payload: presence.payload,
      community: presence.community?.name ?? null,
    };
  }

  if (state.active.kind === 'community_preset' && state.active.presetId) {
    const preset = state.communityPresets.find((entry) => entry.id === state.active.presetId);
    if (!preset) return { kind: 'none' };
    return {
      kind: 'community_preset',
      id: preset.id,
      label: preset.name,
      payload: preset.payload,
      community: preset.community.name,
    };
  }

  return { kind: 'none' };
}

/** Stable fingerprint used to skip identical RPC writes on every poll. */
export function activityFingerprint(activity: ResolvedActivity): string {
  if (activity.kind === 'none') return 'none';
  return `${activity.kind}:${activity.id}:${JSON.stringify(activity.payload)}`;
}

/** Retrying with a floating delay keeps a closed Discord client from hot-looping. */
export function reconnectDelayMs(attempt: number): number {
  const base = 2_000;
  const capped = Math.min(base * 2 ** Math.max(0, attempt), 60_000);
  const jitter = Math.floor(Math.random() * 500);
  return capped + jitter;
}

export function isLinked(settings: { deviceToken: string | null; deviceId: string | null }): boolean {
  return Boolean(settings.deviceToken && settings.deviceId);
}

export function describeActive(state: CompanionState | null): string {
  if (!state) return 'Not synced yet';
  if (state.active.kind === 'none') return 'Nothing published';
  return state.active.label ?? 'Published presence';
}

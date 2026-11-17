/**
 * Documented Discord Rich Presence constraints.
 * Everything in the product validates against these numbers, both on the client
 * (live preview / inline errors) and on the server (API validation).
 *
 * Source of truth: Discord "Rich Presence" documentation (Activity object).
 */
export const DISCORD_LIMITS = {
  /** Activity name supplied by the application. Discord truncates at 128. */
  applicationName: 128,
  details: 128,
  state: 128,
  /** Asset tooltip text (large_text / small_text). */
  imageText: 128,
  buttonLabel: 32,
  buttonUrl: 512,
  maxButtons: 2,
  /** A party can never claim more than 1000 members in the client UI. */
  partyMax: 1000,
  /** Epoch milliseconds must stay inside JavaScript's safe integer range. */
  timestampMax: Number.MAX_SAFE_INTEGER,
  /** Presence payloads larger than this are rejected by the gateway. */
  maxPayloadBytes: 8192,
} as const;

export const ACTIVITY_TYPES = ['playing', 'listening', 'watching', 'competing'] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

/** Discord's numeric activity type ids, used by the RPC client in the companion. */
export const ACTIVITY_TYPE_IDS: Record<ActivityType, number> = {
  playing: 0,
  listening: 2,
  watching: 3,
  competing: 5,
};

/** Discord invites users to "Play a game" / "Listen to" / "Watch" / "Compete in". */
export const ACTIVITY_LABELS: Record<ActivityType, { verb: string; preposition: string }> = {
  playing: { verb: 'Playing', preposition: '' },
  listening: { verb: 'Listening to', preposition: 'to' },
  watching: { verb: 'Watching', preposition: '' },
  competing: { verb: 'Competing in', preposition: 'in' },
};

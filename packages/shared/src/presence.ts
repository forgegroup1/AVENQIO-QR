import { z } from 'zod';
import { ACTIVITY_TYPE_IDS, ACTIVITY_TYPES, DISCORD_LIMITS, type ActivityType } from './limits';

/**
 * Presence payload — the single serialized shape stored in the database, sent to
 * the companion app and rendered by every preview in the product.
 *
 * Text fields use `null` (never an empty string) to mean "not displayed", because
 * Discord hides empty activity fields but displays whitespace literally.
 */
const trimmed = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be ${max} characters or fewer`);

/** Accepts a string, or empty/whitespace, and normalizes the latter to null. */
export const textOrNull = (max: number, label: string) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    trimmed(max, label).nullable(),
  );

const ASSET_KEY = /^[A-Za-z0-9_-]{1,256}$/;

/**
 * Discord assets can either be:
 *  - an asset key uploaded to the Discord application ("Art Assets"), or
 *  - an external https image URL (supported by current Discord clients).
 * We accept both and let the companion pass the value through untouched.
 */
export const imageSourceSchema = z
  .string()
  .trim()
  .min(1, 'Provide an image asset key or an https URL')
  .max(512, 'Image source must be 512 characters or fewer')
  .refine(
    (value) => /^https:\/\/[^\s]+$/i.test(value) || ASSET_KEY.test(value),
    'Use an https:// image URL or a Discord asset key (letters, numbers, "_" and "-")',
  );

export const imageRefSchema = z
  .object({
    source: imageSourceSchema,
    text: textOrNull(DISCORD_LIMITS.imageText, 'Image tooltip'),
  })
  .nullable();

export const buttonSchema = z.object({
  label: trimmed(DISCORD_LIMITS.buttonLabel, 'Button label').min(1, 'Button label is required'),
  url: z
    .string()
    .trim()
    .max(DISCORD_LIMITS.buttonUrl, `Button URL must be ${DISCORD_LIMITS.buttonUrl} characters or fewer`)
    .url('Enter a valid URL, including https://')
    .refine((value) => /^https?:\/\//i.test(value), 'Button URLs must start with http:// or https://'),
});

export const timestampsSchema = z
  .object({
    start: z.number().int().positive().max(DISCORD_LIMITS.timestampMax).nullable(),
    end: z.number().int().positive().max(DISCORD_LIMITS.timestampMax).nullable(),
  })
  .nullable();

export const partySchema = z
  .object({
    current: z.number().int().min(1, 'Party size must be at least 1').max(DISCORD_LIMITS.partyMax),
    max: z.number().int().min(1, 'Party maximum must be at least 1').max(DISCORD_LIMITS.partyMax),
  })
  .nullable();

export const presencePayloadSchema = z
  .object({
    applicationName: trimmed(DISCORD_LIMITS.applicationName, 'Application name')
      .min(1, 'Application name is required')
      .default('AvenqioPresence'),
    activityType: z.enum(ACTIVITY_TYPES).default('playing'),
    details: textOrNull(DISCORD_LIMITS.details, 'Details').default(null),
    state: textOrNull(DISCORD_LIMITS.state, 'State').default(null),
    largeImage: imageRefSchema.default(null),
    smallImage: imageRefSchema.default(null),
    timestamps: timestampsSchema.default(null),
    party: partySchema.default(null),
    buttons: z.array(buttonSchema).max(DISCORD_LIMITS.maxButtons).default([]),
  })
  .superRefine((payload, ctx) => {
    if (payload.timestamps) {
      const { start, end } = payload.timestamps;
      if (end !== null && start === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['timestamps', 'start'],
          message: 'An end time needs a start time — Discord uses the start to show elapsed time',
        });
      }
      if (start !== null && end !== null && end <= start) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['timestamps', 'end'],
          message: 'End time must be after the start time',
        });
      }
    }
    if (payload.party && payload.party.current > payload.party.max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['party', 'current'],
        message: 'Current party size cannot be larger than the maximum',
      });
    }
    const seen = new Set<string>();
    payload.buttons.forEach((button, index) => {
      const key = button.url.toLowerCase();
      if (seen.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['buttons', index, 'url'],
          message: 'Each button needs a different URL',
        });
      }
      seen.add(key);
    });
    const bytes = new TextEncoder().encode(JSON.stringify(payload)).length;
    if (bytes > DISCORD_LIMITS.maxPayloadBytes) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [],
        message: `Presence payload is too large (${bytes} bytes, limit ${DISCORD_LIMITS.maxPayloadBytes})`,
      });
    }
  });

export type PresencePayload = z.infer<typeof presencePayloadSchema>;
export type PresenceButton = z.infer<typeof buttonSchema>;
export type PresenceImageRef = z.infer<typeof imageRefSchema>;
export type PresenceTimestamps = z.infer<typeof timestampsSchema>;
export type PresenceParty = z.infer<typeof partySchema>;

/** Shape used while editing — every field optional and partially invalid. */
export type PresenceDraft = {
  applicationName?: string;
  activityType?: ActivityType;
  details?: string | null;
  state?: string | null;
  largeImage?: PresenceImageRef | { source?: string; text?: string | null } | null;
  smallImage?: PresenceImageRef | { source?: string; text?: string | null } | null;
  timestamps?: { start?: number | null; end?: number | null } | null;
  party?: { current?: number | null; max?: number | null } | null;
  buttons?: Array<{ label?: string; url?: string }>;
};

export const emptyPresencePayload = (): PresencePayload => ({
  applicationName: 'AvenqioPresence',
  activityType: 'playing',
  details: null,
  state: null,
  largeImage: null,
  smallImage: null,
  timestamps: null,
  party: null,
  buttons: [],
});

/**
 * Converts the editor draft into something the schema can validate:
 * drops blank images/parties, coerces numeric inputs from <input> strings.
 */
export function normalizeDraft(draft: PresenceDraft): unknown {
  const parseNumber = (value: unknown): number | null => {
    if (value === null || value === undefined || value === '') return null;
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? Math.trunc(n) : null;
  };
  const cleanImage = (image: PresenceDraft['largeImage']) => {
    if (!image || !image.source || String(image.source).trim() === '') return null;
    return { source: String(image.source), text: image.text ?? null };
  };
  const timestamps = draft.timestamps
    ? { start: parseNumber(draft.timestamps.start), end: parseNumber(draft.timestamps.end) }
    : null;
  const party = draft.party
    ? { current: parseNumber(draft.party.current), max: parseNumber(draft.party.max) }
    : null;

  return {
    applicationName: draft.applicationName ?? '',
    activityType: draft.activityType ?? 'playing',
    details: draft.details ?? null,
    state: draft.state ?? null,
    largeImage: cleanImage(draft.largeImage),
    smallImage: cleanImage(draft.smallImage),
    timestamps: timestamps && (timestamps.start !== null || timestamps.end !== null) ? timestamps : null,
    party: party && (party.current !== null || party.max !== null) ? party : null,
    buttons: (draft.buttons ?? [])
      .filter((button) => (button.label ?? '').trim() !== '' || (button.url ?? '').trim() !== '')
      .map((button) => ({ label: button.label ?? '', url: button.url ?? '' })),
  };
}

export type ValidationIssue = {
  path: string;
  message: string;
};

export type PresenceValidation = {
  ok: boolean;
  payload: PresencePayload | null;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
};

/**
 * Single validation entry point used by the editor, the API and the companion.
 * Errors block saving; warnings are advisory (Discord accepts them, but the
 * result may not look the way the author expects).
 */
export function validatePresence(draft: unknown): PresenceValidation {
  const parsed = presencePayloadSchema.safeParse(draft);
  if (!parsed.success) {
    return {
      ok: false,
      payload: null,
      errors: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
      warnings: [],
    };
  }
  return { ok: true, payload: parsed.data, errors: [], warnings: collectWarnings(parsed.data) };
}

export function collectWarnings(payload: PresencePayload): ValidationIssue[] {
  const warnings: ValidationIssue[] = [];
  const now = Date.now();

  if (payload.largeImage?.text && !payload.largeImage.source) {
    warnings.push({ path: 'largeImage.text', message: 'Tooltip text is ignored without a large image' });
  }
  if (payload.smallImage && !payload.largeImage) {
    warnings.push({
      path: 'smallImage',
      message: 'Discord places the small image over the large image — set a large image too',
    });
  }
  if (payload.smallImage?.text && !payload.smallImage.source) {
    warnings.push({ path: 'smallImage.text', message: 'Tooltip text is ignored without a small image' });
  }
  if (payload.timestamps?.start && payload.timestamps.start > now + 1000 * 60 * 60 * 24 * 365) {
    warnings.push({ path: 'timestamps.start', message: 'Start time is more than a year in the future' });
  }
  if (payload.timestamps?.end && payload.timestamps.end < now) {
    warnings.push({ path: 'timestamps.end', message: 'End time is already in the past, so Discord shows 00:00' });
  }
  if (!payload.details && !payload.state && !payload.largeImage && !payload.smallImage) {
    warnings.push({
      path: '',
      message: 'This presence only shows the application name — add details, state or an image',
    });
  }
  payload.buttons.forEach((button, index) => {
    if (!/^https:\/\//i.test(button.url)) {
      warnings.push({
        path: `buttons.${index}.url`,
        message: 'Discord clients may refuse non-HTTPS button URLs',
      });
    }
  });
  if (payload.party && payload.party.current === payload.party.max) {
    warnings.push({ path: 'party.current', message: 'The party is shown as full' });
  }
  return warnings;
}

export function isAssetKey(source: string): boolean {
  return ASSET_KEY.test(source);
}

/** Human summary for lists, bot embeds and activity log entries. */
export function summarizePresence(payload: PresencePayload): string {
  const parts = [payload.details, payload.state].filter(Boolean) as string[];
  if (parts.length) return parts.join(' · ');
  if (payload.largeImage?.text) return payload.largeImage.text;
  return payload.applicationName;
}

/**
 * Converts the stored payload into the activity object expected by a Discord RPC
 * client. The companion is the only component that talks RPC, so this function
 * exists to keep the mapping in one tested place.
 */
export function toRpcActivity(payload: PresencePayload) {
  const activity: Record<string, unknown> = {
    type: ACTIVITY_TYPE_IDS[payload.activityType],
  };
  if (payload.details) activity.details = payload.details;
  if (payload.state) activity.state = payload.state;

  const start = payload.timestamps?.start;
  const end = payload.timestamps?.end;
  if (start || end) {
    activity.timestamps = {
      ...(start ? { start: new Date(start) } : {}),
      ...(end ? { end: new Date(end) } : {}),
    };
  }

  if (payload.largeImage || payload.smallImage) {
    const assets: Record<string, string> = {};
    if (payload.largeImage) {
      assets.large_image = payload.largeImage.source;
      if (payload.largeImage.text) assets.large_text = payload.largeImage.text;
    }
    if (payload.smallImage) {
      assets.small_image = payload.smallImage.source;
      if (payload.smallImage.text) assets.small_text = payload.smallImage.text;
    }
    activity.assets = assets;
  }

  if (payload.party) {
    activity.party = { size: [payload.party.current, payload.party.max] };
  }

  if (payload.buttons.length) {
    activity.buttons = payload.buttons.map((button) => ({ label: button.label, url: button.url }));
  }

  return activity;
}

export type { ActivityType };

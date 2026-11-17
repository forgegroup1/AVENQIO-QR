import { describe, expect, it } from 'vitest';
import { DISCORD_LIMITS } from './limits';
import {
  collectWarnings,
  emptyPresencePayload,
  presencePayloadSchema,
  summarizePresence,
  toRpcActivity,
  type PresencePayload,
} from './presence';

const base = (): PresencePayload => emptyPresencePayload();

function withPayload(patch: Partial<PresencePayload>): PresencePayload {
  return { ...base(), ...patch };
}

describe('presence payload validation', () => {
  it('accepts an empty payload with defaults', () => {
    const parsed = presencePayloadSchema.parse({});
    expect(parsed.applicationName).toBe('AvenqioPresence');
    expect(parsed.activityType).toBe('playing');
    expect(parsed.buttons).toEqual([]);
  });

  it('rejects text longer than the Discord limit', () => {
    const result = presencePayloadSchema.safeParse({ details: 'x'.repeat(DISCORD_LIMITS.details + 1) });
    expect(result.success).toBe(false);
  });

  it('rejects more than two buttons', () => {
    const result = presencePayloadSchema.safeParse({
      buttons: [
        { label: 'One', url: 'https://example.com/1' },
        { label: 'Two', url: 'https://example.com/2' },
        { label: 'Three', url: 'https://example.com/3' },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects duplicate button URLs', () => {
    const result = presencePayloadSchema.safeParse({
      buttons: [
        { label: 'One', url: 'https://example.com/same' },
        { label: 'Two', url: 'https://example.com/SAME' },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('requires http(s) button URLs', () => {
    expect(presencePayloadSchema.safeParse({ buttons: [{ label: 'Bad', url: 'javascript:alert(1)' }] }).success).toBe(
      false,
    );
    expect(presencePayloadSchema.safeParse({ buttons: [{ label: 'Ok', url: 'https://ok.example' }] }).success).toBe(
      true,
    );
  });

  it('rejects an end timestamp without a start', () => {
    expect(presencePayloadSchema.safeParse({ timestamps: { start: null, end: Date.now() + 1000 } }).success).toBe(
      false,
    );
  });

  it('rejects an end timestamp before the start', () => {
    const start = Date.now();
    expect(presencePayloadSchema.safeParse({ timestamps: { start, end: start - 1 } }).success).toBe(false);
  });

  it('rejects a party larger than its maximum', () => {
    expect(presencePayloadSchema.safeParse({ party: { current: 5, max: 4 } }).success).toBe(false);
    expect(presencePayloadSchema.safeParse({ party: { current: 4, max: 4 } }).success).toBe(true);
  });

  it('keeps even a maximal payload inside the 8 KB byte budget', () => {
    // Field limits are tighter than the payload budget, so a payload built from
    // maximum-length values must always pass the byte check.
    const result = presencePayloadSchema.safeParse({
      details: 'x'.repeat(DISCORD_LIMITS.details),
      state: 'y'.repeat(DISCORD_LIMITS.state),
      largeImage: { source: `https://cdn.example.com/${'z'.repeat(480)}`, text: 'a'.repeat(DISCORD_LIMITS.imageText) },
      smallImage: { source: `https://cdn.example.com/${'w'.repeat(480)}`, text: 'b'.repeat(DISCORD_LIMITS.imageText) },
      buttons: [
        { label: 'a'.repeat(DISCORD_LIMITS.buttonLabel), url: `https://example.com/${'c'.repeat(300)}` },
        { label: 'b'.repeat(DISCORD_LIMITS.buttonLabel), url: `https://example.com/${'d'.repeat(300)}` },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      const bytes = new TextEncoder().encode(JSON.stringify(result.data)).length;
      expect(bytes).toBeLessThan(DISCORD_LIMITS.maxPayloadBytes);
    }
  });
});

describe('discord rpc mapping', () => {
  it('maps text, assets, timestamps and buttons', () => {
    const start = Date.now();
    const payload = withPayload({
      activityType: 'watching',
      details: 'Patrolling',
      state: 'Zone 4',
      largeImage: { source: 'large_key', text: 'Los Santos' },
      smallImage: { source: 'small_key', text: 'On duty' },
      timestamps: { start, end: start + 60_000 },
      party: { current: 3, max: 8 },
      buttons: [{ label: 'Join', url: 'https://example.com/join' }],
    });

    const activity = toRpcActivity(payload) as Record<string, never>;
    expect(activity.type).toBe(3);
    expect(activity.details).toBe('Patrolling');
    expect(activity.state).toBe('Zone 4');
    expect(activity.assets).toEqual({
      large_image: 'large_key',
      large_text: 'Los Santos',
      small_image: 'small_key',
      small_text: 'On duty',
    });
    expect(activity.party).toEqual({ size: [3, 8] });
    expect(activity.buttons).toEqual([{ label: 'Join', url: 'https://example.com/join' }]);
  });

  it('omits hidden fields (null) instead of sending empty strings', () => {
    const activity = toRpcActivity(withPayload({ details: null, state: null })) as Record<string, unknown>;
    expect(activity).not.toHaveProperty('details');
    expect(activity).not.toHaveProperty('state');
    expect(activity).not.toHaveProperty('assets');
  });

  it('summarises a payload for lists and logs', () => {
    expect(summarizePresence(withPayload({ details: 'Grinding heists' }))).toContain('Grinding heists');
    expect(summarizePresence(base())).toBe('AvenqioPresence');
  });
});

describe('editor warnings', () => {
  it('warns when a small image would have no large image underneath it', () => {
    const warnings = collectWarnings(withPayload({ smallImage: { source: 'small', text: null }, largeImage: null }));
    expect(warnings.some((warning) => /small image/i.test(warning.message))).toBe(true);
  });

  it('warns about an empty presence and about non-https buttons', () => {
    expect(collectWarnings(base()).some((warning) => /only shows the application name/.test(warning.message))).toBe(true);
    const warnings = collectWarnings(withPayload({ details: 'Hi', buttons: [{ label: 'x', url: 'http://example.com' }] }));
    expect(warnings.some((warning) => /HTTPS/.test(warning.message))).toBe(true);
  });

  it('is quiet for a valid playing payload', () => {
    expect(collectWarnings(withPayload({ details: 'Hello' }))).toHaveLength(0);
  });
});

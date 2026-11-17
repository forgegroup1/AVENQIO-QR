import { describe, expect, it } from 'vitest';
import { emptyPresencePayload } from '@avenqio/shared';
import { checkForUpdates, compareVersions, normalizeSettings } from './settings';
import {
  activityFingerprint,
  reconnectDelayMs,
  resolveActivity,
  type CompanionState,
} from './state';

const payload = { ...emptyPresencePayload(), details: 'Testing the companion' };

function state(patch: Partial<CompanionState> = {}): CompanionState {
  return {
    account: { userId: 'u1', displayName: 'Nova', avatarUrl: null, discord: null },
    device: { id: 'd1', name: 'Gaming PC', lastSeenAt: null },
    activePresenceId: null,
    active: { kind: 'none', presenceId: null, presetId: null, label: null },
    presences: [
      {
        id: 'p1',
        name: 'Night shift',
        payload,
        source: 'manual',
        community: null,
        updatedAt: new Date().toISOString(),
      },
    ],
    communityPresets: [
      {
        id: 'c1',
        name: 'LSPD on duty',
        payload,
        community: { id: 's1', name: 'Los Santos RP' },
        verified: true,
      },
    ],
    pollIntervalSeconds: 30,
    generatedAt: new Date().toISOString(),
    ...patch,
  };
}

describe('active activity resolution', () => {
  it('returns nothing when the dashboard says nothing is active', () => {
    expect(resolveActivity(state()).kind).toBe('none');
    expect(resolveActivity(null).kind).toBe('none');
  });

  it('resolves a personal presence', () => {
    const resolved = resolveActivity(
      state({ active: { kind: 'presence', presenceId: 'p1', presetId: null, label: 'Night shift' } }),
    );
    expect(resolved.kind).toBe('presence');
    if (resolved.kind === 'presence') {
      expect(resolved.id).toBe('p1');
      expect(resolved.payload.details).toBe('Testing the companion');
    }
  });

  it('resolves a community preset with its community name', () => {
    const resolved = resolveActivity(
      state({ active: { kind: 'community_preset', presenceId: null, presetId: 'c1', label: 'LSPD on duty' } }),
    );
    expect(resolved.kind).toBe('community_preset');
    if (resolved.kind === 'community_preset') expect(resolved.community).toBe('Los Santos RP');
  });

  it('degrades gracefully when the id is no longer returned (revoked preset)', () => {
    const resolved = resolveActivity(
      state({ active: { kind: 'community_preset', presenceId: null, presetId: 'gone', label: 'Revoked' } }),
    );
    expect(resolved.kind).toBe('none');
  });
});

describe('change detection', () => {
  it('treats identical payloads as one fingerprint', () => {
    const resolved = resolveActivity(
      state({ active: { kind: 'presence', presenceId: 'p1', presetId: null, label: 'Night shift' } }),
    );
    expect(activityFingerprint(resolved)).toBe(activityFingerprint(resolveActivity(
      state({ active: { kind: 'presence', presenceId: 'p1', presetId: null, label: 'Night shift' } }),
    )));
  });

  it('changes the fingerprint when the payload changes', () => {
    const first = resolveActivity(
      state({ active: { kind: 'presence', presenceId: 'p1', presetId: null, label: 'Night shift' } }),
    );
    const changed = state({
      active: { kind: 'presence', presenceId: 'p1', presetId: null, label: 'Night shift' },
      presences: [
        {
          id: 'p1',
          name: 'Night shift',
          payload: { ...payload, details: 'Edited on the dashboard' },
          source: 'manual',
          community: null,
          updatedAt: new Date().toISOString(),
        },
      ],
    });
    expect(activityFingerprint(resolveActivity(changed))).not.toBe(activityFingerprint(first));
  });
});

describe('reconnect backoff', () => {
  it('grows and caps', () => {
    expect(reconnectDelayMs(0)).toBeGreaterThanOrEqual(2_000);
    expect(reconnectDelayMs(3)).toBeLessThanOrEqual(60_500);
    expect(reconnectDelayMs(20)).toBeLessThanOrEqual(60_500);
  });
});

describe('settings validation', () => {
  it('rejects non-http API urls and keeps a usable default', () => {
    expect(normalizeSettings({ apiUrl: 'file:///etc/passwd' }, 'http://localhost:3000').apiUrl).toBe(
      'http://localhost:3000',
    );
    expect(normalizeSettings({ apiUrl: 'https://presence.example.com/dash' }, 'http://localhost:3000').apiUrl).toBe(
      'https://presence.example.com',
    );
  });

  it('drops malformed rpc client ids and keeps defaults for missing booleans', () => {
    const settings = normalizeSettings({ rpcClientId: 'not-an-id', startWithWindows: 'yes' }, 'http://localhost:3000');
    expect(settings.rpcClientId).toBeNull();
    expect(settings.startWithWindows).toBe(false);
    expect(settings.minimizeToTray).toBe(true);
  });
});

describe('update checks', () => {
  it('reports not-configured without a feed', async () => {
    expect(await checkForUpdates(null, '0.1.0')).toEqual({ status: 'not-configured' });
  });

  it('detects a newer release', async () => {
    const fetcher = (async () =>
      new Response(JSON.stringify({ version: '0.2.0', url: 'https://example.com/setup.exe' }), { status: 200 })) as typeof fetch;
    const result = await checkForUpdates('https://example.com/feed.json', '0.1.9', fetcher);
    expect(result).toMatchObject({ status: 'available', version: '0.2.0' });
  });

  it('reports current when the feed is older or equal', async () => {
    const fetcher = (async () =>
      new Response(JSON.stringify({ version: '0.1.0', url: 'https://example.com/setup.exe' }), { status: 200 })) as typeof fetch;
    expect(await checkForUpdates('https://example.com/feed.json', '0.1.0', fetcher)).toEqual({
      status: 'current',
      version: '0.1.0',
    });
  });

  it('surfaces feed failures instead of throwing', async () => {
    const fetcher = (async () => new Response('nope', { status: 500 })) as typeof fetch;
    expect(await checkForUpdates('https://example.com/feed.json', '0.1.0', fetcher)).toMatchObject({ status: 'error' });
  });

  it('compares versions numerically', () => {
    expect(compareVersions('0.10.0', '0.9.9')).toBe(1);
    expect(compareVersions('1.0.0', '1.0.1')).toBe(-1);
    expect(compareVersions('v1.2.3', '1.2.3')).toBe(0);
  });
});

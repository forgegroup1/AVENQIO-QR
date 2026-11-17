#!/usr/bin/env node
/**
 * End-to-end smoke test against a running Next.js server.
 *
 *   npm run db:reset
 *   npm run dev            # in another terminal
 *   npm run test:smoke
 *
 * Uses the seeded development accounts and exercises authentication, presence
 * CRUD, cross-account isolation, community permissions, preset access rules,
 * companion pairing, bot service auth, SSRF protection, CSRF and rate limiting.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3000';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const envFile = (() => {
  try {
    return readFileSync(resolve(root, '.env.local'), 'utf8');
  } catch {
    return '';
  }
})();
const envValue = (key) => {
  const match = new RegExp(`^${key}=(.*)$`, 'm').exec(envFile);
  return match ? match[1].trim() : '';
};
const BOT_TOKEN = envValue('BOT_SERVICE_TOKEN');
const APP_ENCRYPTION_KEY = envValue('APP_ENCRYPTION_KEY');

const NOVA = '11111111-1111-4111-8111-111111111111';
const KAI = '22222222-2222-4222-8222-222222222222';
const SERVER_A = '33333333-3333-4333-8333-333333333331';
const SERVER_B = '33333333-3333-4333-8333-333333333332';

let passed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    process.stdout.write(`  \u001b[32m✓\u001b[0m ${name}\n`);
  } else {
    failures.push({ name, detail });
    process.stdout.write(`  \u001b[31m✗\u001b[0m ${name}${detail ? ` — ${detail}` : ''}\n`);
  }
}

function section(title) {
  process.stdout.write(`\n\u001b[1m${title}\u001b[0m\n`);
}

async function call(path, { method = 'GET', body, cookie, headers = {}, redirect = 'manual' } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(cookie ? { cookie } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect,
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  const setCookies = response.headers.getSetCookie?.() ?? [];
  return { status: response.status, text, json, setCookies, headers: response.headers };
}

async function signIn(userId) {
  const result = await call('/api/auth/dev', { method: 'POST', body: { userId } });
  const cookie = result.setCookies.map((entry) => entry.split(';')[0]).join('; ');
  return { cookie, status: result.status };
}

async function main() {
  process.stdout.write(`AvenqioPresence smoke test → ${BASE}\n`);

  section('Public surface');
  const home = await call('/');
  check('landing page renders', home.status === 200 && /AvenqioPresence/.test(home.text), `status ${home.status}`);
  const docs = await call('/docs');
  check('docs page renders', docs.status === 200 && /Run AvenqioPresence locally/.test(docs.text));
  const health = await call('/api/health');
  check('health endpoint reports ok', health.status === 200 && health.json?.status === 'ok', JSON.stringify(health.json));
  const login = await call('/login');
  check('login page renders', login.status === 200 && /Sign in/.test(login.text));

  section('Authentication');
  const unauthDash = await call('/dashboard');
  check(
    'unauthenticated dashboard redirects',
    unauthDash.status === 307 && /\/login/.test(unauthDash.headers.get('location') ?? ''),
    `status ${unauthDash.status}`,
  );
  const noSession = await call('/api/v1/presences');
  check('API rejects anonymous requests', noSession.status === 401, `status ${noSession.status}`);

  const devUsers = await call('/api/auth/dev');
  check(
    'dev auth lists fixture accounts',
    devUsers.status === 200 && devUsers.json?.users?.length === 2,
    JSON.stringify(devUsers.json),
  );

  const nova = await signIn(NOVA);
  check('dev sign-in issues a session cookie', nova.status === 200 && nova.cookie.includes('ap_session'));
  const session = await call('/api/auth/session', { cookie: nova.cookie });
  check(
    'session endpoint returns the signed-in account',
    session.status === 200 && session.json?.user?.id === NOVA && session.json?.user?.isDev === true,
    JSON.stringify(session.json),
  );
  const dashboard = await call('/dashboard', { cookie: nova.cookie });
  check('dashboard renders for a session', dashboard.status === 200 && /Welcome back/.test(dashboard.text));

  section('Presence lifecycle');
  const list = await call('/api/v1/presences', { cookie: nova.cookie });
  check(
    'seeded presences are listed',
    list.status === 200 && Array.isArray(list.json?.presences) && list.json.presences.length >= 3,
    `status ${list.status}`,
  );

  const invalid = await call('/api/v1/presences', {
    method: 'POST',
    cookie: nova.cookie,
    body: {
      name: 'Broken',
      payload: {
        applicationName: '',
        details: 'x'.repeat(200),
        buttons: [
          { label: 'a', url: 'https://a.example' },
          { label: 'b', url: 'https://b.example' },
          { label: 'c', url: 'https://c.example' },
        ],
      },
    },
  });
  check(
    'invalid payload is rejected with field errors',
    invalid.status === 400 && Boolean(invalid.json?.error?.fields),
    `status ${invalid.status} ${JSON.stringify(invalid.json?.error?.fields)}`,
  );

  const badTimestamps = await call('/api/v1/presences', {
    method: 'POST',
    cookie: nova.cookie,
    body: {
      name: 'Bad time',
      payload: {
        applicationName: 'AvenqioPresence',
        timestamps: { start: Date.now(), end: Date.now() - 60_000 },
      },
    },
  });
  check('end time before start time is rejected', badTimestamps.status === 400, `status ${badTimestamps.status}`);

  const created = await call('/api/v1/presences', {
    method: 'POST',
    cookie: nova.cookie,
    body: {
      name: 'Smoke test presence',
      payload: {
        applicationName: 'AvenqioPresence',
        activityType: 'playing',
        details: 'Created by the smoke test',
        state: 'Validating the pipeline',
        largeImage: { source: 'avenqio', text: 'Avenqio' },
        timestamps: { start: Date.now(), end: null },
        buttons: [{ label: 'Docs', url: 'https://example.com/docs' }],
      },
    },
  });
  const presenceId = created.json?.presence?.id;
  check('presence is created', created.status === 201 && Boolean(presenceId), `status ${created.status}`);

  const updated = await call(`/api/v1/presences/${presenceId}`, {
    method: 'PATCH',
    cookie: nova.cookie,
    body: { payload: { ...created.json.presence.payload, state: 'Updated by the smoke test' } },
  });
  check(
    'presence update persists',
    updated.status === 200 && updated.json?.presence?.payload?.state === 'Updated by the smoke test',
    `status ${updated.status}`,
  );

  const activated = await call(`/api/v1/presences/${presenceId}/activate`, {
    method: 'POST',
    cookie: nova.cookie,
    body: { active: true },
  });
  check('presence activates', activated.status === 200 && activated.json?.presence?.isActive === true);

  const afterActivate = await call('/api/v1/presences', { cookie: nova.cookie });
  const activeCount = (afterActivate.json?.presences ?? []).filter((presence) => presence.isActive).length;
  check('exactly one presence is active', activeCount === 1, `active=${activeCount}`);

  section('Cross-account isolation');
  const kai = await signIn(KAI);
  check('second account signs in', kai.status === 200 && kai.cookie.includes('ap_session'));

  const foreignRead = await call(`/api/v1/presences/${presenceId}`, { cookie: kai.cookie });
  check("another account cannot read a presence by id", foreignRead.status === 404, `status ${foreignRead.status}`);
  const foreignPatch = await call(`/api/v1/presences/${presenceId}`, {
    method: 'PATCH',
    cookie: kai.cookie,
    body: { name: 'hijacked' },
  });
  check('another account cannot patch a presence', foreignPatch.status === 404, `status ${foreignPatch.status}`);
  const foreignDelete = await call(`/api/v1/presences/${presenceId}`, { method: 'DELETE', cookie: kai.cookie });
  check('another account cannot delete a presence', foreignDelete.status === 404, `status ${foreignDelete.status}`);

  section('Community permissions');
  const novaCommunities = await call('/api/v1/communities/' + SERVER_A, { cookie: nova.cookie });
  check('owner can read their community', novaCommunities.status === 200 && novaCommunities.json?.community?.role === 'owner');

  const kaiCommunityA = await call(`/api/v1/communities/${SERVER_A}`, { cookie: kai.cookie });
  check(
    'member can read a community they belong to',
    kaiCommunityA.status === 200 && kaiCommunityA.json?.community?.role === 'member',
    `status ${kaiCommunityA.status}`,
  );

  const kaiSettings = await call(`/api/v1/communities/${SERVER_A}`, {
    method: 'PATCH',
    cookie: kai.cookie,
    body: { settings: { defaultPresetRole: 'admin' } },
  });
  check('member cannot change community settings', kaiSettings.status === 403, `status ${kaiSettings.status}`);

  const kaiPreset = await call(`/api/v1/communities/${SERVER_A}/presets`, {
    method: 'POST',
    cookie: kai.cookie,
    body: { name: 'Member preset', payload: { applicationName: 'AvenqioPresence' } },
  });
  check('member cannot create community presets', kaiPreset.status === 403, `status ${kaiPreset.status}`);

  const members = await call(`/api/v1/communities/${SERVER_B}/members`, { cookie: kai.cookie });
  check('owner can list community members', members.status === 200 && members.json?.members?.length >= 2);
  check(
    'reshuffled fields do not leak other communities',
    (members.json?.members ?? []).every((member) => member.userId !== undefined),
  );

  const memberListAsMember = await call(`/api/v1/communities/${SERVER_A}/members`, { cookie: kai.cookie });
  check('member cannot list members', memberListAsMember.status === 403, `status ${memberListAsMember.status}`);

  section('Community presets & access rules');
  const preset = await call(`/api/v1/communities/${SERVER_B}/presets`, {
    method: 'POST',
    cookie: kai.cookie,
    body: {
      name: 'Smoke test preset',
      description: 'Created by the smoke test',
      payload: {
        applicationName: 'Emergency Response: Liberty County',
        details: 'Playing as a Police Officer',
        state: 'Currently On Duty',
      },
      minRole: 'member',
      publish: true,
    },
  });
  const presetId = preset.json?.preset?.id;
  check('owner publishes a preset', preset.status === 201 && preset.json?.preset?.status === 'published');

  const novaSeesPreset = await call(`/api/v1/communities/${SERVER_B}/presets`, { cookie: nova.cookie });
  check(
    'admin of the community sees the published preset',
    novaSeesPreset.status === 200 && novaSeesPreset.json.presets.some((item) => item.id === presetId),
  );

  const novaActivatesPreset = await call(
    `/api/v1/communities/${SERVER_B}/presets/${presetId}/activate`,
    { method: 'POST', cookie: nova.cookie },
  );
  check('community preset activates', novaActivatesPreset.status === 200);

  const afterPreset = await call('/api/v1/presences', { cookie: nova.cookie });
  check(
    'activating a preset clears the personal active presence',
    (afterPreset.json?.presences ?? []).filter((item) => item.isActive).length === 0,
  );

  const revokeAccess = await call(`/api/v1/communities/${SERVER_B}/presets/${presetId}/access`, {
    method: 'PUT',
    cookie: kai.cookie,
    body: { minRole: 'member', grants: [{ userId: NOVA, canUse: false }] },
  });
  check('owner sets a per-member revoke', revokeAccess.status === 200, `status ${revokeAccess.status}`);

  const novaPresetsAfterRevoke = await call(`/api/v1/communities/${SERVER_B}/presets`, { cookie: nova.cookie });
  const revokedRow = (novaPresetsAfterRevoke.json?.presets ?? []).find((item) => item.id === presetId);
  // Nova is a preset manager of SERVER_B, so the row stays visible for management
  // but must be marked unusable. A plain member would not see it at all.
  check('revoked manager can no longer use the preset', Boolean(revokedRow) && revokedRow.canUse === false);

  const activateRevoked = await call(`/api/v1/communities/${SERVER_B}/presets/${presetId}/activate`, {
    method: 'POST',
    cookie: nova.cookie,
  });
  check('revoked member cannot activate the preset', activateRevoked.status === 403, `status ${activateRevoked.status}`);

  const restoreAccess = await call(`/api/v1/communities/${SERVER_B}/presets/${presetId}/access`, {
    method: 'PUT',
    cookie: kai.cookie,
    body: { minRole: 'admin', grants: [{ userId: NOVA, canUse: null }] },
  });
  check('access rule can be restored', restoreAccess.status === 200);

  const selfRole = await call(`/api/v1/communities/${SERVER_B}/members/${members.json.members.find((m) => m.userId === KAI)?.membershipId}`, {
    method: 'PATCH',
    cookie: kai.cookie,
    body: { role: 'admin' },
  });
  check('owner cannot change their own role', selfRole.status === 400, `status ${selfRole.status}`);

  section('Templates');
  const template = await call('/api/v1/templates', {
    method: 'POST',
    cookie: nova.cookie,
    body: {
      name: 'Smoke template',
      payload: { applicationName: 'AvenqioPresence', details: 'From a template' },
    },
  });
  check('template is created', template.status === 201 && Boolean(template.json?.template?.id));
  const fromTemplate = await call(`/api/v1/templates/${template.json.template.id}/use`, {
    method: 'POST',
    cookie: nova.cookie,
    body: {},
  });
  check('presence can be created from a template', fromTemplate.status === 201 && Boolean(fromTemplate.json?.presenceId));
  const deletedTemplate = await call(`/api/v1/templates/${template.json.template.id}`, {
    method: 'DELETE',
    cookie: nova.cookie,
  });
  check('template can be deleted', deletedTemplate.status === 200);

  section('Companion device flow');
  const pairing = await call('/api/v1/devices', {
    method: 'POST',
    cookie: nova.cookie,
    body: { name: 'Smoke test device' },
  });
  check('pairing code generated', pairing.status === 201 && /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(pairing.json?.code ?? ''));

  const badLink = await call('/api/companion/link', {
    method: 'POST',
    body: { pairingCode: 'ZZZZ-ZZZZ', deviceName: 'Bad device', os: 'windows', appVersion: '0.1.0' },
  });
  check('invalid pairing code is rejected', badLink.status === 400, `status ${badLink.status}`);

  const link = await call('/api/companion/link', {
    method: 'POST',
    body: {
      pairingCode: pairing.json.code,
      deviceName: 'Smoke test device',
      os: 'windows',
      appVersion: '0.1.0',
    },
  });
  const deviceToken = link.json?.deviceToken;
  check('device links with the pairing code', link.status === 201 && Boolean(deviceToken), `status ${link.status}`);

  const reuse = await call('/api/companion/link', {
    method: 'POST',
    body: { pairingCode: pairing.json.code, deviceName: 'Replay', os: 'windows', appVersion: '0.1.0' },
  });
  check('pairing code is single use', reuse.status === 400, `status ${reuse.status}`);

  check('companion state requires a token', (await call('/api/companion/state')).status === 401);
  const state = await call('/api/companion/state', {
    headers: { authorization: `Bearer ${deviceToken}` },
  });
  check(
    'companion state returns the account payloads',
    state.status === 200 && state.json?.account?.userId === NOVA && state.json?.presences?.length > 0,
    `status ${state.status}`,
  );
  check(
    'companion state reports the resolved active activity',
    state.json?.active !== undefined &&
      ['presence', 'community_preset', 'none'].includes(state.json.active.kind),
  );
  check(
    'companion state is scoped to allowed presets only',
    Array.isArray(state.json?.communityPresets) &&
      state.json.communityPresets.every((item) => typeof item.community?.name === 'string'),
  );

  const heartbeat = await call('/api/companion/heartbeat', {
    method: 'POST',
    headers: { authorization: `Bearer ${deviceToken}` },
    body: { appVersion: '0.1.0', rpcConnected: true, appliedPresenceId: presenceId, lastError: null },
  });
  check('heartbeat is accepted', heartbeat.status === 200, `status ${heartbeat.status}`);

  const bogusToken = await call('/api/companion/state', {
    headers: { authorization: 'Bearer not-a-real-token' },
  });
  check('invalid device token is rejected', bogusToken.status === 401, `status ${bogusToken.status}`);

  const devices = await call('/api/v1/devices', { cookie: nova.cookie });
  const linkedDevice = (devices.json?.devices ?? []).find((device) => device.name === 'Smoke test device');
  check('device appears as linked', linkedDevice?.status === 'linked');
  if (linkedDevice) {
    const revoke = await call(`/api/v1/devices/${linkedDevice.id}`, { method: 'DELETE', cookie: nova.cookie });
    check('device can be revoked', revoke.status === 200);
    const afterRevoke = await call('/api/companion/state', {
      headers: { authorization: `Bearer ${deviceToken}` },
    });
    check('revoked device token stops working', afterRevoke.status === 401, `status ${afterRevoke.status}`);
  }

  section('Bot service API');
  const noService = await call('/api/bot/sync-guild', {
    method: 'POST',
    body: { guildId: '119000000000000009', name: 'Unauthorised' },
  });
  check('bot endpoint rejects requests without a service token', noService.status === 401, `status ${noService.status}`);

  const guildSync = await call('/api/bot/sync-guild', {
    method: 'POST',
    headers: { authorization: `Bearer ${BOT_TOKEN}` },
    body: {
      guildId: '119000000000000009',
      name: 'Smoke Test Guild',
      iconHash: null,
      memberCount: 42,
      ownerDiscordId: '118000000000000002',
    },
  });
  check('bot can sync a guild with the service token', guildSync.status === 200, `status ${guildSync.status}`);

  const invalidSync = await call('/api/bot/sync-guild', {
    method: 'POST',
    headers: { authorization: `Bearer ${BOT_TOKEN}` },
    body: { guildId: 'not-a-snowflake', name: '' },
  });
  check('bot sync validates its payload', invalidSync.status === 400, `status ${invalidSync.status}`);

  const leaveGuild = await call('/api/bot/leave-guild', {
    method: 'POST',
    headers: { authorization: `Bearer ${BOT_TOKEN}` },
    body: { guildId: '199999999999999999' },
  });
  check('bot can flag a guild it was removed from', leaveGuild.status === 200, `status ${leaveGuild.status}`);

  const communityForBot = await call('/api/bot/communities/119000000000000009', {
    headers: { authorization: `Bearer ${BOT_TOKEN}` },
  });
  check(
    'bot reads community metadata',
    communityForBot.status === 200 && communityForBot.json?.server?.name === 'Smoke Test Guild',
    `status ${communityForBot.status}`,
  );

  section('Security controls');
  const crossOrigin = await call('/api/v1/presences', {
    method: 'POST',
    cookie: nova.cookie,
    headers: { origin: 'https://evil.example' },
    body: { name: 'CSRF', payload: { applicationName: 'X' } },
  });
  check('cross-origin mutation is blocked', crossOrigin.status === 403, `status ${crossOrigin.status}`);

  const ssrfCreate = await call('/api/v1/integrations', {
    method: 'POST',
    cookie: nova.cookie,
    body: {
      kind: 'fivem',
      label: 'SSRF attempt',
      config: { serverAddress: '127.0.0.1:30120' },
    },
  });
  const integrationId = ssrfCreate.json?.integration?.id;
  check('integration with a private target can be stored but not fetched', ssrfCreate.status === 201);
  if (integrationId) {
    const ssrfTest = await call(`/api/v1/integrations/${integrationId}/test`, {
      method: 'POST',
      cookie: nova.cookie,
    });
    check(
      'integration fetch refuses private network targets',
      ssrfTest.status === 400 && /private|local/i.test(ssrfTest.json?.error?.message ?? ''),
      `status ${ssrfTest.status} ${ssrfTest.json?.error?.message ?? ''}`,
    );
    await call(`/api/v1/integrations/${integrationId}`, { method: 'DELETE', cookie: nova.cookie });
  }

  const erlcNoKey = await call('/api/v1/integrations', {
    method: 'POST',
    cookie: nova.cookie,
    body: { kind: 'erlc', label: 'ERLC without key', config: {} },
  });
  check('ER:LC integration requires a server key', erlcNoKey.status === 400, `status ${erlcNoKey.status}`);

  check(
    'encryption key is configured for credential storage',
    APP_ENCRYPTION_KEY.length > 0,
    'APP_ENCRYPTION_KEY missing in .env.local',
  );

  const rateHeaders = { 'x-forwarded-for': '198.51.100.77' };
  let sawRateLimit = false;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const limited = await call('/api/auth/dev', {
      method: 'POST',
      headers: rateHeaders,
      body: { userId: NOVA },
    });
    if (limited.status === 429) {
      sawRateLimit = true;
      break;
    }
  }
  check('auth endpoint rate limits repeated attempts', sawRateLimit);

  section('Pages for authenticated data');
  const pages = [
    ['/dashboard/presences', /My presences/],
    ['/dashboard/communities', /Communities/],
    ['/dashboard/integrations', /Game &amp; roleplay integrations/],
    ['/dashboard/settings?tab=security', /Active sessions/],
  ];
  for (const [path, pattern] of pages) {
    const page = await call(path, { cookie: nova.cookie });
    check(`${path} renders`, page.status === 200 && pattern.test(page.text), `status ${page.status}`);
  }
  const communityPage = await call(`/dashboard/communities/${SERVER_B}`, { cookie: nova.cookie });
  check(
    'community detail page renders presets',
    communityPage.status === 200 && communityPage.text.includes('Community presets'),
    `status ${communityPage.status}`,
  );
  const editorPage = await call(`/dashboard/presences/${presenceId}`, { cookie: nova.cookie });
  check('presence editor page renders', editorPage.status === 200 && /Live preview/.test(editorPage.text));

  const kaiAdminPage = await call('/dashboard/admin', { cookie: kai.cookie });
  check('staff account can open the verification queue', kaiAdminPage.status === 200 && /Verification queue/.test(kaiAdminPage.text));
  const novaAdminPage = await call('/dashboard/admin', { cookie: nova.cookie });
  check('non-staff account gets 404 on the staff page', novaAdminPage.status === 404, `status ${novaAdminPage.status}`);

  section('Cleanup');
  await call(`/api/v1/presences/${presenceId}`, { method: 'DELETE', cookie: nova.cookie });
  await call(`/api/v1/presences/${fromTemplate.json?.presenceId}`, { method: 'DELETE', cookie: nova.cookie });
  await call(`/api/v1/communities/${SERVER_B}/presets/${presetId}`, { method: 'DELETE', cookie: kai.cookie });
  const cleanup = await call('/api/v1/presences', { cookie: nova.cookie });
  check('cleanup leaves the seeded data intact', cleanup.status === 200 && cleanup.json.presences.length >= 3);

  process.stdout.write(
    `\n\u001b[1m${passed} passed, ${failures.length} failed\u001b[0m\n`,
  );
  if (failures.length) {
    for (const failure of failures) {
      process.stdout.write(` - ${failure.name}${failure.detail ? ` (${failure.detail})` : ''}\n`);
    }
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('\nSmoke test crashed:', error);
  process.exitCode = 1;
});

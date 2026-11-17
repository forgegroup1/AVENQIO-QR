import { truncate } from './discord';
import { DISCORD_LIMITS } from './limits';
import { emptyPresencePayload, type PresencePayload } from './presence';
import type { IntegrationKind } from './roles';

/**
 * Integration adapters.
 *
 * Every adapter declares *exactly* how much it can automate. Two modes exist:
 *  - `manual`             — the user types the values, nothing is fetched.
 *  - `requires-credentials` — a real, documented data source is queried by the
 *                             server (FiveM /info.json, PRC API), but only once the
 *                             community supplies the required address or key.
 * No adapter pretends to read another user's Discord presence.
 */
export type AutomationStatus = 'manual' | 'requires-credentials' | 'unsupported';

export type IntegrationField = {
  key: string;
  label: string;
  kind: 'text' | 'select';
  placeholder?: string;
  help?: string;
  required?: boolean;
  maxLength?: number;
  options?: Array<{ value: string; label: string }>;
};

export type IntegrationSnapshot = {
  fetchedAt: string;
  serverName?: string | null;
  playersOnline?: number | null;
  maxPlayers?: number | null;
  version?: string | null;
  notes?: string[];
};

export type IntegrationValues = Record<string, string | undefined>;

export type IntegrationDefinition = {
  key: IntegrationKind;
  name: string;
  vendor: string;
  category: 'game' | 'roleplay';
  summary: string;
  automation: {
    status: AutomationStatus;
    detail: string;
    requires?: string[];
    docsUrl?: string;
    playerLevel: string;
  };
  fields: IntegrationField[];
  buildPresence(values: IntegrationValues, snapshot?: IntegrationSnapshot | null): PresencePayload;
};

const clean = (value: string | undefined, max: number): string | null => {
  const trimmed = (value ?? '').trim();
  return trimmed ? truncate(trimmed, max) : null;
};

const ERLC_ROLE_OPTIONS = [
  { value: 'police', label: 'Police Officer' },
  { value: 'sheriff', label: 'Sheriff Deputy' },
  { value: 'fire', label: 'Firefighter' },
  { value: 'dot', label: 'DOT / Civilian Services' },
  { value: 'civilian', label: 'Civilian' },
  { value: 'staff', label: 'Server Staff' },
  { value: 'custom', label: 'Other (type a role)' },
];

const DUTY_OPTIONS = [
  { value: 'on', label: 'On duty' },
  { value: 'off', label: 'Off duty' },
];

const ERLC_ROLE_LABELS: Record<string, string> = {
  police: 'Police Officer',
  sheriff: 'Sheriff Deputy',
  fire: 'Firefighter',
  dot: 'DOT / Civilian Services',
  civilian: 'Civilian',
  staff: 'Server Staff',
};

export const ERLC: IntegrationDefinition = {
  key: 'erlc',
  name: 'Emergency Response: Liberty County',
  vendor: 'Police Roleplay Community',
  category: 'roleplay',
  summary:
    'Publish a roleplay-aware presence for ER:LC players: role, duty status and the server they are playing on.',
  automation: {
    status: 'requires-credentials',
    requires: ['ERLC private-server API key (Server-Key)', 'ERLC API server pack on the community server'],
    detail:
      'Server name and player counts can be read from the PRC private-server API. Player-level data (who is on duty, in which role) is not exposed by that API, so character details stay manual.',
    docsUrl: 'https://apidocs.policeroleplay.community',
    playerLevel: 'Manual — the PRC API does not expose per-player roleplay state.',
  },
  fields: [
    {
      key: 'characterName',
      label: 'Character name',
      kind: 'text',
      placeholder: 'Alex Carter',
      help: 'Optional. Shown in the small-image tooltip of the generated presence.',
      maxLength: 64,
    },
    { key: 'role', label: 'Role', kind: 'select', options: ERLC_ROLE_OPTIONS, required: true },
    {
      key: 'customRole',
      label: 'Custom role',
      kind: 'text',
      placeholder: 'SWAT Operator',
      help: 'Used when Role is set to "Other".',
      maxLength: 48,
    },
    { key: 'duty', label: 'Duty status', kind: 'select', options: DUTY_OPTIONS, required: true },
    {
      key: 'callsign',
      label: 'Callsign / unit',
      kind: 'text',
      placeholder: 'Unit 12',
      maxLength: 24,
    },
    {
      key: 'joinUrl',
      label: 'Server link (button)',
      kind: 'text',
      placeholder: 'https://policeroleplay.community/forums/…',
      help: 'Optional. Rendered as the presence button.',
      maxLength: 512,
    },
  ],
  buildPresence(values, snapshot) {
    const base = emptyPresencePayload();
    const roleKey = (values.role ?? 'civilian').toLowerCase();
    const roleLabel =
      roleKey === 'custom'
        ? (clean(values.customRole, 48) ?? 'Custom role')
        : (ERLC_ROLE_LABELS[roleKey] ?? 'Civilian');
    const onDuty = (values.duty ?? 'on').toLowerCase() !== 'off';
    const callsign = clean(values.callsign, 24);

    const details = truncate(`Playing as a ${roleLabel}`, DISCORD_LIMITS.details);
    const stateText = `${onDuty ? 'Currently On Duty' : 'Currently Off Duty'}${callsign ? ` · ${callsign}` : ''}`;

    const buttons: PresencePayload['buttons'] = [];
    if (values.joinUrl && /^https?:\/\//i.test(values.joinUrl.trim())) {
      buttons.push({ label: 'Join server', url: values.joinUrl.trim().slice(0, DISCORD_LIMITS.buttonUrl) });
    }

    const party =
      snapshot?.playersOnline != null && snapshot.maxPlayers != null
        ? {
            current: Math.max(1, Math.min(snapshot.playersOnline, DISCORD_LIMITS.partyMax)),
            max: Math.max(1, Math.min(snapshot.maxPlayers, DISCORD_LIMITS.partyMax)),
          }
        : null;

    return {
      ...base,
      applicationName: 'Emergency Response: Liberty County',
      details,
      state: truncate(stateText, DISCORD_LIMITS.state),
      smallImage: values.characterName?.trim()
        ? { source: 'erlc', text: truncate(values.characterName.trim(), DISCORD_LIMITS.imageText) }
        : null,
      largeImage: { source: 'erlc', text: snapshot?.serverName ? truncate(snapshot.serverName, 128) : 'Emergency Response: Liberty County' },
      party: party && party.current <= party.max ? party : null,
      buttons,
    };
  },
};

export const FIVEM: IntegrationDefinition = {
  key: 'fivem',
  name: 'FiveM',
  vendor: 'Cfx.re',
  category: 'game',
  summary:
    'Show the character, job and activity of a FiveM roleplay session, with live server population read from the server itself.',
  automation: {
    status: 'requires-credentials',
    requires: ['Public FiveM server address (ip:port)'],
    detail:
      'The server address is queried for the public /info.json and /players.json endpoints. Per-player data is not public, so character, job and activity are entered manually or pushed by the community’s own resource through the API.',
    docsUrl: 'https://docs.fivem.net/docs/server-manual/server-commands/',
    playerLevel: 'Manual — public endpoints expose aggregate player counts only.',
  },
  fields: [
    { key: 'characterName', label: 'Character name', kind: 'text', placeholder: 'Mia Rossi', maxLength: 64 },
    { key: 'job', label: 'Job / role', kind: 'text', placeholder: 'Paramedic', maxLength: 48 },
    { key: 'activity', label: 'Current activity', kind: 'text', placeholder: 'Responding to a call', maxLength: 64 },
    {
      key: 'serverAddress',
      label: 'Server address',
      kind: 'text',
      placeholder: '203.0.113.10:30120',
      help: 'Used for live player counts and the connect button. Never used for player-level data.',
    },
    { key: 'serverName', label: 'Server name (display)', kind: 'text', placeholder: 'Los Santos Life RP', maxLength: 64 },
  ],
  buildPresence(values, snapshot) {
    const base = emptyPresencePayload();
    const character = clean(values.characterName, 64);
    const job = clean(values.job, 48);
    const activity = clean(values.activity, 64);
    const serverName = clean(values.serverName, 64) ?? snapshot?.serverName ?? null;
    const address = clean(values.serverAddress, 96);

    const details = character
      ? truncate(`Playing as ${character}`, DISCORD_LIMITS.details)
      : serverName
        ? truncate(serverName, DISCORD_LIMITS.details)
        : null;
    const stateParts = [job, activity].filter(Boolean) as string[];
    const state = stateParts.length ? truncate(stateParts.join(' · '), DISCORD_LIMITS.state) : null;

    const buttons: PresencePayload['buttons'] = [];
    if (address && /^[\w.\-]+:\d{1,5}$/.test(address)) {
      buttons.push({ label: 'Connect to server', url: `https://cfx.re/join/?${encodeURIComponent(address)}` });
    }

    let party: PresencePayload['party'] = null;
    if (snapshot?.playersOnline != null && snapshot.maxPlayers != null && snapshot.maxPlayers > 0) {
      party = {
        current: Math.max(1, Math.min(snapshot.playersOnline, DISCORD_LIMITS.partyMax)),
        max: Math.max(1, Math.min(snapshot.maxPlayers, DISCORD_LIMITS.partyMax)),
      };
    }

    return {
      ...base,
      applicationName: 'FiveM',
      largeImage: { source: 'fivem', text: serverName ?? 'FiveM' },
      smallImage: character ? { source: 'fivem_character', text: truncate(character, DISCORD_LIMITS.imageText) } : null,
      details,
      state,
      party: party && party.current <= party.max ? party : null,
      buttons,
    };
  },
};

export const INTEGRATIONS: Record<IntegrationKind, IntegrationDefinition> = {
  fivem: FIVEM,
  erlc: ERLC,
};

export const INTEGRATION_LIST: IntegrationDefinition[] = [FIVEM, ERLC];

export function getIntegration(kind: IntegrationKind): IntegrationDefinition {
  return INTEGRATIONS[kind];
}

export function isIntegrationKind(value: unknown): value is IntegrationKind {
  return value === 'fivem' || value === 'erlc';
}

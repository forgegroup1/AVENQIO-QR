import type { IntegrationSnapshot } from '@avenqio/shared';
import { config } from '../config';
import { ApiError } from '../http/errors';
import { fetchJson } from './network';

/** ── FiveM ──────────────────────────────────────────────────────────────────
 * Every FXServer exposes /info.json and (unless disabled) /players.json on its
 * game port. Those are public, aggregate endpoints: they carry the server name,
 * the convar `sv_maxclients` and the player list — never a player's character or
 * job, which is why character details stay manual.
 * Docs: https://docs.fivem.net/docs/server-manual/server-commands/
 */
export function parseFiveMAddress(input: string): { host: string; port: number; url: string } {
  const trimmed = input.trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
  const match = /^([A-Za-z0-9.-]+)(?::(\d{1,5}))?$/.exec(trimmed);
  if (!match) {
    throw ApiError.badRequest('Enter the FiveM server address as ip:port (for example 203.0.113.10:30120).');
  }
  const host = match[1]!;
  const port = match[2] ? Number(match[2]) : 30120;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw ApiError.badRequest('That port number is not valid.');
  }
  return { host, port, url: `http://${host}:${port}` };
}

type FiveMInfo = {
  vars?: Record<string, string>;
  serverVersion?: string;
  version?: number;
};

export async function fetchFiveMSnapshot(address: string): Promise<IntegrationSnapshot> {
  const { url } = parseFiveMAddress(address);
  const [info, players] = await Promise.allSettled([
    fetchJson(`${url}/info.json`) as Promise<FiveMInfo>,
    fetchJson(`${url}/players.json`) as Promise<unknown[]>,
  ]);
  if (info.status === 'rejected') {
    throw info.reason instanceof Error
      ? info.reason
      : new ApiError(502, 'integration_unreachable', 'FiveM server unreachable.');
  }
  const vars = info.value?.vars ?? {};
  const maxPlayersRaw = vars.sv_maxclients ?? vars.sv_maxClients;
  const maxPlayers = maxPlayersRaw ? Number(maxPlayersRaw) : null;
  const notes: string[] = [];
  let playersOnline: number | null = null;
  if (players.status === 'fulfilled' && Array.isArray(players.value)) {
    playersOnline = players.value.length;
  } else {
    notes.push('/players.json is disabled on this server; player counts come from the server convar only.');
  }
  return {
    fetchedAt: new Date().toISOString(),
    serverName: vars.sv_projectName ?? vars.sv_hostname ?? null,
    playersOnline,
    maxPlayers: Number.isFinite(maxPlayers) ? maxPlayers : null,
    version: info.value?.serverVersion ?? null,
    notes,
  };
}

/** ── Emergency Response: Liberty County (PRC private-server API) ─────────────
 * Requires the ERLC API server pack and the server key from the in-game ER settings.
 * The API exposes server status and player lists; it does not expose roleplay state
 * (who is on duty, in which role), so those fields remain manual.
 * Docs: https://apidocs.policeroleplay.community
 */
type ErlcServerPayload = {
  Name?: string;
  name?: string;
  CurPlayers?: number;
  CurrentPlayers?: number;
  MaxPlayers?: number;
  Players?: unknown[];
  players?: unknown[];
};

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}

export async function fetchErlcSnapshot(serverKey: string): Promise<IntegrationSnapshot> {
  if (!serverKey || serverKey.trim().length < 8) {
    throw ApiError.badRequest('Enter the ER:LC server key from your private server settings.');
  }
  const base = config.erlc.baseUrl;
  const raw = (await fetchJson(`${base}/v1/server`, {
    headers: { 'Server-Key': serverKey.trim() },
  })) as ErlcServerPayload | ErlcServerPayload[];

  const server: ErlcServerPayload = Array.isArray(raw) ? (raw[0] ?? {}) : raw;
  let playersOnline = firstNumber(server.CurPlayers, server.CurrentPlayers, server.Players?.length, server.players?.length);
  const maxPlayers = firstNumber(server.MaxPlayers);

  if (playersOnline === null) {
    // Fall back to the dedicated players endpoint when the summary omits a count.
    try {
      const players = (await fetchJson(`${base}/v1/server/players`, {
        headers: { 'Server-Key': serverKey.trim() },
      })) as unknown[];
      if (Array.isArray(players)) playersOnline = players.length;
    } catch {
      // Count stays unknown; the presence simply omits the party line.
    }
  }

  return {
    fetchedAt: new Date().toISOString(),
    serverName: server.Name ?? server.name ?? null,
    playersOnline,
    maxPlayers,
    version: null,
    notes: [
      'Player-level roleplay state (role, duty status) is not exposed by the PRC API and stays manual.',
    ],
  };
}

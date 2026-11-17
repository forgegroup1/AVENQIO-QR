import { lookup } from 'node:dns/promises';
import { config } from '../config';
import { ApiError } from '../http/errors';

const MAX_BODY_BYTES = 512 * 1024;

function isPrivateAddress(address: string): boolean {
  if (address.includes(':')) {
    const normalized = address.toLowerCase();
    return (
      normalized === '::1' ||
      normalized === '::' ||
      normalized.startsWith('fe80:') ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd')
    );
  }
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return true;
  const [a, b] = parts as [number, number, number, number];
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

/**
 * Integrations fetch URLs supplied by users, which makes them an SSRF vector.
 * Every request is restricted to http(s) on public addresses, with redirects
 * disabled so a 30x cannot bounce the request into a private network.
 * Local/private targets can be enabled for self-hosted setups via env.
 */
export async function assertPublicTarget(url: URL): Promise<void> {
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw ApiError.badRequest('Only http:// and https:// targets are supported.');
  }
  if (url.username || url.password) {
    throw ApiError.badRequest('Credentials in the URL are not allowed.');
  }
  const allowPrivate = config.allowPrivateIntegrationTargets;
  const hostname = url.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    if (!allowPrivate) throw ApiError.badRequest('Local network targets are disabled on this deployment.');
  }
  if (isPrivateAddress(hostname)) {
    if (!allowPrivate) throw ApiError.badRequest('Private network targets are disabled on this deployment.');
    return;
  }
  if (!allowPrivate) {
    let addresses: Array<{ address: string }>;
    try {
      addresses = await lookup(hostname, { all: true, verbatim: true });
    } catch {
      throw new ApiError(502, 'integration_unreachable', `Could not resolve ${hostname}.`);
    }
    if (addresses.some((entry) => isPrivateAddress(entry.address))) {
      throw ApiError.badRequest('That host resolves to a private address, which is not allowed.');
    }
  }
}

export async function fetchJson(
  target: string,
  options: { headers?: Record<string, string>; timeoutMs?: number } = {},
): Promise<unknown> {
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    throw ApiError.badRequest('That is not a valid URL.');
  }
  await assertPublicTarget(url);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { accept: 'application/json', ...options.headers },
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(options.timeoutMs ?? 6000),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'network error';
    throw new ApiError(502, 'integration_unreachable', `The server did not respond (${reason}).`);
  }

  if (!response.ok) {
    throw new ApiError(
      502,
      'integration_error',
      `The server answered ${response.status}. Check the address and, for ER:LC, the API key.`,
    );
  }

  const text = await response.text();
  if (text.length > MAX_BODY_BYTES) {
    throw new ApiError(502, 'integration_error', 'The server response was unexpectedly large.');
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiError(502, 'integration_error', 'The server did not return JSON.');
  }
}

export function isPrivateAddressForTests(address: string): boolean {
  return isPrivateAddress(address);
}

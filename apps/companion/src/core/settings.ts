export type CompanionSettings = {
  apiUrl: string;
  deviceId: string | null;
  deviceToken: string | null;
  startWithWindows: boolean;
  minimizeToTray: boolean;
  autoPublish: boolean;
  autoUpdates: boolean;
  rpcClientId: string | null;
  lastUpdateCheck: string | null;
};

export const DEFAULT_SETTINGS: CompanionSettings = {
  apiUrl: 'http://localhost:3000',
  deviceId: null,
  deviceToken: null,
  startWithWindows: false,
  minimizeToTray: true,
  autoPublish: true,
  autoUpdates: true,
  rpcClientId: null,
  lastUpdateCheck: null,
};

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asUrl(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return fallback;
    return parsed.origin;
  } catch {
    return fallback;
  }
}

/**
 * Settings files are user-editable, so every field is validated on read. A
 * corrupt file must never prevent the app from starting.
 */
export function normalizeSettings(raw: unknown, fallbackApiUrl: string): CompanionSettings {
  const input = (raw ?? {}) as Partial<Record<keyof CompanionSettings, unknown>>;
  return {
    apiUrl: asUrl(input.apiUrl, asUrl(fallbackApiUrl, DEFAULT_SETTINGS.apiUrl)),
    deviceId: typeof input.deviceId === 'string' && input.deviceId.length > 0 ? input.deviceId : null,
    deviceToken: typeof input.deviceToken === 'string' && input.deviceToken.length > 0 ? input.deviceToken : null,
    startWithWindows: asBoolean(input.startWithWindows, DEFAULT_SETTINGS.startWithWindows),
    minimizeToTray: asBoolean(input.minimizeToTray, DEFAULT_SETTINGS.minimizeToTray),
    autoPublish: asBoolean(input.autoPublish, DEFAULT_SETTINGS.autoPublish),
    autoUpdates: asBoolean(input.autoUpdates, DEFAULT_SETTINGS.autoUpdates),
    rpcClientId: typeof input.rpcClientId === 'string' && /^\d{17,20}$/.test(input.rpcClientId) ? input.rpcClientId : null,
    lastUpdateCheck: typeof input.lastUpdateCheck === 'string' ? input.lastUpdateCheck : null,
  };
}

export function settingsForRenderer(settings: CompanionSettings): CompanionSettings {
  // The device token never leaves the main process.
  return { ...settings, deviceToken: settings.deviceToken ? '••••••' : null };
}

export type UpdateCheck =
  | { status: 'available'; version: string; url: string; notes: string | null }
  | { status: 'current'; version: string }
  | { status: 'not-configured' }
  | { status: 'error'; message: string };

function parseVersion(value: string): number[] {
  return value
    .replace(/^v/i, '')
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0);
}

export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a);
  const right = parseVersion(b);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

type Feed = { version?: unknown; url?: unknown; notes?: unknown };

/**
 * Automatic updates are only active when a signed release feed is configured.
 * Without it the app says so instead of pretending to self-update.
 */
export async function checkForUpdates(
  feedUrl: string | null,
  currentVersion: string,
  fetcher: typeof fetch = fetch,
): Promise<UpdateCheck> {
  if (!feedUrl) return { status: 'not-configured' };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    const response = await fetcher(feedUrl, { signal: controller.signal, redirect: 'error' });
    clearTimeout(timer);
    if (!response.ok) return { status: 'error', message: `Update feed responded with ${response.status}` };
    const feed = (await response.json()) as Feed;
    if (typeof feed.version !== 'string' || typeof feed.url !== 'string') {
      return { status: 'error', message: 'Update feed is malformed' };
    }
    if (compareVersions(feed.version, currentVersion) <= 0) {
      return { status: 'current', version: currentVersion };
    }
    return {
      status: 'available',
      version: feed.version,
      url: feed.url,
      notes: typeof feed.notes === 'string' ? feed.notes : null,
    };
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : 'Update check failed' };
  }
}

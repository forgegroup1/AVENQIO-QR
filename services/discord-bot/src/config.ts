import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * The bot reads exactly the same `.env.local` as the web app. Values already
 * present in the process environment win, so `DISCORD_BOT_TOKEN=… npm start`
 * keeps working in containers.
 */
function parseEnvFile(content: string): Array<[string, string]> {
  const entries: Array<[string, string]> = [];
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) entries.push([key, value]);
  }
  return entries;
}

function findRepoRoot(start = process.cwd()): string {
  let current = resolve(start);
  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(join(current, 'db', 'migrations'))) return current;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return resolve(start);
}

export function loadEnv(): void {
  const root = findRepoRoot();
  for (const file of [join(root, '.env.local'), join(root, '.env')]) {
    if (!existsSync(file)) continue;
    for (const [key, value] of parseEnvFile(readFileSync(file, 'utf8'))) {
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}

export type BotConfig = {
  token: string;
  apiUrl: string;
  serviceToken: string;
  devGuildId: string | null;
  dashboardUrl: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
};

/**
 * Validates configuration once, with actionable messages. The bot refuses to
 * start half-configured rather than silently doing nothing.
 */
export function readConfig(env: NodeJS.ProcessEnv = process.env): { ok: true; config: BotConfig } | { ok: false; problems: string[] } {
  const problems: string[] = [];

  const token = env.DISCORD_BOT_TOKEN?.trim() ?? '';
  if (!token) problems.push('DISCORD_BOT_TOKEN is missing. Create a Bot in the Discord developer portal and copy its token.');

  const serviceToken = env.BOT_SERVICE_TOKEN?.trim() ?? '';
  if (!serviceToken) problems.push('BOT_SERVICE_TOKEN is missing. It must match the value configured for the web app.');

  const apiUrl = (env.BOT_API_URL?.trim() || env.APP_URL?.trim() || 'http://localhost:3000').replace(/\/+$/, '');
  if (!/^https?:\/\//.test(apiUrl)) problems.push('APP_URL must be an absolute http(s) URL.');

  const level = env.BOT_LOG_LEVEL?.trim();
  const logLevel = (['debug', 'info', 'warn', 'error'] as const).includes(level as never)
    ? (level as BotConfig['logLevel'])
    : 'info';

  if (problems.length) return { ok: false, problems };

  return {
    ok: true,
    config: {
      token,
      apiUrl,
      serviceToken,
      devGuildId: env.DISCORD_DEV_GUILD_ID?.trim() || null,
      dashboardUrl: env.APP_URL?.trim() || apiUrl,
      logLevel,
    },
  };
}

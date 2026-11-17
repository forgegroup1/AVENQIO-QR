import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

let loaded = false;

/**
 * Loads the single `.env.local` at the repository root.
 *
 * Next.js only reads env files from the app directory, but the bot and the
 * companion build scripts also need the same configuration. Loading it here
 * (from instrumentation and from the config module) keeps one source of truth.
 * Values already present in `process.env` always win, so container/CI env vars
 * are never overwritten.
 */
export function findRepoRoot(start = process.cwd()): string {
  let current = resolve(start);
  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(join(current, 'db', 'migrations')) && existsSync(join(current, 'package.json'))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return resolve(start);
}

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

export function loadRootEnv(): void {
  if (loaded) return;
  loaded = true;

  const explicit = process.env.AVENQIO_ENV_FILE;
  const root = findRepoRoot();
  const candidates = explicit
    ? [resolve(explicit)]
    : [join(root, '.env.local'), join(root, '.env'), join(process.cwd(), '.env.local')];

  for (const file of candidates) {
    if (!existsSync(file)) continue;
    try {
      for (const [key, value] of parseEnvFile(readFileSync(file, 'utf8'))) {
        if (process.env[key] === undefined) process.env[key] = value;
      }
    } catch (error) {
      console.error(`[env] could not read ${file}`, error);
    }
  }
}

loadRootEnv();

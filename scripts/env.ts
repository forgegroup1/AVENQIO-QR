/**
 * Shared env loader for CLI scripts.
 * Next.js loads `.env.local` by itself; scripts and the bot use this helper so a
 * single file at the repository root configures every component.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function loadEnv(root = process.env.AVENQIO_ROOT ?? process.cwd()): void {
  for (const file of ['.env.local', '.env']) {
    const path = join(root, file);
    if (!existsSync(path)) continue;
    const content = readFileSync(path, 'utf8');
    for (const rawLine of content.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}

export function env(key: string, fallback = ''): string {
  const value = process.env[key];
  return value === undefined || value === '' ? fallback : value;
}

export function envList(key: string): string[] {
  return env(key)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

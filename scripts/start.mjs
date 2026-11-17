#!/usr/bin/env node
/**
 * Production start helper: `npm run build && npm start`.
 *
 * The web app is a standard Next.js server; this script only makes sure the
 * repository-root environment file is loaded before Next boots, because the
 * configuration lives outside `apps/web` (shared with the bot and companion).
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = process.env.PORT ?? '3000';

function parseEnv(content) {
  const values = {};
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index === -1) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

for (const file of [join(root, '.env.local'), join(root, '.env')]) {
  if (!existsSync(file)) continue;
  for (const [key, value] of Object.entries(parseEnv(readFileSync(file, 'utf8')))) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

if (!existsSync(join(root, 'apps/web/.next/BUILD_ID'))) {
  console.error('No production build found. Run `npm run build` first.');
  process.exit(1);
}

if (process.env.NODE_ENV !== 'production') {
  console.warn('NODE_ENV is not "production" — starting the Next.js server anyway.');
}

const child = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['next', 'start', '-H', '0.0.0.0', '-p', port],
  { cwd: join(root, 'apps/web'), stdio: 'inherit', env: { ...process.env, NODE_ENV: 'production' } },
);

child.on('exit', (code) => process.exit(code ?? 0));
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}

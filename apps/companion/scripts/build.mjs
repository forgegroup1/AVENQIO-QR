/**
 * Builds the companion with esbuild.
 *
 * Values from the repository-root `.env.local` are inlined at build time
 * (`COMPANION_API_URL`, `COMPANION_RPC_CLIENT_ID`, `COMPANION_UPDATE_FEED_URL`)
 * because a packaged Electron app has no .env file next to it.
 */
import { build, context } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const repoRoot = resolve(root, '../..');
const dist = join(root, 'dist');
const watch = process.argv.includes('--watch');

function parseEnv(content) {
  const values = {};
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index === -1) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

async function readEnv() {
  for (const file of [join(repoRoot, '.env.local'), join(repoRoot, '.env')]) {
    if (existsSync(file)) return parseEnv(await readFile(file, 'utf8'));
  }
  return {};
}

const env = await readEnv();
const define = {};
for (const key of ['COMPANION_API_URL', 'COMPANION_RPC_CLIENT_ID', 'COMPANION_UPDATE_FEED_URL', 'DISCORD_RPC_CLIENT_ID']) {
  const value = process.env[key] ?? env[key];
  if (value) define[`process.env.${key}`] = JSON.stringify(value);
}
if (!define['process.env.COMPANION_RPC_CLIENT_ID'] && define['process.env.DISCORD_RPC_CLIENT_ID']) {
  define['process.env.COMPANION_RPC_CLIENT_ID'] = define['process.env.DISCORD_RPC_CLIENT_ID'];
}

const shared = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['electron'],
  define,
  sourcemap: false,
  minify: !watch,
  logLevel: 'info',
};

const entries = [
  { ...shared, entryPoints: [join(root, 'src/main.ts')], outfile: join(dist, 'main.cjs') },
  { ...shared, entryPoints: [join(root, 'src/preload.ts')], outfile: join(dist, 'preload.cjs') },
];

await rm(dist, { recursive: true, force: true });
await mkdir(join(dist, 'renderer'), { recursive: true });

if (watch) {
  for (const options of entries) {
    const ctx = await context(options);
    await ctx.watch();
  }
  await cp(join(root, 'renderer'), join(dist, 'renderer'), { recursive: true });
  await copyIcon();
  console.log('watching companion sources…');
} else {
  for (const options of entries) await build(options);
  await cp(join(root, 'renderer'), join(dist, 'renderer'), { recursive: true });
  await copyIcon();
  const { version } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  await writeFile(join(dist, 'build-info.json'), JSON.stringify({ version, builtAt: new Date().toISOString() }, null, 2));
  console.log(`companion built → ${dist}`);
}

async function copyIcon() {
  const source = join(root, 'build/icon.png');
  if (!existsSync(source)) {
    console.warn('build/icon.png is missing — the window will use the default Electron icon');
    return;
  }
  await cp(source, join(dist, 'icon.png'));
}

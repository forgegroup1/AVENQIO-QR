#!/usr/bin/env tsx
/**
 * Database maintenance CLI.
 *
 *   npm run db:migrate    apply pending SQL migrations
 *   npm run db:seed       insert development fixtures (embedded driver only)
 *   npm run db:reset      drop the schema, migrate and reseed (embedded only)
 *   npm run db:policies   apply Supabase RLS policies (postgres only)
 */
import { loadEnv } from './env';
import { applyPolicies, dbConfig, getDb, migrate } from '../apps/web/src/server/db/index';
import { seedDevData } from './seed';

loadEnv();

const command = process.argv[2] ?? 'migrate';

async function main() {
  const config = dbConfig();
  console.info(`[db] driver=${config.driver}${config.driver === 'embedded' ? ` dir=${config.dir}` : ''}`);

  if (command === 'policies') {
    const sql = await getDb();
    const files = await applyPolicies(sql);
    console.info(`[db] applied ${files.length} policy file(s)`);
    await sql.close();
    return;
  }

  const sql = await getDb();

  if (command === 'reset') {
    if (config.driver !== 'embedded') {
      throw new Error('db:reset refuses to run against a hosted database. Drop and recreate it manually.');
    }
    await sql.exec('drop schema public cascade; create schema public;');
    console.info('[db] schema dropped');
  }

  if (command !== 'seed') {
    const applied = await migrate(sql);
    console.info(applied.length ? `[db] applied: ${applied.join(', ')}` : '[db] schema already up to date');
  }

  if (command === 'seed' || command === 'reset') {
    if (config.driver !== 'embedded' && process.env.ALLOW_SEED_ON_HOSTED !== 'true') {
      throw new Error('Refusing to seed fixtures into a hosted database. Set ALLOW_SEED_ON_HOSTED=true to override.');
    }
    await sql.transaction((tx) => seedDevData(tx));
    console.info('[db] development fixtures inserted (2 dev accounts)');
  }

  await sql.close();
}

main().catch((error: unknown) => {
  console.error('[db] failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});

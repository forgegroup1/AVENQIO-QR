/**
 * Database driver abstraction.
 *
 * One SQL dialect (PostgreSQL) with two transports:
 *   embedded  — PGlite (Postgres compiled to WASM, persisted on disk). Zero
 *               configuration, used for local development and the test suite.
 *   postgres  — any PostgreSQL 15+ server, including Supabase.
 *
 * Keeping a single dialect means the schema, the queries and the migrations are
 * identical in development and production; only the transport changes.
 */
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

export type DriverName = 'embedded' | 'postgres';

export type Queryable = {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  exec(sql: string): Promise<void>;
};

export type Sql = Queryable & {
  driver: DriverName;
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
};

type SqlState = {
  sql: Sql;
  migrated?: Promise<void>;
};

const globalForDb = globalThis as unknown as { __avenqioDb?: SqlState };

export function findRepoRoot(start = process.cwd()): string {
  let current = resolve(start);
  for (let depth = 0; depth < 8; depth += 1) {
    const pkg = join(current, 'package.json');
    const dbDir = join(current, 'db', 'migrations');
    if (existsSync(pkg) && existsSync(dbDir)) return current;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return resolve(start);
}

export function dbConfig() {
  const driver: DriverName = process.env.DB_DRIVER === 'postgres' ? 'postgres' : 'embedded';
  const dir = process.env.DATABASE_DIR ?? '.data/pglite';
  return {
    driver,
    dir: dir === 'memory://' ? dir : resolve(findRepoRoot(), dir),
    url: process.env.DATABASE_URL ?? '',
    ssl: process.env.PGSSL ?? (driver === 'postgres' ? 'require' : 'disable'),
    autoMigrate: process.env.AUTO_MIGRATE !== 'false',
  };
}

/** PGlite rejects JS objects for jsonb parameters; serialize them explicitly. */
function normalizeParams(params: unknown[]): unknown[] {
  return params.map((param) => {
    if (param === null || param === undefined) return param ?? null;
    if (param instanceof Date) return param;
    if (Array.isArray(param) || typeof param === 'object') return JSON.stringify(param);
    return param;
  });
}

async function createEmbeddedSql(dir: string): Promise<Sql> {
  const { PGlite } = await import('@electric-sql/pglite');
  if (dir !== 'memory://') {
    await mkdir(dir, { recursive: true });
  }
  const client = dir === 'memory://' ? await PGlite.create() : await PGlite.create(dir);

  const queryable: Queryable = {
    async query<T>(text: string, params: unknown[] = []) {
      const result = await client.query<T>(text, normalizeParams(params) as never[]);
      return result.rows;
    },
    async exec(sql: string) {
      await client.exec(sql);
    },
  };

  return {
    driver: 'embedded',
    ...queryable,
    async transaction(fn) {
      // A query issued on the outer client while this transaction is open waits on
      // itself. Fail loudly instead of hanging the request forever.
      let timer: ReturnType<typeof setTimeout> | undefined;
      const guard = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                'Embedded transaction exceeded 20s — check for queries issued outside the active transaction.',
              ),
            ),
          20_000,
        );
        timer.unref?.();
      });
      try {
        return await Promise.race([
          client.transaction(async (tx) => {
            const txQueryable: Queryable = {
              async query<T>(text: string, params: unknown[] = []) {
                const result = await tx.query<T>(text, normalizeParams(params) as never[]);
                return result.rows;
              },
              async exec(sql: string) {
                await tx.exec(sql);
              },
            };
            return fn(txQueryable);
          }) as Promise<never>,
          guard,
        ]);
      } finally {
        clearTimeout(timer);
      }
    },
    async close() {
      await client.close();
    },
  };
}

async function createPostgresSql(url: string, ssl: string): Promise<Sql> {
  if (!url) {
    throw new Error(
      'DB_DRIVER=postgres requires DATABASE_URL. Copy .env.example to .env.local and set it, or use DB_DRIVER=embedded.',
    );
  }
  const { default: postgres } = await import('postgres');
  const client = postgres(url, {
    max: 8,
    idle_timeout: 20,
    ssl: ssl === 'disable' ? false : ssl === 'prefer' ? { rejectUnauthorized: false } : 'require',
    onnotice: process.env.NODE_ENV === 'production' ? undefined : () => {},
  });

  const run = async <T>(text: string, params: unknown[] = []): Promise<T[]> => {
    // postgres.js serializes objects/arrays for json columns automatically.
    const rows = await client.unsafe(text, params as never[]);
    return rows as unknown as T[];
  };

  return {
    driver: 'postgres',
    query: run,
    async exec(sql: string) {
      await client.unsafe(sql);
    },
    async transaction(fn) {
      return client.begin(async (tx) => {
        const txQueryable: Queryable = {
          query: async <T>(text: string, params: unknown[] = []) =>
            (await tx.unsafe(text, params as never[])) as unknown as T[],
          exec: async (sql: string) => {
            await tx.unsafe(sql);
          },
        };
        return fn(txQueryable);
      }) as Promise<never>;
    },
    async close() {
      await client.end({ timeout: 5 });
    },
  };
}

export async function getDb(): Promise<Sql> {
  if (globalForDb.__avenqioDb) return globalForDb.__avenqioDb.sql;
  const config = dbConfig();
  const sql =
    config.driver === 'postgres'
      ? await createPostgresSql(config.url, config.ssl)
      : await createEmbeddedSql(config.dir);
  const state: SqlState = { sql };
  globalForDb.__avenqioDb = state;
  return sql;
}

export async function migrationFiles(): Promise<Array<{ version: string; path: string }>> {
  const dir = join(findRepoRoot(), 'db', 'migrations');
  const files = (await readdir(dir)).filter((file) => file.endsWith('.sql')).sort();
  return files.map((file) => ({ version: file, path: join(dir, file) }));
}

export async function policyFiles(): Promise<string[]> {
  const dir = join(findRepoRoot(), 'db', 'policies');
  if (!existsSync(dir)) return [];
  const files = (await readdir(dir)).filter((file) => file.endsWith('.sql')).sort();
  return files.map((file) => join(dir, file));
}

/** Applies pending migrations in order inside a transaction, and records them. */
export async function migrate(sql: Sql): Promise<string[]> {
  await sql.exec(`
    create table if not exists schema_migrations (
      version text primary key,
      applied_at timestamptz not null default now()
    );
  `);
  const applied = new Set(
    (await sql.query<{ version: string }>('select version from schema_migrations')).map((row) => row.version),
  );
  const newlyApplied: string[] = [];
  for (const migration of await migrationFiles()) {
    if (applied.has(migration.version)) continue;
    const text = await readFile(migration.path, 'utf8');
    await sql.transaction(async (tx) => {
      await tx.exec(text);
      await tx.query('insert into schema_migrations (version) values ($1)', [migration.version]);
    });
    newlyApplied.push(migration.version);
  }
  return newlyApplied;
}

export async function applyPolicies(sql: Sql): Promise<string[]> {
  if (sql.driver !== 'postgres') {
    throw new Error('RLS policies require a PostgreSQL/Supabase connection (DB_DRIVER=postgres).');
  }
  const files = await policyFiles();
  for (const file of files) {
    await sql.exec(await readFile(file, 'utf8'));
  }
  return files;
}

/** Returns a migrated database, memoised per process. */
export async function getReadyDb(): Promise<Sql> {
  const state = globalForDb.__avenqioDb;
  const sql = await getDb();
  if (!dbConfig().autoMigrate) return sql;
  if (!state) return sql;
  if (!state.migrated) {
    state.migrated = migrate(sql).then((applied) => {
      if (applied.length && process.env.NODE_ENV !== 'test') {
        console.info(`[db] applied migrations: ${applied.join(', ')}`);
      }
    });
  }
  await state.migrated;
  return sql;
}

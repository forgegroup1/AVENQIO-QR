/**
 * Next.js server startup hook. Loads the repository-root environment file before
 * any route module is evaluated, so configuration is identical in the web app,
 * the bot and the CLI scripts.
 *
 * The `NEXT_RUNTIME === 'nodejs'` check is a compile-time constant per runtime, so
 * the edge compilation drops this import instead of trying to bundle node:fs.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { loadRootEnv } = await import('./server/env');
    loadRootEnv();
  }
}

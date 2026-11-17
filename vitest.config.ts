import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@avenqio\/shared$/, replacement: resolve(__dirname, 'packages/shared/src/index.ts') },
      { find: /^@\//, replacement: resolve(__dirname, 'apps/web/src') + '/' },
    ],
  },
  test: {
    include: ['packages/shared/src/**/*.test.ts', 'apps/web/src/**/*.test.ts', 'apps/companion/src/**/*.test.ts', 'services/discord-bot/src/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});

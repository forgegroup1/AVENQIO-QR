import type { NextConfig } from 'next';

// Configuration lives in the repository-root .env.local and is loaded by
// src/instrumentation.ts (and src/server/env.ts) at server startup.

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@avenqio/shared'],
  // Native/WASM modules must stay outside the bundle.
  serverExternalPackages: ['@electric-sql/pglite', 'postgres'],
  logging: { fetches: { fullUrl: false } },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'off' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;

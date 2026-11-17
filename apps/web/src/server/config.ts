/** Server-only configuration. Never import this from a client component. */
import { loadRootEnv } from './env';

loadRootEnv();

const env = (key: string, fallback = ''): string => {
  const value = process.env[key];
  return value === undefined || value === '' ? fallback : value;
};

export const config = {
  appUrl: env('APP_URL', 'http://localhost:3000').replace(/\/+$/, ''),
  isProduction: process.env.NODE_ENV === 'production',
  discord: {
    clientId: env('DISCORD_CLIENT_ID'),
    clientSecret: env('DISCORD_CLIENT_SECRET'),
    redirectUri: env('DISCORD_REDIRECT_URI', `${env('APP_URL', 'http://localhost:3000')}/api/auth/discord/callback`),
    botInviteUrl: env('DISCORD_BOT_INVITE_URL'),
    rpcClientId: env('DISCORD_RPC_CLIENT_ID'),
  },
  /**
   * Dev sign-in exists so the product can be evaluated and tested without a
   * Discord application. It is not an authentication factor: the flag must be
   * turned off for any public deployment (see README → Security).
   */
  devAuthEnabled: env('ALLOW_DEV_AUTH', 'false') === 'true',
  adminDiscordIds: env('AVENQIO_ADMIN_DISCORD_IDS')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean),
  encryptionKey: env('APP_ENCRYPTION_KEY'),
  botServiceToken: env('BOT_SERVICE_TOKEN'),
  opsToken: env('OPS_TOKEN'),
  erlc: {
    baseUrl: env('ERLC_API_BASE_URL', 'https://api.policeroleplay.community').replace(/\/+$/, ''),
  },
  allowPrivateIntegrationTargets: env('ALLOW_PRIVATE_INTEGRATION_TARGETS', 'false') === 'true',
  session: {
    ttlSeconds: 60 * 60 * 24 * 30,
    cookieName: 'ap_session',
    stateCookieName: 'ap_oauth_state',
    nextCookieName: 'ap_oauth_next',
  },
  companion: {
    pollIntervalSeconds: 30,
    pairingTtlMinutes: 10,
  },
} as const;

export function discordOAuthConfigured(): boolean {
  return Boolean(config.discord.clientId && config.discord.clientSecret);
}

export function isStaffDiscordId(discordUserId: string | null | undefined): boolean {
  if (!discordUserId) return false;
  return config.adminDiscordIds.includes(discordUserId);
}

export const SITE = {
  name: 'AvenqioPresence',
  company: 'Avenqio',
  tagline: 'Discord Rich Presence, managed.',
  description:
    'Create, validate and publish Discord Rich Presence configurations for yourself and your community — with a Windows companion that talks to your own Discord client.',
  supportUrl: 'https://discord.gg/XPvpVG38BD',
} as const;

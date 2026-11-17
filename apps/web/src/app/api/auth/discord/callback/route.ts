import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { config, discordOAuthConfigured } from '@/server/config';
import { establishSession } from '@/server/auth/session';
import { exchangeCode, fetchGuilds, fetchProfile, syncDiscordIdentity } from '@/server/auth/discord';
import { ApiError } from '@/server/http/errors';
import { clientIp, enforceRateLimit } from '@/server/http/rate-limit';
import { hashIp } from '@/server/security/crypto';
import { safeNextPath } from '@/server/http/auth';

function fail(reason: string) {
  return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(reason)}`, config.appUrl));
}

/** Step 2: verify state, exchange the code, sync communities and start a session. */
export async function GET(request: Request) {
  if (!discordOAuthConfigured()) return fail('discord_not_configured');

  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');
  if (error) return fail('access_denied');

  const store = await cookies();
  const expectedState = store.get(config.session.stateCookieName)?.value;
  const next = safeNextPath(store.get(config.session.nextCookieName)?.value);

  if (!code || !state || !expectedState || state !== expectedState) {
    return fail('invalid_state');
  }
  try {
    enforceRateLimit(`oauth:callback:${clientIp(request)}`, 20, 60_000);

    const accessToken = await exchangeCode(code);
    const [profile, guilds] = await Promise.all([fetchProfile(accessToken), fetchGuilds(accessToken)]);
    const { userId } = await syncDiscordIdentity(profile, guilds);
    await establishSession(userId, {
      userAgent: request.headers.get('user-agent'),
      ip: clientIp(request),
    });
    void hashIp(clientIp(request));

    const response = NextResponse.redirect(new URL(next, config.appUrl));
    response.cookies.delete(config.session.stateCookieName);
    response.cookies.delete(config.session.nextCookieName);
    return response;
  } catch (caught) {
    if (caught instanceof ApiError && caught.status === 429) return fail('rate_limited');
    console.error('[auth] discord callback failed', caught);
    return fail('discord_error');
  }
}

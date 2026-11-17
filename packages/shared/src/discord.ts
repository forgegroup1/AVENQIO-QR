import { ACTIVITY_LABELS, type ActivityType } from './limits';

/** BigInt permission bitfields, as documented by Discord. */
export const DISCORD_PERMISSION_BITS = {
  ADMINISTRATOR: 1n << 3n,
  MANAGE_GUILD: 1n << 5n,
  MANAGE_ROLES: 1n << 28n,
  VIEW_CHANNEL: 1n << 10n,
} as const;

/** Discord guild payload permissions arrive as a decimal string. */
export function hasGuildManagement(permissions: string | number | bigint | null | undefined): boolean {
  if (permissions === null || permissions === undefined) return false;
  try {
    const bits = BigInt(permissions);
    return (
      (bits & DISCORD_PERMISSION_BITS.ADMINISTRATOR) !== 0n ||
      (bits & DISCORD_PERMISSION_BITS.MANAGE_GUILD) !== 0n
    );
  } catch {
    return false;
  }
}

export function isGuildOwner(guild: { owner?: boolean }, permissions?: string | number | null): boolean {
  return guild.owner === true || hasGuildManagement(permissions);
}

export function discordAvatarUrl(
  userId: string,
  avatarHash: string | null | undefined,
  size: 64 | 128 | 256 | 512 = 128,
): string | null {
  if (!avatarHash) return null;
  const extension = avatarHash.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.${extension}?size=${size}`;
}

export function discordGuildIconUrl(
  guildId: string,
  iconHash: string | null | undefined,
  size: 128 | 256 = 128,
): string | null {
  if (!iconHash) return null;
  const extension = iconHash.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/icons/${guildId}/${iconHash}.${extension}?size=${size}`;
}

export function defaultDiscordAvatarUrl(userId: string): string {
  // Discord's default avatar index is derived from the snowflake.
  try {
    const index = Number((BigInt(userId) >> 22n) % 6n);
    return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
  } catch {
    return 'https://cdn.discordapp.com/embed/avatars/0.png';
  }
}

export function activityVerb(type: ActivityType): string {
  return ACTIVITY_LABELS[type].verb;
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1))}…`;
}

/** Compact duration for previews ("02:14:09"). */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value: number) => value.toString().padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

export function relativeTime(from: string | number | Date, now: Date = new Date()): string {
  const date = from instanceof Date ? from : new Date(from);
  const diff = now.getTime() - date.getTime();
  if (!Number.isFinite(diff)) return '—';
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}

/** Codes users type into the desktop app are short and unambiguous. */
const PAIRING_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generatePairingCode(random: (size: number) => Uint8Array, length = 8): string {
  const bytes = random(length);
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += PAIRING_ALPHABET[bytes[i]! % PAIRING_ALPHABET.length];
  }
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export function normalizePairingCode(input: string): string {
  return input.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Discord snowflakes are 17-20 digit strings. */
export function isDiscordId(value: string): boolean {
  return /^\d{17,20}$/.test(value);
}

/** Community roles. Higher rank means more authority inside that community. */
export const SERVER_ROLES = ['member', 'preset_manager', 'admin', 'owner'] as const;
export type ServerRole = (typeof SERVER_ROLES)[number];

export const SERVER_ROLE_RANK: Record<ServerRole, number> = {
  member: 0,
  preset_manager: 1,
  admin: 2,
  owner: 3,
};

export const SERVER_ROLE_LABELS: Record<ServerRole, string> = {
  member: 'Member',
  preset_manager: 'Preset manager',
  admin: 'Administrator',
  owner: 'Owner',
};

export function isServerRole(value: unknown): value is ServerRole {
  return typeof value === 'string' && (SERVER_ROLES as readonly string[]).includes(value);
}

export function roleAtLeast(role: ServerRole | null | undefined, minimum: ServerRole): boolean {
  if (!role) return false;
  return SERVER_ROLE_RANK[role] >= SERVER_ROLE_RANK[minimum];
}

export const PRESET_STATUSES = ['draft', 'published', 'archived'] as const;
export type PresetStatus = (typeof PRESET_STATUSES)[number];

export const PRESET_STATUS_LABELS: Record<PresetStatus, string> = {
  draft: 'Draft',
  published: 'Published',
  archived: 'Archived',
};

export const VERIFICATION_STATUSES = ['unverified', 'pending', 'verified', 'rejected'] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const VERIFICATION_LABELS: Record<VerificationStatus, string> = {
  unverified: 'Unverified',
  pending: 'Verification pending',
  verified: 'Verified community',
  rejected: 'Verification rejected',
};

export const INTEGRATION_KINDS = ['fivem', 'erlc'] as const;
export type IntegrationKind = (typeof INTEGRATION_KINDS)[number];

export const PRESENCE_SOURCES = ['manual', 'template', 'fivem', 'erlc'] as const;
export type PresenceSource = (typeof PRESENCE_SOURCES)[number];

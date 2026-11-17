import { z } from 'zod';
import { SERVER_ROLES } from '@avenqio/shared';

const uuid = z.string().uuid('Invalid identifier');
const name = (max = 80) => z.string().trim().min(1, 'Required').max(max, `Maximum ${max} characters`);

/**
 * z.unknown() accepts undefined, which would silently make payloads optional.
 * This refinement keeps the field required while still delegating the actual
 * shape validation to presencePayloadSchema inside the service layer.
 */
const payloadInput = z.unknown().refine((value) => value !== undefined, { message: 'A presence payload is required' });

export const presenceCreateSchema = z.object({
  name: name(),
  payload: payloadInput,
  serverId: uuid.nullable().optional(),
  activate: z.boolean().optional(),
});

export const presenceUpdateSchema = z.object({
  name: name().optional(),
  payload: z.unknown().optional(),
  serverId: uuid.nullable().optional(),
});

export const presenceActivateSchema = z.object({ active: z.boolean() });

export const templateCreateSchema = z.object({
  name: name(),
  description: z.string().trim().max(280).nullable().optional(),
  payload: payloadInput,
});

export const saveTemplateSchema = z.object({ name: name() });

export const templateUseSchema = z.object({ name: name().optional() });

export const communitySettingsSchema = z.object({
  settings: z.object({
    defaultPresetRole: z.enum(['member', 'preset_manager', 'admin']).optional(),
    allowMemberSubmissions: z.boolean().optional(),
    accent: z.string().regex(/^[a-z]{3,20}$/).optional(),
  }),
});

export const memberRoleSchema = z.object({ role: z.enum(['member', 'preset_manager', 'admin']) });

export const presetCreateSchema = z.object({
  name: name(),
  description: z.string().trim().max(280).nullable().optional(),
  payload: payloadInput,
  minRole: z.enum(SERVER_ROLES).optional(),
  publish: z.boolean().optional(),
});

export const presetUpdateSchema = z.object({
  name: name().optional(),
  description: z.string().trim().max(280).nullable().optional(),
  payload: z.unknown().optional(),
  minRole: z.enum(SERVER_ROLES).optional(),
});

export const presetStatusSchema = z.object({ status: z.enum(['draft', 'published', 'archived']) });

export const presetAccessSchema = z.object({
  minRole: z.enum(SERVER_ROLES).optional(),
  grants: z
    .array(z.object({ userId: uuid, canUse: z.boolean().nullable() }))
    .max(200)
    .optional(),
});

export const verificationDecisionSchema = z.object({
  decision: z.enum(['verified', 'rejected']),
  note: z.string().trim().max(300).nullable().optional(),
});

export const integrationCreateSchema = z.object({
  kind: z.enum(['fivem', 'erlc']),
  label: name(60),
  config: z.record(z.unknown()).optional(),
  credentials: z.object({ serverKey: z.string().trim().min(8).max(200) }).partial().optional(),
});

export const integrationUpdateSchema = z.object({
  label: name(60).optional(),
  config: z.record(z.unknown()).optional(),
  credentials: z.object({ serverKey: z.string().trim().min(8).max(200).nullable() }).partial().optional(),
});

export const integrationPresenceSchema = z.object({
  name: name(),
  values: z.record(z.string().max(520)).optional(),
});

export const deviceCreateSchema = z.object({ name: name(60).optional() });

export const companionLinkSchema = z.object({
  pairingCode: z.string().trim().min(4, 'Enter the pairing code').max(24),
  deviceName: z.string().trim().min(1).max(60),
  os: z.string().trim().max(20).default('windows'),
  appVersion: z.string().trim().max(20).default('0.1.0'),
});

export const companionHeartbeatSchema = z.object({
  appVersion: z.string().trim().max(20).optional(),
  rpcConnected: z.boolean().optional(),
  appliedPresenceId: uuid.nullable().optional(),
  lastError: z.string().trim().max(300).nullable().optional(),
});

export const companionSelectSchema = z
  .object({
    presenceId: uuid.nullable().optional(),
    presetId: uuid.nullable().optional(),
  })
  .refine((value) => value.presenceId !== undefined || value.presetId !== undefined, {
    message: 'Provide a presenceId or presetId.',
  });

export const profileUpdateSchema = z.object({
  displayName: z.string().trim().min(1).max(64).optional(),
  locale: z.enum(['en', 'it']).optional(),
  preferences: z.unknown().optional(),
});

export const devSignInSchema = z.object({ userId: uuid });

export const botLeaveGuildSchema = z.object({
  guildId: z.string().regex(/^\d{17,20}$/, 'Invalid guild id'),
});

export const botSyncGuildSchema = z.object({
  guildId: z.string().regex(/^\d{17,20}$/, 'Invalid guild id'),
  name: z.string().trim().min(1).max(100),
  iconHash: z.string().max(120).nullable().optional(),
  memberCount: z.number().int().min(0).max(10_000_000).nullable().optional(),
  ownerDiscordId: z.string().regex(/^\d{17,20}$/).nullable().optional(),
});

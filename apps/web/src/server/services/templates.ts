import { validatePresence, type PresencePayload } from '@avenqio/shared';
import { getReadyDb } from '../db';
import type { DbTemplate } from '../db/types';
import { ApiError } from '../http/errors';
import { logActivity } from './activity';
import { createPresence, getPresence } from './presences';

export type TemplateDto = {
  id: string;
  name: string;
  description: string | null;
  payload: PresencePayload;
  createdAt: string;
};

function toDto(row: DbTemplate): TemplateDto {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    payload: row.payload,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export async function listTemplates(userId: string): Promise<TemplateDto[]> {
  const db = await getReadyDb();
  const rows = await db.query<DbTemplate>(
    'select * from presence_templates where owner_user_id = $1 order by updated_at desc',
    [userId],
  );
  return rows.map(toDto);
}

export async function createTemplate(
  userId: string,
  input: { name: string; description?: string | null; payload: unknown },
): Promise<TemplateDto> {
  const name = input.name.trim();
  if (!name || name.length > 80) throw ApiError.badRequest('Give the template a name (1–80 characters).');
  const result = validatePresence(input.payload);
  if (!result.ok || !result.payload) {
    throw ApiError.badRequest('The template contains invalid values.', {
      payload: result.errors[0]?.message ?? 'Invalid presence',
    });
  }
  const db = await getReadyDb();
  const rows = await db.query<DbTemplate>(
    `insert into presence_templates (owner_user_id, name, description, payload)
     values ($1, $2, $3, $4) returning *`,
    [userId, name, input.description?.slice(0, 280) ?? null, JSON.stringify(result.payload)],
  );
  return toDto(rows[0]!);
}

export async function deleteTemplate(userId: string, templateId: string): Promise<void> {
  const db = await getReadyDb();
  const rows = await db.query<{ id: string }>(
    'delete from presence_templates where id = $1 and owner_user_id = $2 returning id',
    [templateId, userId],
  );
  if (!rows.length) throw ApiError.notFound('Template not found.');
}

export async function savePresenceAsTemplate(
  userId: string,
  presenceId: string,
  name: string,
): Promise<TemplateDto> {
  const presence = await getPresence(userId, presenceId);
  return createTemplate(userId, {
    name: name.trim() || presence.name,
    description: `Saved from “${presence.name}”`,
    payload: presence.payload,
  });
}

export async function createPresenceFromTemplate(
  userId: string,
  templateId: string,
  name?: string,
): Promise<{ presenceId: string }> {
  const db = await getReadyDb();
  const rows = await db.query<DbTemplate>(
    'select * from presence_templates where id = $1 and owner_user_id = $2',
    [templateId, userId],
  );
  const template = rows[0];
  if (!template) throw ApiError.notFound('Template not found.');
  const presence = await createPresence(userId, {
    name: name?.trim() || template.name,
    payload: template.payload,
    source: 'template',
  });
  await logActivity({
    userId,
    action: 'template.used',
    message: `Created a presence from template “${template.name}”`,
    metadata: { templateId, presenceId: presence.id },
  });
  return { presenceId: presence.id };
}

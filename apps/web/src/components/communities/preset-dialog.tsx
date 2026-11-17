'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ACTIVITY_TYPES,
  normalizeDraft,
  validatePresence,
  type PresenceDraft,
  type PresencePayload,
  type ServerRole,
} from '@avenqio/shared';
import { apiFetch, ApiClientError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Badge, Callout } from '@/components/ui/display';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Dialog, useToast } from '@/components/ui/overlay';
import { PresenceForm, type FormIssue } from '@/components/presence/presence-form';
import { DiscordPreview } from '@/components/presence/discord-preview';
import { IconAlert, IconInfo } from '@/components/icons';

export type EditablePreset = {
  id: string;
  name: string;
  description: string | null;
  payload: PresencePayload;
  minRole: ServerRole;
  status: 'draft' | 'published' | 'archived';
};

/** Create/edit a community preset, reusing the same form and preview as the editor. */
export function PresetDialog({
  open,
  onClose,
  communityId,
  preset,
  onSaved,
  user,
}: {
  open: boolean;
  onClose: () => void;
  communityId: string;
  preset?: EditablePreset | null;
  onSaved: () => void;
  user: { displayName: string; avatarUrl: string | null; username: string | null };
}) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [minRole, setMinRole] = useState<ServerRole>('member');
  const [publishNow, setPublishNow] = useState(true);
  const [draft, setDraft] = useState<PresenceDraft>({ applicationName: 'AvenqioPresence', activityType: 'playing' });
  const [issues, setIssues] = useState<FormIssue[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(preset?.name ?? '');
    setDescription(preset?.description ?? '');
    setMinRole(preset?.minRole ?? 'member');
    setPublishNow(preset ? preset.status === 'published' : true);
    setDraft(
      preset
        ? { ...preset.payload }
        : {
            applicationName: 'AvenqioPresence',
            activityType: 'playing',
            details: '',
            state: '',
            timestamps: { start: Date.now(), end: null },
          },
    );
    setIssues([]);
  }, [open, preset]);

  const normalized = useMemo(() => normalizeDraft(draft), [draft]);
  const validation = useMemo(() => validatePresence(normalized), [normalized]);

  const preview: PresencePayload = useMemo(() => {
    if (validation.ok && validation.payload) return validation.payload;
    return {
      applicationName: (draft.applicationName ?? 'AvenqioPresence').trim() || 'AvenqioPresence',
      activityType: ACTIVITY_TYPES.includes((draft.activityType ?? 'playing') as never) ? draft.activityType! : 'playing',
      details: draft.details?.trim() || null,
      state: draft.state?.trim() || null,
      largeImage: draft.largeImage?.source?.trim()
        ? { source: draft.largeImage.source.trim(), text: draft.largeImage.text || null }
        : null,
      smallImage: draft.smallImage?.source?.trim()
        ? { source: draft.smallImage.source.trim(), text: draft.smallImage.text || null }
        : null,
      timestamps:
        draft.timestamps && (draft.timestamps.start || draft.timestamps.end)
          ? { start: draft.timestamps.start ?? null, end: draft.timestamps.end ?? null }
          : null,
      party: null,
      buttons: (draft.buttons ?? [])
        .filter((button) => button.label?.trim() && button.url?.trim())
        .map((button) => ({ label: button.label!.trim(), url: button.url!.trim() })),
    };
  }, [draft, validation]);

  const submit = async () => {
    if (!validation.ok || !validation.payload) {
      toast({ title: 'Fix the preset fields', description: validation.errors[0]?.message, tone: 'error' });
      return;
    }
    if (!name.trim()) {
      toast({ title: 'Give the preset a name', tone: 'error' });
      return;
    }
    setBusy(true);
    setIssues([]);
    try {
      if (preset) {
        await apiFetch(`/api/v1/communities/${communityId}/presets/${preset.id}`, {
          method: 'PATCH',
          body: { name: name.trim(), description: description.trim() || null, payload: validation.payload, minRole },
        });
        if (publishNow !== (preset.status === 'published')) {
          await apiFetch(`/api/v1/communities/${communityId}/presets/${preset.id}`, {
            method: 'PATCH',
            body: { status: publishNow ? 'published' : 'draft' },
          });
        }
        toast({ title: 'Preset updated', description: 'Members using it see the change immediately.', tone: 'success' });
      } else {
        await apiFetch(`/api/v1/communities/${communityId}/presets`, {
          method: 'POST',
          body: {
            name: name.trim(),
            description: description.trim() || null,
            payload: validation.payload,
            minRole,
            publish: publishNow,
          },
        });
        toast({ title: publishNow ? 'Preset published' : 'Draft saved', tone: 'success' });
      }
      onSaved();
      onClose();
    } catch (error) {
      if (error instanceof ApiClientError) {
        const fields = error.fields ?? {};
        setIssues(
          Object.entries(fields).map(([path, message]) => ({
            path: path.startsWith('payload.') ? path.slice(8) : path,
            message,
          })),
        );
        toast({ title: 'Could not save preset', description: error.message, tone: 'error' });
      } else {
        toast({ title: 'Could not save preset', tone: 'error' });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      width="lg"
      title={preset ? 'Edit preset' : 'New community preset'}
      description="Presets are owned by the community. Editing one updates every member who activated it."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} onClick={() => void submit()}>
            {preset ? 'Save preset' : publishNow ? 'Publish preset' : 'Save draft'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Preset name" htmlFor="preset-name" required>
            <Input id="preset-name" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} placeholder="On duty — patrol" />
          </Field>
          <Field label="Minimum role" htmlFor="preset-role" hint="Per-member overrides can be added after saving.">
            <Select id="preset-role" value={minRole} onChange={(event) => setMinRole(event.target.value as ServerRole)}>
              <option value="member">All members</option>
              <option value="preset_manager">Preset managers and above</option>
              <option value="admin">Administrators only</option>
              <option value="owner">Owner only</option>
            </Select>
          </Field>
        </div>

        <Field label="Description" htmlFor="preset-description" hint="Shown to members in the presences list.">
          <Textarea
            id="preset-description"
            value={description}
            maxLength={280}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Approved patrol presence for all members"
          />
        </Field>

        <label className="flex items-center gap-2.5 rounded-lg border border-line bg-bg-deep/40 px-3 py-2 text-[12.5px] text-ink-soft">
          <input
            type="checkbox"
            checked={publishNow}
            onChange={(event) => setPublishNow(event.target.checked)}
            className="h-3.5 w-3.5 accent-[#8b5cf6]"
          />
          Publish immediately — members with access can activate it right away
        </label>

        <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
          <div className="min-w-0">
            <PresenceForm draft={draft} setDraft={setDraft} issues={issues} disabled={busy} />
          </div>
          <div className="space-y-3 lg:w-[300px]">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">Preview</p>
              {validation.ok ? (
                <Badge tone="success">Valid</Badge>
              ) : (
                <Badge tone="danger">{validation.errors.length} issue(s)</Badge>
              )}
            </div>
            <div className="flex justify-center rounded-xl border border-line bg-[radial-gradient(80%_60%_at_50%_0%,#171326,#0a0810)] p-3">
              <DiscordPreview payload={preview} user={user} variant="compact" />
            </div>
            {validation.warnings.length ? (
              <Callout tone="warning" icon={<IconAlert className="h-4 w-4" />}>
                {validation.warnings[0]!.message}
              </Callout>
            ) : (
              <p className="flex items-start gap-2 text-[11px] leading-relaxed text-ink-muted">
                <IconInfo className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Validation runs against the same schema the API enforces.
              </p>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
}

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ACTIVITY_TYPES,
  normalizeDraft,
  summarizePresence,
  validatePresence,
  type PresenceDraft,
  type PresencePayload,
} from '@avenqio/shared';
import { Badge, Card, CardBody, Callout, Tooltip } from '@/components/ui/display';
import { Button, ButtonLink } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/form';
import { Dialog, Dropdown, useToast } from '@/components/ui/overlay';
import { DiscordPreview } from '@/components/presence/discord-preview';
import { PresenceForm, type FormIssue } from '@/components/presence/presence-form';
import {
  IconAlert,
  IconCheck,
  IconCopy,
  IconInfo,
  IconLayers,
  IconMore,
  IconSave,
  IconTrash,
  IconUsers,
} from '@/components/icons';
import { apiFetch, ApiClientError } from '@/lib/api-client';
import { cn } from '@/lib/cn';

type CommunityOption = { id: string; name: string; role: string };

type PresenceShape = {
  id: string;
  name: string;
  payload: PresencePayload;
  isActive: boolean;
  serverId: string | null;
  serverName: string | null;
  updatedAt: string;
};

type TemplateShape = { id: string; name: string; payload: PresencePayload };

/**
 * Best-effort payload for the live preview while the form still contains values
 * the schema rejects (e.g. a half-typed URL). Keeps the preview responsive
 * without ever saving invalid data.
 */
function previewPayload(draft: PresenceDraft): PresencePayload {
  const result = validatePresence(normalizeDraft(draft));
  if (result.ok && result.payload) return result.payload;
  const activityType = ACTIVITY_TYPES.includes((draft.activityType ?? 'playing') as never)
    ? draft.activityType!
    : 'playing';
  return {
    applicationName: (draft.applicationName ?? '').trim() || 'AvenqioPresence',
    activityType,
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
    party:
      draft.party && (draft.party.current || draft.party.max)
        ? {
            current: Number(draft.party.current ?? 1),
            max: Number(draft.party.max ?? 1),
          }
        : null,
    buttons: (draft.buttons ?? [])
      .filter((button) => (button.label ?? '').trim() && (button.url ?? '').trim())
      .map((button) => ({ label: button.label!.trim(), url: button.url!.trim() })),
  };
}

export function PresenceEditor({
  mode,
  presence,
  communities,
  templates,
  user,
}: {
  mode: 'create' | 'edit';
  presence?: PresenceShape;
  communities: CommunityOption[];
  templates: TemplateShape[];
  user: { displayName: string; avatarUrl: string | null; username: string | null };
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [name, setName] = useState(presence?.name ?? '');
  const [draft, setDraft] = useState<PresenceDraft>(() =>
    presence ? { ...presence.payload } : { applicationName: 'AvenqioPresence', activityType: 'playing' },
  );
  const [serverId, setServerId] = useState<string | null>(presence?.serverId ?? null);
  const [busy, setBusy] = useState<null | 'save' | 'activate' | 'delete' | 'duplicate' | 'template'>(null);
  const [serverFieldErrors, setServerFieldErrors] = useState<Record<string, string> | undefined>();
  const [nameError, setNameError] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(presence?.isActive ?? false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [publish, setPublish] = useState({ communityId: '', name: '', minRole: 'member' });
  const [initialSnapshot] = useState(() => JSON.stringify({ name: presence?.name ?? '', draft, serverId }));

  const normalized = useMemo(() => normalizeDraft(draft), [draft]);
  const validation = useMemo(() => validatePresence(normalized), [normalized]);
  const preview = useMemo(() => previewPayload(draft), [draft]);

  const issues: FormIssue[] = useMemo(() => {
    const list: FormIssue[] = validation.errors.map((issue) => ({ path: issue.path, message: issue.message }));
    for (const [path, message] of Object.entries(serverFieldErrors ?? {})) {
      const clean = path.startsWith('payload.') ? path.slice('payload.'.length) : path;
      if (!list.some((issue) => issue.path === clean)) list.push({ path: clean, message });
    }
    return list;
  }, [validation.errors, serverFieldErrors]);

  const dirty = JSON.stringify({ name, draft, serverId }) !== initialSnapshot;
  const manageable = communities.filter((community) => community.role !== 'member');

  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const save = useCallback(
    async (options: { activate?: boolean; quiet?: boolean } = {}) => {
      if (!validation.ok || !validation.payload) {
        toast({
          title: 'Fix the highlighted fields',
          description: validation.errors[0]?.message ?? 'The presence is not valid yet.',
          tone: 'error',
        });
        return null;
      }
      if (!name.trim()) {
        setNameError('Give this presence a name.');
        return null;
      }
      setBusy('save');
      setServerFieldErrors(undefined);
      setNameError(null);
      try {
        const body = {
          name: name.trim(),
          payload: validation.payload,
          serverId: serverId ?? null,
          ...(mode === 'create' ? { activate: options.activate ?? false } : {}),
        };
        if (mode === 'create') {
          const created = await apiFetch<{ presence: PresenceShape }>('/api/v1/presences', {
            method: 'POST',
            body,
          });
          toast({ title: 'Presence created', tone: 'success' });
          router.replace(`/dashboard/presences/${created.presence.id}`);
          router.refresh();
          return created.presence;
        }
        const updated = await apiFetch<{ presence: PresenceShape }>(`/api/v1/presences/${presence!.id}`, {
          method: 'PATCH',
          body: { name: body.name, payload: body.payload, serverId: body.serverId },
        });
        if (options.activate) {
          await apiFetch(`/api/v1/presences/${presence!.id}/activate`, {
            method: 'POST',
            body: { active: true },
          });
          setIsActive(true);
        }
        if (!options.quiet) toast({ title: 'Changes saved', tone: 'success' });
        router.refresh();
        return updated.presence;
      } catch (error) {
        if (error instanceof ApiClientError) {
          setServerFieldErrors(error.fields);
          toast({ title: 'Could not save', description: error.message, tone: 'error' });
        } else {
          toast({ title: 'Could not save', description: 'Unexpected error.', tone: 'error' });
        }
        return null;
      } finally {
        setBusy(null);
      }
    },
    [mode, name, presence, router, serverId, toast, validation],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void save({ quiet: false });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [save]);

  const toggleActive = async () => {
    if (mode === 'create') return;
    setBusy('activate');
    try {
      // Save first so the published payload always matches what the editor shows.
      const saved = await save({ quiet: true });
      if (!saved) return;
      await apiFetch(`/api/v1/presences/${presence!.id}/activate`, {
        method: 'POST',
        body: { active: !isActive },
      });
      setIsActive(!isActive);
      toast({
        title: !isActive ? 'Presence activated' : 'Presence deactivated',
        description: !isActive
          ? 'The companion will publish it on its next sync.'
          : 'Your companion will clear the presence on its next sync.',
        tone: 'success',
      });
      router.refresh();
    } catch (error) {
      toast({
        title: 'Could not change activation',
        description: error instanceof Error ? error.message : undefined,
        tone: 'error',
      });
    } finally {
      setBusy(null);
    }
  };

  const duplicate = async () => {
    if (!presence) return;
    setBusy('duplicate');
    try {
      await save({ quiet: true });
      const created = await apiFetch<{ presence: PresenceShape }>(`/api/v1/presences/${presence.id}/duplicate`, {
        method: 'POST',
      });
      toast({ title: 'Presence duplicated', tone: 'success' });
      router.push(`/dashboard/presences/${created.presence.id}`);
    } catch (error) {
      toast({ title: 'Could not duplicate', description: error instanceof Error ? error.message : undefined, tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!presence) return;
    setBusy('delete');
    try {
      await apiFetch(`/api/v1/presences/${presence.id}`, { method: 'DELETE' });
      toast({ title: 'Presence deleted', tone: 'success' });
      setDeleteOpen(false);
      router.push('/dashboard/presences');
      router.refresh();
    } catch (error) {
      toast({ title: 'Could not delete', description: error instanceof Error ? error.message : undefined, tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const saveTemplate = async () => {
    if (!presence) return;
    setBusy('template');
    try {
      await apiFetch(`/api/v1/presences/${presence.id}/template`, {
        method: 'POST',
        body: { name: templateName.trim() || presence.name },
      });
      toast({ title: 'Template saved', description: 'Reuse it from the presences list.', tone: 'success' });
      setTemplateOpen(false);
      router.refresh();
    } catch (error) {
      toast({ title: 'Could not save template', description: error instanceof Error ? error.message : undefined, tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const publishPreset = async () => {
    if (!publish.communityId) return;
    setBusy('save');
    try {
      await apiFetch(`/api/v1/communities/${publish.communityId}/presets`, {
        method: 'POST',
        body: {
          name: publish.name.trim() || name.trim(),
          payload: preview,
          minRole: publish.minRole,
          publish: true,
        },
      });
      toast({
        title: 'Preset published',
        description: 'Members who can use it will see it in their presets list.',
        tone: 'success',
      });
      setPublishOpen(false);
      router.refresh();
    } catch (error) {
      toast({ title: 'Could not publish preset', description: error instanceof Error ? error.message : undefined, tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const applyTemplate = (template: TemplateShape) => {
    setDraft({ ...template.payload });
    if (!name.trim()) setName(`${template.name}`);
    toast({ title: `Loaded “${template.name}”`, tone: 'success' });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <ButtonLink href="/dashboard/presences" variant="ghost" size="sm">
              ← Presences
            </ButtonLink>
            {isActive ? <Badge tone="success" dot>Active</Badge> : null}
            {dirty ? <Badge tone="warning">Unsaved changes</Badge> : null}
          </div>
          <div className="mt-2 max-w-xl">
            <Field label="Presence name" htmlFor="presence-name" error={nameError} hint="Only visible to you — not shown in Discord.">
              <Input
                id="presence-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Late-night build"
                maxLength={80}
                invalid={Boolean(nameError)}
              />
            </Field>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {templates.length && mode === 'create' ? (
            <Select
              aria-label="Start from a template"
              className="w-[200px]"
              value=""
              onChange={(event) => {
                const template = templates.find((item) => item.id === event.target.value);
                if (template) applyTemplate(template);
              }}
            >
              <option value="">Start from template…</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </Select>
          ) : null}

          {mode === 'edit' ? (
            <Button
              variant={isActive ? 'secondary' : 'secondary'}
              loading={busy === 'activate'}
              icon={isActive ? <IconStop /> : <IconCheck />}
              onClick={toggleActive}
            >
              {isActive ? 'Deactivate' : 'Activate'}
            </Button>
          ) : null}

          <Button
            variant="primary"
            loading={busy === 'save'}
            icon={<IconSave className="h-4 w-4" />}
            onClick={() => void save()}
          >
            {mode === 'create' ? 'Create presence' : 'Save changes'}
          </Button>

          {mode === 'edit' ? (
            <Dropdown
              label="More actions"
              trigger={
                <span className="inline-flex h-10 w-9 items-center justify-center rounded-[10px] border border-line-strong bg-elevated text-ink-soft hover:text-ink">
                  <IconMore className="h-4 w-4" />
                </span>
              }
              items={[
                {
                  label: 'Duplicate',
                  icon: <IconCopy className="h-4 w-4" />,
                  onSelect: () => void duplicate(),
                },
                {
                  label: 'Save as template',
                  icon: <IconLayers className="h-4 w-4" />,
                  onSelect: () => {
                    setTemplateName(name);
                    setTemplateOpen(true);
                  },
                },
                {
                  label: 'Publish as community preset',
                  icon: <IconUsers className="h-4 w-4" />,
                  disabled: manageable.length === 0,
                  onSelect: () => {
                    setPublish((current) => ({
                      ...current,
                      communityId: manageable[0]?.id ?? '',
                      name: name,
                    }));
                    setPublishOpen(true);
                  },
                },
                {
                  label: 'Delete presence',
                  icon: <IconTrash className="h-4 w-4" />,
                  tone: 'danger',
                  onSelect: () => setDeleteOpen(true),
                },
              ]}
            />
          ) : null}
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_366px]">
        <div className="space-y-4">
          {serverFieldErrors && Object.keys(serverFieldErrors).length ? (
            <Callout tone="danger" icon={<IconAlert className="h-4 w-4" />} title="The server rejected some fields">
              {Object.values(serverFieldErrors).slice(0, 3).join(' · ')}
            </Callout>
          ) : null}

          <PresenceForm draft={draft} setDraft={setDraft} issues={issues} disabled={busy === 'save'} />

          <Card>
            <CardBody className="space-y-3">
              <Field
                label="Community"
                htmlFor="presence-community"
                hint="Optionally attach this presence to a community you belong to."
              >
                <Select
                  id="presence-community"
                  value={serverId ?? ''}
                  onChange={(event) => setServerId(event.target.value || null)}
                >
                  <option value="">Personal — no community</option>
                  {communities.map((community) => (
                    <option key={community.id} value={community.id}>
                      {community.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </CardBody>
          </Card>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-20 xl:self-start">
          <div className="flex items-center justify-between">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-ink-muted">Live preview</h2>
            <Tooltip label="This is a faithful reconstruction of Discord's activity card. The real client applies the same limits and may hide unsupported fields." />
          </div>

          <div className="flex justify-center rounded-2xl border border-line bg-[radial-gradient(80%_60%_at_50%_0%,#171326,#0a0810)] px-3 py-5">
            <DiscordPreview payload={preview} user={user} />
          </div>

          <Card>
            <CardBody className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-medium text-ink">Validation</p>
                {validation.ok ? (
                  <Badge tone="success" dot>
                    Ready to publish
                  </Badge>
                ) : (
                  <Badge tone="danger" dot>
                    {validation.errors.length} issue{validation.errors.length === 1 ? '' : 's'}
                  </Badge>
                )}
              </div>

              {validation.ok && validation.warnings.length === 0 ? (
                <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-ink-muted">
                  <IconCheck className="mt-0.5 h-3.5 w-3.5 text-success" />
                  All Discord limits respected.
                </p>
              ) : null}

              {issues.length ? (
                <ul className="space-y-1.5">
                  {issues.slice(0, 6).map((issue, index) => (
                    <li key={`${issue.path}-${index}`} className="flex items-start gap-2 text-[12px] leading-relaxed text-danger">
                      <IconAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>{issue.message}</span>
                    </li>
                  ))}
                </ul>
              ) : null}

              {validation.warnings.length ? (
                <ul className="space-y-1.5 border-t border-line pt-3">
                  {validation.warnings.slice(0, 5).map((warning, index) => (
                    <li key={`${warning.path}-${index}`} className="flex items-start gap-2 text-[12px] leading-relaxed text-warning">
                      <IconInfo className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>{warning.message}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </CardBody>
          </Card>

          {mode === 'edit' ? (
            <p className="text-[11.5px] leading-relaxed text-ink-muted">
              Summary: <span className="text-ink-soft">{summarizePresence(preview)}</span>
              <br />
              Last saved {new Date(presence!.updatedAt).toLocaleString()}
            </p>
          ) : (
            <p className="text-[11.5px] leading-relaxed text-ink-muted">
              Nothing is published until you activate the presence and your Windows companion is connected.
            </p>
          )}
        </aside>
      </div>

      <Dialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete this presence?"
        description="This cannot be undone. Your companion stops publishing it immediately."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" loading={busy === 'delete'} onClick={() => void remove()}>
              Delete presence
            </Button>
          </>
        }
      />

      <Dialog
        open={templateOpen}
        onClose={() => setTemplateOpen(false)}
        title="Save as template"
        description="Templates are private to your account and can be reused in the editor."
        footer={
          <>
            <Button variant="ghost" onClick={() => setTemplateOpen(false)}>
              Cancel
            </Button>
            <Button loading={busy === 'template'} onClick={() => void saveTemplate()}>
              Save template
            </Button>
          </>
        }
      >
        <Field label="Template name" htmlFor="template-name">
          <Input
            id="template-name"
            value={templateName}
            onChange={(event) => setTemplateName(event.target.value)}
            maxLength={80}
            placeholder="Streaming on Twitch"
          />
        </Field>
      </Dialog>

      <Dialog
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        title="Publish as community preset"
        description="Publishing shares the current configuration with your community. Updates are applied centrally."
        footer={
          <>
            <Button variant="ghost" onClick={() => setPublishOpen(false)}>
              Cancel
            </Button>
            <Button loading={busy === 'save'} onClick={() => void publishPreset()} disabled={!publish.communityId}>
              Publish preset
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Community" htmlFor="publish-community" required>
            <Select
              id="publish-community"
              value={publish.communityId}
              onChange={(event) => setPublish((current) => ({ ...current, communityId: event.target.value }))}
            >
              <option value="">Select a community…</option>
              {manageable.map((community) => (
                <option key={community.id} value={community.id}>
                  {community.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Preset name" htmlFor="publish-name" required>
            <Input
              id="publish-name"
              value={publish.name}
              maxLength={80}
              onChange={(event) => setPublish((current) => ({ ...current, name: event.target.value }))}
            />
          </Field>
          <Field label="Who can use it" htmlFor="publish-role" hint="Per-member overrides can be added afterwards.">
            <Select
              id="publish-role"
              value={publish.minRole}
              onChange={(event) => setPublish((current) => ({ ...current, minRole: event.target.value }))}
            >
              <option value="member">All members</option>
              <option value="preset_manager">Preset managers and above</option>
              <option value="admin">Administrators only</option>
              <option value="owner">Owner only</option>
            </Select>
          </Field>
          <Callout tone="brand" icon={<IconInfo className="h-4 w-4" />}>
            Presets use the current editor contents, even before you save this presence.
          </Callout>
        </div>
      </Dialog>
    </div>
  );
}

function IconStop() {
  return <span className={cn('h-3.5 w-3.5 rounded-[3px] border border-current')} />;
}

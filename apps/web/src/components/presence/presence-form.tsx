'use client';

import { useId } from 'react';
import {
  ACTIVITY_TYPES,
  DISCORD_LIMITS,
  type ActivityType,
  type PresenceDraft,
} from '@avenqio/shared';
import { Field, Input, Select, Switch } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, Tooltip } from '@/components/ui/display';
import { IconClock, IconInfo, IconLayers, IconPlus, IconTrash, IconX } from '@/components/icons';
import { fromLocalInputValue, toLocalInputValue } from '@/lib/cn';

export type FormIssue = { path: string; message: string };

const labelFor: Record<ActivityType, string> = {
  playing: 'Playing',
  listening: 'Listening to',
  watching: 'Watching',
  competing: 'Competing in',
};

function Counter({ value, max }: { value: string; max: number }) {
  const length = value.length;
  return (
    <span className={length > max ? 'text-[11px] font-medium text-danger' : 'text-[11px] text-ink-muted'}>
      {length}/{max}
    </span>
  );
}

export function PresenceForm({
  draft,
  setDraft,
  issues,
  disabled,
}: {
  draft: PresenceDraft;
  setDraft: (updater: (current: PresenceDraft) => PresenceDraft) => void;
  issues: FormIssue[];
  disabled?: boolean;
}) {
  const baseId = useId();
  const errorFor = (path: string) => issues.find((issue) => issue.path === path)?.message ?? null;
  const patch = (changes: Partial<PresenceDraft>) => setDraft((current) => ({ ...current, ...changes }));

  const timestamps = draft.timestamps ?? null;
  const timestampMode = timestamps?.start ? (timestamps.end ? 'range' : 'elapsed') : 'none';
  const hasParty = Boolean(draft.party && (draft.party.current || draft.party.max));
  const buttons = draft.buttons ?? [];

  const setTimestampMode = (mode: string) => {
    if (mode === 'none') patch({ timestamps: null });
    else if (mode === 'start') patch({ timestamps: { start: Date.now(), end: null } });
    else patch({ timestamps: { start: Date.now(), end: Date.now() + 60 * 60 * 1000 } });
  };

  const imageIssue = (path: 'largeImage' | 'smallImage') => errorFor(`${path}.source`) ?? errorFor(path);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Activity"
          description="The application name and text lines Discord shows under your name."
          icon={<IconLayers className="h-4 w-4" />}
        />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Application name"
            htmlFor={`${baseId}-app`}
            required
            error={errorFor('applicationName')}
            hint="The Discord application the presence belongs to."
            action={<Counter value={draft.applicationName ?? ''} max={DISCORD_LIMITS.applicationName} />}
            className="sm:col-span-2"
          >
            <Input
              id={`${baseId}-app`}
              value={draft.applicationName ?? ''}
              maxLength={DISCORD_LIMITS.applicationName + 20}
              disabled={disabled}
              onChange={(event) => patch({ applicationName: event.target.value })}
              placeholder="AvenqioPresence"
              invalid={Boolean(errorFor('applicationName'))}
            />
          </Field>

          <Field
            label="Activity type"
            htmlFor={`${baseId}-type`}
            hint="Changes the verb Discord displays: Playing, Listening to, Watching, Competing in."
          >
            <Select
              id={`${baseId}-type`}
              value={draft.activityType ?? 'playing'}
              disabled={disabled}
              onChange={(event) => patch({ activityType: event.target.value as ActivityType })}
            >
              {ACTIVITY_TYPES.map((type) => (
                <option key={type} value={type}>
                  {labelFor[type]}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Details"
            htmlFor={`${baseId}-details`}
            error={errorFor('details')}
            hint={'Usually “what you are doing” — the first line under the app name.'}
            action={<Counter value={draft.details ?? ''} max={DISCORD_LIMITS.details} />}
            className="sm:col-span-2"
          >
            <Input
              id={`${baseId}-details`}
              value={draft.details ?? ''}
              maxLength={DISCORD_LIMITS.details + 40}
              disabled={disabled}
              placeholder="Building AvenqioPresence"
              onChange={(event) => patch({ details: event.target.value })}
              invalid={Boolean(errorFor('details'))}
            />
          </Field>

          <Field
            label="State"
            htmlFor={`${baseId}-state`}
            error={errorFor('state')}
            hint="The second line — your status, role or current activity."
            action={<Counter value={draft.state ?? ''} max={DISCORD_LIMITS.state} />}
            className="sm:col-span-2"
          >
            <Input
              id={`${baseId}-state`}
              value={draft.state ?? ''}
              maxLength={DISCORD_LIMITS.state + 40}
              disabled={disabled}
              placeholder="Shipping the dashboard"
              onChange={(event) => patch({ state: event.target.value })}
              invalid={Boolean(errorFor('state'))}
            />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Artwork"
          description="Asset keys uploaded to your Discord application, or an https image URL."
          icon={<IconLayers className="h-4 w-4" />}
          action={
            <Tooltip label="Asset keys are configured under Rich Presence → Art Assets in the Discord developer portal. External https URLs also work in current clients." />
          }
        />
        <CardBody className="space-y-5">
          {(['largeImage', 'smallImage'] as const).map((key) => {
            const image = draft[key];
            const isLarge = key === 'largeImage';
            return (
              <div key={key} className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[13px] font-medium text-ink-soft">{isLarge ? 'Large image' : 'Small image'}</p>
                  {image?.source ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<IconX className="h-3.5 w-3.5" />}
                      onClick={() => patch({ [key]: null } as Partial<PresenceDraft>)}
                    >
                      Remove
                    </Button>
                  ) : null}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field
                    label={isLarge ? 'Large image source' : 'Small image source'}
                    htmlFor={`${baseId}-${key}-source`}
                    error={imageIssue(key)}
                    hint={isLarge ? 'Asset key, or https URL' : 'Shown as an overlay on the large image'}
                  >
                    <Input
                      id={`${baseId}-${key}-source`}
                      value={image?.source ?? ''}
                      disabled={disabled}
                      placeholder={isLarge ? 'vscode' : 'https://cdn.example.com/badge.png'}
                      onChange={(event) =>
                        patch({
                          [key]: { source: event.target.value, text: image?.text ?? null },
                        } as Partial<PresenceDraft>)
                      }
                      invalid={Boolean(imageIssue(key))}
                    />
                  </Field>
                  <Field
                    label="Tooltip text"
                    htmlFor={`${baseId}-${key}-text`}
                    error={errorFor(`${key}.text`)}
                    action={<Counter value={image?.text ?? ''} max={DISCORD_LIMITS.imageText} />}
                  >
                    <Input
                      id={`${baseId}-${key}-text`}
                      value={image?.text ?? ''}
                      maxLength={DISCORD_LIMITS.imageText + 20}
                      disabled={disabled}
                      placeholder={isLarge ? 'Visual Studio Code' : 'Paramedic'}
                      onChange={(event) =>
                        patch({
                          [key]: { source: image?.source ?? '', text: event.target.value },
                        } as Partial<PresenceDraft>)
                      }
                    />
                  </Field>
                </div>
              </div>
            );
          })}
          <p className="flex items-start gap-2 rounded-lg border border-line bg-bg-deep/60 px-3 py-2 text-[11.5px] leading-relaxed text-ink-muted">
            <IconInfo className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Asset keys must exist in the Discord application used by the companion; until they do, the
            preview shows a placeholder tile. External https URLs render directly in current clients.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Time & party"
          description="Elapsed time, a countdown/progress bar, and party size."
          icon={<IconClock className="h-4 w-4" />}
        />
        <CardBody className="space-y-4">
          <Field
            label="Timestamp"
            htmlFor={`${baseId}-tsmode`}
            error={errorFor('timestamps.start') ?? errorFor('timestamps.end')}
            hint="A start time shows elapsed time; adding an end time adds a progress bar."
          >
            <Select
              id={`${baseId}-tsmode`}
              value={timestampMode}
              disabled={disabled}
              onChange={(event) => setTimestampMode(event.target.value)}
            >
              <option value="none">No timestamp</option>
              <option value="elapsed">Elapsed since start</option>
              <option value="range">Start and end (progress bar)</option>
            </Select>
          </Field>

          {timestamps ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Starts at" htmlFor={`${baseId}-start`}>
                <div className="flex gap-2">
                  <Input
                    id={`${baseId}-start`}
                    type="datetime-local"
                    value={toLocalInputValue(timestamps.start ?? null)}
                    disabled={disabled}
                    onChange={(event) =>
                      patch({
                        timestamps: { ...timestamps, start: fromLocalInputValue(event.target.value) },
                      })
                    }
                  />
                  <Button
                    variant="secondary"
                    size="md"
                    onClick={() => patch({ timestamps: { ...timestamps, start: Date.now() } })}
                  >
                    Now
                  </Button>
                </div>
              </Field>
              {timestampMode === 'range' ? (
                <Field label="Ends at" htmlFor={`${baseId}-end`} error={errorFor('timestamps.end')}>
                  <Input
                    id={`${baseId}-end`}
                    type="datetime-local"
                    value={toLocalInputValue(timestamps.end ?? null)}
                    disabled={disabled}
                    onChange={(event) =>
                      patch({ timestamps: { ...timestamps, end: fromLocalInputValue(event.target.value) } })
                    }
                    invalid={Boolean(errorFor('timestamps.end'))}
                  />
                </Field>
              ) : null}
            </div>
          ) : null}

          <div className="rounded-xl border border-line bg-bg-deep/40 px-4 py-3">
            <Switch
              id={`${baseId}-party`}
              checked={hasParty}
              disabled={disabled}
              label="Show party size"
              description="Renders as “4 of 16” next to the activity name."
              onChange={(next) => patch({ party: next ? { current: 1, max: 16 } : null })}
            />
            {hasParty ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="Current size" htmlFor={`${baseId}-pc`} error={errorFor('party.current')}>
                  <Input
                    id={`${baseId}-pc`}
                    type="number"
                    min={1}
                    max={DISCORD_LIMITS.partyMax}
                    value={draft.party?.current ?? ''}
                    disabled={disabled}
                    onChange={(event) =>
                      patch({
                        party: { ...draft.party, current: event.target.value === '' ? null : Number(event.target.value) },
                      })
                    }
                  />
                </Field>
                <Field label="Maximum size" htmlFor={`${baseId}-pm`} error={errorFor('party.max')}>
                  <Input
                    id={`${baseId}-pm`}
                    type="number"
                    min={1}
                    max={DISCORD_LIMITS.partyMax}
                    value={draft.party?.max ?? ''}
                    disabled={disabled}
                    onChange={(event) =>
                      patch({
                        party: { ...draft.party, max: event.target.value === '' ? null : Number(event.target.value) },
                      })
                    }
                  />
                </Field>
              </div>
            ) : null}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Buttons"
          description="Discord allows up to two buttons, each with a label and an https URL."
          icon={<IconPlus className="h-4 w-4" />}
          action={
            <Button
              variant="secondary"
              size="sm"
              icon={<IconPlus className="h-3.5 w-3.5" />}
              disabled={disabled || buttons.length >= DISCORD_LIMITS.maxButtons}
              onClick={() =>
                patch({ buttons: [...buttons, { label: '', url: '' }].slice(0, DISCORD_LIMITS.maxButtons) })
              }
            >
              Add button
            </Button>
          }
        />
        <CardBody className="space-y-3">
          {buttons.length === 0 ? (
            <p className="text-[13px] text-ink-muted">No buttons. Add up to two links for your community or stream.</p>
          ) : null}
          {buttons.map((button, index) => (
            <div key={index} className="grid gap-3 rounded-xl border border-line bg-bg-deep/40 p-3 sm:grid-cols-[1fr_1.6fr_auto]">
              <Field label="Label" htmlFor={`${baseId}-b${index}-label`} error={errorFor(`buttons.${index}.label`)}>
                <Input
                  id={`${baseId}-b${index}-label`}
                  value={button.label ?? ''}
                  maxLength={DISCORD_LIMITS.buttonLabel + 10}
                  disabled={disabled}
                  placeholder="Join server"
                  onChange={(event) =>
                    patch({
                      buttons: buttons.map((item, position) =>
                        position === index ? { ...item, label: event.target.value } : item,
                      ),
                    })
                  }
                  invalid={Boolean(errorFor(`buttons.${index}.label`))}
                />
              </Field>
              <Field label="URL" htmlFor={`${baseId}-b${index}-url`} error={errorFor(`buttons.${index}.url`)}>
                <Input
                  id={`${baseId}-b${index}-url`}
                  value={button.url ?? ''}
                  disabled={disabled}
                  placeholder="https://discord.gg/your-invite"
                  onChange={(event) =>
                    patch({
                      buttons: buttons.map((item, position) =>
                        position === index ? { ...item, url: event.target.value } : item,
                      ),
                    })
                  }
                  invalid={Boolean(errorFor(`buttons.${index}.url`))}
                />
              </Field>
              <div className="flex items-end">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove button ${index + 1}`}
                  disabled={disabled}
                  onClick={() => patch({ buttons: buttons.filter((_, position) => position !== index) })}
                >
                  <IconTrash className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}

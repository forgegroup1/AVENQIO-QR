'use client';

import { useEffect, useState } from 'react';
import { roleAtLeast, SERVER_ROLE_LABELS, type ServerRole } from '@avenqio/shared';
import { apiFetch } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/display';
import { Field, Select } from '@/components/ui/form';
import { Dialog, useToast } from '@/components/ui/overlay';
import { Avatar } from '@/components/ui/display';
import { IconInfo } from '@/components/icons';

type Member = { userId: string; displayName: string; avatarUrl: string | null; role: ServerRole };
type Override = 'default' | 'allow' | 'revoke';

export function PresetAccessDialog({
  open,
  onClose,
  communityId,
  preset,
  members,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  communityId: string;
  preset: { id: string; name: string; minRole: ServerRole } | null;
  members: Member[];
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [minRole, setMinRole] = useState<ServerRole>('member');
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !preset) return;
    setMinRole(preset.minRole);
    setOverrides({});
    apiFetch<{ grants: Array<{ userId: string; canUse: boolean }> }>(
      `/api/v1/communities/${communityId}/presets/${preset.id}/access`,
    )
      .then((data) => {
        const map: Record<string, Override> = {};
        for (const grant of data.grants) map[grant.userId] = grant.canUse ? 'allow' : 'revoke';
        setOverrides(map);
      })
      .catch(() => setOverrides({}));
  }, [open, preset, communityId]);

  const save = async () => {
    if (!preset) return;
    setBusy(true);
    try {
      await apiFetch(`/api/v1/communities/${communityId}/presets/${preset.id}/access`, {
        method: 'PUT',
        body: {
          minRole,
          grants: members.map((member) => ({
            userId: member.userId,
            canUse: overrides[member.userId] === 'allow' ? true : overrides[member.userId] === 'revoke' ? false : null,
          })),
        },
      });
      toast({ title: 'Access rules updated', tone: 'success' });
      onSaved();
      onClose();
    } catch (error) {
      toast({ title: 'Could not update access', description: error instanceof Error ? error.message : undefined, tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Access — ${preset?.name ?? ''}`}
      description="Roles decide the default; individual members can be granted or revoked explicitly."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} onClick={() => void save()}>
            Save access
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Minimum role" htmlFor="access-role" hint="Members at or above this role can use the preset.">
          <Select id="access-role" value={minRole} onChange={(event) => setMinRole(event.target.value as ServerRole)}>
            <option value="member">All members</option>
            <option value="preset_manager">Preset managers and above</option>
            <option value="admin">Administrators only</option>
            <option value="owner">Owner only</option>
          </Select>
        </Field>

        <Callout tone="brand" icon={<IconInfo className="h-4 w-4" />}>
          A revoke always wins, even for members above the minimum role.
        </Callout>

        <div className="divide-y divide-line rounded-xl border border-line">
          {members.length === 0 ? (
            <p className="px-3 py-3 text-[12.5px] text-ink-muted">No linked members yet.</p>
          ) : (
            members.map((member) => {
              const override = overrides[member.userId] ?? 'default';
              const baseline = roleAtLeast(member.role, minRole);
              return (
                <div key={member.userId} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                  <Avatar src={member.avatarUrl} name={member.displayName} size={26} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] text-ink">{member.displayName}</p>
                    <p className="text-[10.5px] text-ink-muted">
                      {SERVER_ROLE_LABELS[member.role]} · default {baseline ? 'allowed' : 'not allowed'}
                    </p>
                  </div>
                  <select
                    aria-label={`Access for ${member.displayName}`}
                    value={override}
                    onChange={(event) =>
                      setOverrides((current) => ({ ...current, [member.userId]: event.target.value as Override }))
                    }
                    className="h-8 rounded-md border border-line-strong bg-[#0b0910] px-2 text-[12px] text-ink"
                  >
                    <option value="default">Follow role</option>
                    <option value="allow">Allow</option>
                    <option value="revoke">Revoke</option>
                  </select>
                </div>
              );
            })
          )}
        </div>
      </div>
    </Dialog>
  );
}

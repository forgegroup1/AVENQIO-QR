'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { relativeTime } from '@avenqio/shared';
import { apiFetch } from '@/lib/api-client';
import { Avatar, Badge, Card, CardHeader, EmptyState } from '@/components/ui/display';
import { Button } from '@/components/ui/button';
import { Field, Textarea } from '@/components/ui/form';
import { Dialog, useToast } from '@/components/ui/overlay';
import { IconCheck, IconShield, IconX } from '@/components/icons';

type QueueItem = {
  id: string;
  name: string;
  discordGuildId: string;
  iconUrl: string | null;
  status: 'unverified' | 'pending' | 'verified' | 'rejected';
  requestedBy: string | null;
  memberCount: number | null;
  updatedAt: string;
};

export function AdminQueue({ queue }: { queue: QueueItem[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [target, setTarget] = useState<{ item: QueueItem; decision: 'verified' | 'rejected' } | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const decide = async () => {
    if (!target) return;
    setBusy(true);
    try {
      await apiFetch(`/api/v1/admin/verifications/${target.item.id}`, {
        method: 'POST',
        body: { decision: target.decision, note: note.trim() || null },
      });
      toast({
        title: target.decision === 'verified' ? 'Community verified' : 'Verification rejected',
        tone: 'success',
      });
      setTarget(null);
      setNote('');
      router.refresh();
    } catch (error) {
      toast({ title: 'Could not save decision', description: error instanceof Error ? error.message : undefined, tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader
          title="Verification queue"
          description="Requests from community administrators."
          icon={<IconShield className="h-4 w-4" />}
          action={<Badge tone="neutral">{queue.length} open</Badge>}
        />
        {queue.length === 0 ? (
          <EmptyState title="Queue is empty" description="No pending or rejected verification requests." />
        ) : (
          <ul className="divide-y divide-line">
            {queue.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                <Avatar src={item.iconUrl} name={item.name} size={36} ring />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-[13px] font-medium text-ink">
                    {item.name}
                    <Badge tone={item.status === 'pending' ? 'warning' : 'outline'}>{item.status}</Badge>
                  </p>
                  <p className="text-[10.5px] text-ink-muted">
                    guild {item.discordGuildId}
                    {item.memberCount !== null ? ` · ${item.memberCount} members` : ''}
                    {item.requestedBy ? ` · requested by ${item.requestedBy}` : ''} · {relativeTime(item.updatedAt)}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<IconCheck className="h-3.5 w-3.5" />}
                    onClick={() => { setNote(''); setTarget({ item, decision: 'verified' }); }}
                  >
                    Verify
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<IconX className="h-3.5 w-3.5" />}
                    onClick={() => { setNote(''); setTarget({ item, decision: 'rejected' }); }}
                  >
                    Reject
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Dialog
        open={target !== null}
        onClose={() => setTarget(null)}
        title={target?.decision === 'verified' ? `Verify ${target?.item.name}?` : `Reject ${target?.item.name}?`}
        description="The decision and note are written to the audit log and shown to the community administrators."
        footer={
          <>
            <Button variant="ghost" onClick={() => setTarget(null)}>
              Cancel
            </Button>
            <Button
              variant={target?.decision === 'verified' ? 'primary' : 'danger'}
              loading={busy}
              onClick={() => void decide()}
            >
              {target?.decision === 'verified' ? 'Verify community' : 'Reject request'}
            </Button>
          </>
        }
      >
        <Field label="Note (optional)" htmlFor="decision-note" hint="Visible to the community's administrators.">
          <Textarea
            id="decision-note"
            value={note}
            maxLength={300}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Reviewed preset catalogue and manager list."
          />
        </Field>
      </Dialog>
    </>
  );
}

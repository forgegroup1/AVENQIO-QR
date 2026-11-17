'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/display';
import { IconAlert } from '@/components/icons';

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[dashboard] render error', error);
  }, [error]);

  return (
    <Card className="mx-auto max-w-lg">
      <CardHeader
        title="This page could not be rendered"
        description="The error was logged server-side. Retrying re-runs the request without losing your session."
        icon={<IconAlert className="h-4 w-4" />}
      />
      <CardBody className="space-y-3">
        {error.digest ? <p className="font-mono text-[11px] text-ink-muted">digest {error.digest}</p> : null}
        <div className="flex gap-2">
          <Button onClick={reset}>Try again</Button>
          <Button variant="secondary" onClick={() => window.location.assign('/dashboard')}>
            Back to overview
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

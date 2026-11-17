import { Skeleton } from '@/components/ui/display';

export default function IntegrationsLoading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading integrations">
      <div className="space-y-2">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-[132px] rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

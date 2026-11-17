'use client';

import { useId, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type TabItem = { id: string; label: string; badge?: ReactNode; content: ReactNode };

export function Tabs({ items, initial, className }: { items: TabItem[]; initial?: string; className?: string }) {
  const [active, setActive] = useState(initial ?? items[0]?.id ?? '');
  const baseId = useId();
  const current = items.find((item) => item.id === active) ?? items[0];

  return (
    <div className={className}>
      <div
        role="tablist"
        aria-label="Sections"
        className="flex flex-wrap gap-1 rounded-xl border border-line bg-surface p-1"
      >
        {items.map((item) => {
          const selected = item.id === current?.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`${baseId}-tab-${item.id}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${item.id}`}
              onClick={() => setActive(item.id)}
              className={cn(
                'inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors',
                selected
                  ? 'bg-elevated text-ink shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]'
                  : 'text-ink-muted hover:text-ink-soft',
              )}
            >
              {item.label}
              {item.badge}
            </button>
          );
        })}
      </div>
      {current ? (
        <div
          role="tabpanel"
          id={`${baseId}-panel-${current.id}`}
          aria-labelledby={`${baseId}-tab-${current.id}`}
          className="animate-fade mt-4"
        >
          {current.content}
        </div>
      ) : null}
    </div>
  );
}

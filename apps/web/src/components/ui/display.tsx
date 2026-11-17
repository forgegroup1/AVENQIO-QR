import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { IconInfo } from '@/components/icons';

export function Card({
  children,
  className,
  interactive,
  id,
}: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
  id?: string;
}) {
  return (
    <div id={id} className={cn('card', interactive && 'card-interactive', className)}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4', className)}>
      <div className="flex items-start gap-3">
        {icon ? (
          <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg border border-line-strong bg-elevated text-brand-soft">
            {icon}
          </span>
        ) : null}
        <div className="space-y-1">
          <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
          {description ? <div className="text-[13px] leading-relaxed text-ink-muted">{description}</div> : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('px-5 py-4', className)}>{children}</div>;
}

export function CardFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3.5', className)}>
      {children}
    </div>
  );
}

export type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'outline';

const badgeTones: Record<BadgeTone, string> = {
  neutral: 'border-line-strong bg-elevated text-ink-soft',
  brand: 'border-brand/30 bg-brand/12 text-brand-soft',
  success: 'border-success/25 bg-success/10 text-success',
  warning: 'border-warning/25 bg-warning/10 text-warning',
  danger: 'border-danger/25 bg-danger/10 text-danger',
  info: 'border-info/25 bg-info/10 text-info',
  outline: 'border-line-strong bg-transparent text-ink-muted',
};

export function Badge({
  children,
  tone = 'neutral',
  className,
  dot,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium tracking-wide',
        badgeTones[tone],
        className,
      )}
    >
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}

export function Avatar({
  src,
  name,
  size = 32,
  className,
  ring,
}: {
  src?: string | null;
  name: string;
  size?: number;
  className?: string;
  ring?: boolean;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-elevated text-ink-soft',
        ring && 'ring-1 ring-line-strong',
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.4) }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        <span className="font-semibold">{initials || '?'}</span>
      )}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      {icon ? (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-line-strong bg-elevated text-ink-muted">
          {icon}
        </div>
      ) : null}
      <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
      {description ? <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-ink-muted">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded-md', className)} aria-hidden="true" />;
}

export function Tooltip({ label, children }: { label: string; children?: ReactNode }) {
  return (
    <span className="group relative inline-flex items-center">
      {children ?? <IconInfo className="h-3.5 w-3.5 text-ink-muted" />}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-40 mb-2 w-56 -translate-x-1/2 rounded-lg border border-line-strong bg-[#161320] px-3 py-2 text-[11.5px] font-normal leading-relaxed text-ink-soft opacity-0 shadow-pop transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {label}
      </span>
    </span>
  );
}

export function Callout({
  tone = 'neutral',
  title,
  children,
  icon,
  action,
}: {
  tone?: 'neutral' | 'brand' | 'warning' | 'danger' | 'success';
  title?: string;
  children: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  const tones = {
    neutral: 'border-line-strong bg-elevated/60 text-ink-soft',
    brand: 'border-brand/25 bg-brand/8 text-brand-soft',
    warning: 'border-warning/25 bg-warning/8 text-warning',
    danger: 'border-danger/25 bg-danger/8 text-danger',
    success: 'border-success/25 bg-success/8 text-success',
  } as const;
  return (
    <div className={cn('flex items-start gap-3 rounded-xl border px-4 py-3 text-[13px]', tones[tone])}>
      {icon ? <span className="mt-0.5">{icon}</span> : null}
      <div className="flex-1 space-y-1 leading-relaxed">
        {title ? <p className="font-medium">{title}</p> : null}
        <div className="text-ink-soft">{children}</div>
      </div>
      {action}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  icon,
  tone = 'neutral',
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: 'neutral' | 'brand' | 'success' | 'warning';
}) {
  const tones = {
    neutral: 'text-ink-muted',
    brand: 'text-brand-soft',
    success: 'text-success',
    warning: 'text-warning',
  } as const;
  return (
    <div className="card px-4 py-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.13em] text-ink-muted">{label}</p>
        <span className={tones[tone]}>{icon}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-ink">{value}</p>
      {hint ? <p className="mt-1 truncate text-xs text-ink-muted">{hint}</p> : null}
    </div>
  );
}

export function SectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-ink">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-ink-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Divider({ className }: { className?: string }) {
  return <div className={cn('h-px w-full bg-line', className)} />;
}

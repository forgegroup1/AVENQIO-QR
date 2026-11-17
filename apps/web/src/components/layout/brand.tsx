import Link from 'next/link';
import { cn } from '@/lib/cn';

export function BrandMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <span
      className={cn(
        'relative inline-flex items-center justify-center overflow-hidden rounded-[9px] border border-white/10 bg-bg-deep',
        className,
      )}
      style={{ width: size, height: size }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/avenqio-logo.png"
        alt=""
        className="h-full w-full object-contain p-[3px]"
        width={size}
        height={size}
      />
    </span>
  );
}

export function BrandLockup({
  href = '/',
  collapsed = false,
  subtitle = 'Presence',
  className,
}: {
  href?: string;
  collapsed?: boolean;
  subtitle?: string;
  className?: string;
}) {
  return (
    <Link href={href} className={cn('group flex items-center gap-2.5', className)}>
      <BrandMark size={30} />
      {!collapsed ? (
        <span className="min-w-0 leading-tight">
          <span className="block text-[13.5px] font-semibold tracking-[0.02em] text-ink">
            Avenqio<span className="text-brand-soft">{subtitle}</span>
          </span>
          <span className="block text-[10px] uppercase tracking-[0.18em] text-ink-muted">by Avenqio</span>
        </span>
      ) : null}
    </Link>
  );
}

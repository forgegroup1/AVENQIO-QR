import Link from 'next/link';
import { ButtonLink } from '@/components/ui/button';
import { BrandMasked } from '@/components/marketing/brand-masked';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-5 text-center">
      <BrandMasked size={40} />
      <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.2em] text-ink-muted">404</p>
      <h1 className="mt-2 text-[26px] font-semibold tracking-tight text-ink">This page does not exist</h1>
      <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-ink-muted">
        The resource may have been deleted, or it belongs to another account. AvenqioPresence returns the same
        response in both cases on purpose.
      </p>
      <div className="mt-6 flex gap-2">
        <ButtonLink href="/dashboard">Go to dashboard</ButtonLink>
        <ButtonLink href="/docs" variant="secondary">
          Documentation
        </ButtonLink>
      </div>
      <Link href="/" className="mt-6 text-[12px] text-ink-muted hover:text-ink-soft">
        Back to homepage
      </Link>
    </div>
  );
}

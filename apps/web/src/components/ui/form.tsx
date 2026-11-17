import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { cn } from '@/lib/cn';
import { IconAlert } from '@/components/icons';

const control =
  'w-full rounded-[10px] border border-line-strong bg-[#0b0910] px-3 text-sm text-ink ' +
  'placeholder:text-ink-muted/70 transition-colors ' +
  'hover:border-[#3a3350] focus:border-brand/60 focus:outline-none focus:ring-2 focus:ring-brand/20 ' +
  'disabled:cursor-not-allowed disabled:opacity-60';

export function Input({ className, invalid, ...props }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      className={cn(control, 'h-10', invalid && 'border-danger/60 focus:border-danger/70 focus:ring-danger/20', className)}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
}

export function Textarea({
  className,
  invalid,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return (
    <textarea
      className={cn(control, 'min-h-[84px] py-2.5 leading-relaxed', invalid && 'border-danger/60', className)}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
}

export function Select({
  className,
  invalid,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return (
    <div className="relative">
      <select
        className={cn(
          control,
          'h-10 appearance-none pr-9',
          invalid && 'border-danger/60',
          className,
        )}
        aria-invalid={invalid || undefined}
        {...props}
      >
        {children}
      </select>
      <svg
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinecap="round"
        aria-hidden="true"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
  required,
  action,
  className,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  htmlFor?: string;
  children: ReactNode;
  required?: boolean;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={htmlFor} className="text-[13px] font-medium text-ink-soft">
          {label}
          {required ? <span className="ml-1 text-brand-soft">*</span> : null}
        </label>
        {action}
      </div>
      {children}
      {error ? (
        <p className="flex items-start gap-1.5 text-xs text-danger">
          <IconAlert className="mt-px h-3.5 w-3.5" />
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs leading-relaxed text-ink-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
  id,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-0.5">
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {label}
        </label>
        {description ? <p className="text-xs leading-relaxed text-ink-muted">{description}</p> : null}
      </div>
      <button
        type="button"
        id={id}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 h-5 w-9 shrink-0 rounded-full border transition-colors',
          checked ? 'border-brand/60 bg-brand' : 'border-line-strong bg-[#191622]',
          disabled && 'opacity-50',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white shadow transition-all',
            checked ? 'left-[18px]' : 'left-0.5',
          )}
        />
      </button>
    </div>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
  id,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  id?: string;
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center gap-2 text-sm text-ink-soft">
      <span
        className={cn(
          'flex h-4 w-4 items-center justify-center rounded border transition-colors',
          checked ? 'border-brand bg-brand text-white' : 'border-line-strong bg-transparent',
        )}
      >
        {checked ? (
          <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={3}>
            <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : null}
      </span>
      <input
        id={id}
        type="checkbox"
        className="sr-only"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

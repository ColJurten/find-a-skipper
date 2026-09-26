import React from 'react';
import { Loader2 } from 'lucide-react';

const inputClass =
  'w-full rounded-[10px] border border-gray-200 bg-white px-3.5 py-2.5 text-[15px] outline-none focus:border-navy focus:ring-2 focus:ring-navy/15 disabled:bg-gray-50 disabled:text-gray-400';

export function Field({
  label,
  hint,
  children,
  optionalLabel,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  optionalLabel?: string;
}) {
  return (
    <div className="mb-4">
      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
          {label}
          {optionalLabel && <span className="ms-1 font-normal normal-case tracking-normal text-gray-400">({optionalLabel})</span>}
        </span>
        {children}
      </label>
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

/** Same look as Field, for groups of buttons/checkboxes (a <label> must not wrap several controls). */
export function FieldGroup({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <fieldset className="mb-4 block min-w-0">
      <legend className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</legend>
      {children}
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </fieldset>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputClass} ${props.className ?? ''}`} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${inputClass} min-h-[96px] ${props.className ?? ''}`} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputClass} ${props.className ?? ''}`} />;
}

type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'mission' | 'danger';

export const buttonStyles: Record<ButtonVariant, string> = {
  primary: 'bg-marine text-white hover:bg-navyDeep',
  outline: 'bg-white text-marine border border-marine/80 hover:bg-lightblue',
  ghost: 'bg-transparent text-gray-600 hover:bg-gray-100',
  // Light green: reserved for "Publier une mission" / "Postuler pour cette mission".
  mission: 'bg-mission text-mission-ink shadow-[0_8px_20px_rgba(46,160,90,0.22)] hover:bg-mission-hover',
  danger: 'bg-red-600 text-white hover:bg-red-700',
};

const buttonSizes = {
  sm: 'min-h-[40px] px-3.5 py-2 text-sm',
  md: 'min-h-[48px] px-5 py-3 text-[15px]',
  lg: 'min-h-[52px] px-6 py-3.5 text-[15px]',
} as const;

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  loading = false,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: keyof typeof buttonSizes; loading?: boolean }) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${buttonSizes[size]} ${buttonStyles[variant]} ${className}`}
    >
      {loading && <Loader2 className="animate-spin" size={16} />}
      {children}
    </button>
  );
}

export function Badge({ children, tone = 'default' }: { children: React.ReactNode; tone?: 'default' | 'success' | 'warning' | 'muted' | 'danger' }) {
  const tones = {
    default: 'bg-lightblue text-navyDeep',
    success: 'bg-emerald-50 text-emerald-700',
    warning: 'bg-amber-50 text-amber-700',
    muted: 'bg-gray-100 text-gray-600',
    danger: 'bg-red-50 text-red-700',
  } as const;
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}

/** Unread counter badge (WhatsApp style); renders nothing when the count is zero. */
export function CountBadge({ count, label }: { count: number; label?: string }) {
  if (!count) return null;
  return (
    <span
      aria-label={label}
      className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-mission px-1.5 text-[11px] font-bold leading-none text-mission-ink"
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div role="alert" className="mb-5 flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
      <span>{message}</span>
    </div>
  );
}

export function SuccessBanner({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div role="status" className="mb-5 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">
      {message}
    </div>
  );
}

export function LoadingState({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-gray-500">
      <Loader2 className="animate-spin" size={20} /> {label}
    </div>
  );
}

export function EmptyState({
  text,
  actionLabel,
  actionHref,
}: {
  text: string;
  actionLabel?: string;
  actionHref?: string;
}) {
  return (
    <div className="rounded-2xl border border-navy/[0.08] bg-white px-6 py-16 text-center">
      <p className="mb-4 text-sm text-gray-500">{text}</p>
      {actionLabel && actionHref && (
        <a href={actionHref} className="inline-block rounded-lg bg-marine px-4 py-2.5 text-sm font-semibold text-white">
          {actionLabel}
        </a>
      )}
    </div>
  );
}

export function initials(name: string) {
  return (name || '?')
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function Avatar({ name, url, size = 48, className = '' }: { name: string; url?: string | null; size?: number; className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-marine font-bold text-white ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(11, Math.round(size / 3)) }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={name} className="h-full w-full object-cover" />
      ) : (
        initials(name)
      )}
    </span>
  );
}

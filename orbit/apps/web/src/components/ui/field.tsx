import { cn } from '@/lib/utils';

/** Label-above-field wrapper with error text below (spec §14.5). */
export function Field({
  label,
  error,
  required,
  className,
  children,
}: {
  label: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-card-label text-text-primary">
        {label}
        {required && <span className="ml-0.5 text-status-rejected">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-meta text-status-rejected">{error}</p>}
    </div>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div className={cn('rounded-md bg-red-50 px-3 py-2 text-meta text-status-rejected')}>
      {message}
    </div>
  );
}

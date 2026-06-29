import { Inbox, Loader2 } from 'lucide-react';

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={`h-5 w-5 animate-spin ${className ?? ''}`} />;
}

export function LoadingBlock({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-meta text-text-secondary">
      <Spinner /> {label}
    </div>
  );
}

/** Centred empty state: icon + message + optional CTA (spec §14.5). */
export function EmptyState({
  title,
  message,
  action,
}: {
  title: string;
  message?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-bg text-text-secondary">
        <Inbox className="h-6 w-6" />
      </div>
      <p className="text-card-label text-text-primary">{title}</p>
      {message && <p className="max-w-sm text-meta text-text-secondary">{message}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 px-4 py-3.5">
          {Array.from({ length: cols }).map((_, c) => (
            <div
              key={c}
              className="h-4 flex-1 animate-pulse rounded bg-bg"
              style={{ maxWidth: c === 0 ? '20%' : undefined }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

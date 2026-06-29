import { cn } from '@/lib/utils';

export function SummaryCard({
  label,
  value,
  accent,
  hint,
}: {
  label: string;
  value: string | number;
  accent?: 'submitted' | 'review' | 'approved' | 'rejected' | 'primary';
  hint?: string;
}) {
  const accentColor = {
    submitted: 'text-status-submitted',
    review: 'text-status-review',
    approved: 'text-status-approved',
    rejected: 'text-status-rejected',
    primary: 'text-primary',
  }[accent ?? 'primary'];

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-meta text-text-secondary">{label}</p>
      <p className={cn('mt-1 text-2xl font-semibold', accent ? accentColor : 'text-text-primary')}>
        {value}
      </p>
      {hint && <p className="mt-0.5 text-meta text-text-secondary">{hint}</p>}
    </div>
  );
}

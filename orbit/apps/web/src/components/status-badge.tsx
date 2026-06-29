import { SubmissionStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

const STATUS_META: Record<
  SubmissionStatus,
  { label: string; dot: string; text: string; bg: string }
> = {
  SUBMITTED: {
    label: 'Submitted',
    dot: 'bg-status-submitted',
    text: 'text-status-submitted',
    bg: 'bg-blue-50',
  },
  UNDER_REVIEW: {
    label: 'Under Review',
    dot: 'bg-status-review',
    text: 'text-status-review',
    bg: 'bg-amber-50',
  },
  APPROVED: {
    label: 'Approved',
    dot: 'bg-status-approved',
    text: 'text-status-approved',
    bg: 'bg-emerald-50',
  },
  REJECTED: {
    label: 'Rejected',
    dot: 'bg-status-rejected',
    text: 'text-status-rejected',
    bg: 'bg-red-50',
  },
};

export function StatusBadge({ status }: { status: SubmissionStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-meta font-medium',
        meta.bg,
        meta.text,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} />
      {meta.label}
    </span>
  );
}

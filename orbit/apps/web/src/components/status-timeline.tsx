import {
  Check,
  Clock,
  FileUp,
  RefreshCw,
  X,
  type LucideIcon,
} from 'lucide-react';
import { HistoryEvent, SubmissionStatus } from '@/lib/types';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

const META: Record<
  SubmissionStatus,
  { icon: LucideIcon; ring: string; dot: string; text: string }
> = {
  SUBMITTED: {
    icon: FileUp,
    ring: 'border-status-submitted/30 bg-blue-50',
    dot: 'text-status-submitted',
    text: 'text-status-submitted',
  },
  UNDER_REVIEW: {
    icon: Clock,
    ring: 'border-status-review/30 bg-amber-50',
    dot: 'text-status-review',
    text: 'text-status-review',
  },
  APPROVED: {
    icon: Check,
    ring: 'border-status-approved/30 bg-emerald-50',
    dot: 'text-status-approved',
    text: 'text-status-approved',
  },
  REJECTED: {
    icon: X,
    ring: 'border-status-rejected/30 bg-red-50',
    dot: 'text-status-rejected',
    text: 'text-status-rejected',
  },
};

function label(e: HistoryEvent): string {
  if (e.toStatus === 'SUBMITTED') {
    return e.version > 1 ? `Resubmitted` : `Submitted`;
  }
  return {
    UNDER_REVIEW: 'Under Review',
    APPROVED: 'Approved',
    REJECTED: 'Rejected',
    SUBMITTED: 'Submitted',
  }[e.toStatus];
}

/**
 * Vertical transaction-style status chain (spec §10.3) — connected nodes with
 * status icons, actor, timestamp, and inline rejection reason. Most recent at
 * the bottom; the latest event is emphasised.
 */
export function StatusTimeline({ events }: { events: HistoryEvent[] }) {
  if (events.length === 0) {
    return <p className="text-meta text-text-secondary">No history yet.</p>;
  }

  return (
    <ol className="relative">
      {events.map((e, i) => {
        const m = META[e.toStatus];
        const Icon = e.version > 1 && e.toStatus === 'SUBMITTED' ? RefreshCw : m.icon;
        const isLast = i === events.length - 1;
        return (
          <li key={e.id} className="relative flex gap-3 pb-5 last:pb-0">
            {/* Connector line */}
            {!isLast && (
              <span className="absolute left-[15px] top-8 h-[calc(100%-1rem)] w-px bg-border" />
            )}
            {/* Node */}
            <span
              className={cn(
                'relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border',
                m.ring,
              )}
            >
              <Icon className={cn('h-4 w-4', m.dot)} />
            </span>
            {/* Body */}
            <div className={cn('min-w-0 flex-1 pt-0.5', isLast && 'font-medium')}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                <span className="text-card-label text-text-primary">{label(e)}</span>
                <span className="text-meta text-text-secondary">
                  {formatDateTime(e.createdAt)}
                </span>
              </div>
              <p className="text-meta text-text-secondary">{e.changedBy.fullName}</p>
              {e.reason && (
                <p className="mt-1.5 rounded-md border border-red-100 bg-red-50 px-2.5 py-1.5 text-meta text-status-rejected">
                  {e.reason}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

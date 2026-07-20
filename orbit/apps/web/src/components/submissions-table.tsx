'use client';

import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react';
import { Submission } from '@/lib/types';
import { formatDate, formatPkr, paymentTypeLabel, shortRef } from '@/lib/format';
import { StatusBadge } from '@/components/status-badge';
import { SourceBadge } from '@/components/source-badge';
import { cn } from '@/lib/utils';

export type SortDir = 'asc' | 'desc';
export interface SortState {
  by: string;
  dir: SortDir;
}

/** Header cell — sortable when `col` is provided. */
function Th({
  label,
  col,
  align = 'left',
  sort,
  onSort,
}: {
  label: string;
  col?: string;
  align?: 'left' | 'right';
  sort?: SortState;
  onSort?: (col: string) => void;
}) {
  const sortable = !!col && !!onSort;
  const active = sortable && sort?.by === col;
  return (
    <th className={cn('px-4 py-2.5 font-medium', align === 'right' ? 'text-right' : 'text-left')}>
      {sortable ? (
        <button
          type="button"
          onClick={() => onSort!(col!)}
          className={cn(
            'inline-flex items-center gap-1 uppercase transition-colors hover:text-text-primary',
            align === 'right' && 'flex-row-reverse',
            active && 'text-text-primary',
          )}
          title={`Sort by ${label}`}
        >
          {label}
          {active ? (
            sort!.dir === 'asc' ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )
          ) : (
            <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />
          )}
        </button>
      ) : (
        label
      )}
    </th>
  );
}

export function SubmissionsTable({
  rows,
  basePath,
  showRo = false,
  sort,
  onSort,
}: {
  rows: Submission[];
  basePath: string; // e.g. /ro/submissions or /admin/submissions
  showRo?: boolean;
  sort?: SortState;
  onSort?: (col: string) => void;
}) {
  const router = useRouter();
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[680px] text-body">
        <thead className="border-b border-border bg-bg text-meta uppercase text-text-secondary">
          <tr>
            <Th label="Ref" />
            {showRo && <Th label="RO" />}
            <Th label="Type" />
            <Th label="Amount" col="amount" align="right" sort={sort} onSort={onSort} />
            <Th label="Payment date" col="paymentDate" sort={sort} onSort={onSort} />
            <Th label="Submitted by" />
            <Th label="Status" col="status" sort={sort} onSort={onSort} />
            <Th label="Submitted" col="createdAt" sort={sort} onSort={onSort} />
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr
              key={s.id}
              onClick={() => router.push(`${basePath}/${s.id}`)}
              className="cursor-pointer border-b border-border last:border-0 hover:bg-primary-light"
            >
              <td className="px-4 py-3 font-medium text-text-primary">
                <div className="flex items-center gap-2">
                  {shortRef(s.id)}
                  {s.source !== 'APP' && <SourceBadge source={s.source} />}
                </div>
              </td>
              {showRo && <td className="px-4 py-3 text-text-secondary">{s.ro?.name}</td>}
              <td className="px-4 py-3 text-text-secondary">
                {paymentTypeLabel(s.paymentType)}
              </td>
              <td className="px-4 py-3 text-right font-medium text-text-primary">
                {formatPkr(s.amount)}
              </td>
              <td className="px-4 py-3 text-text-secondary">{formatDate(s.paymentDate)}</td>
              <td className="px-4 py-3 text-text-secondary">{s.submittedBy?.fullName}</td>
              <td className="px-4 py-3">
                <StatusBadge status={s.status} />
              </td>
              <td className="px-4 py-3 text-meta text-text-secondary">
                {formatDate(s.createdAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

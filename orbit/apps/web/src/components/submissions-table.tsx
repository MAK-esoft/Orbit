'use client';

import { useRouter } from 'next/navigation';
import { Submission } from '@/lib/types';
import { formatDate, formatPkr, paymentTypeLabel, shortRef } from '@/lib/format';
import { StatusBadge } from '@/components/status-badge';
import { SourceBadge } from '@/components/source-badge';

export function SubmissionsTable({
  rows,
  basePath,
  showRo = false,
}: {
  rows: Submission[];
  basePath: string; // e.g. /ro/submissions or /admin/submissions
  showRo?: boolean;
}) {
  const router = useRouter();
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[680px] text-body">
        <thead className="border-b border-border bg-bg text-meta uppercase text-text-secondary">
          <tr>
            <th className="px-4 py-2.5 text-left font-medium">Ref</th>
            {showRo && <th className="px-4 py-2.5 text-left font-medium">RO</th>}
            <th className="px-4 py-2.5 text-left font-medium">Type</th>
            <th className="px-4 py-2.5 text-right font-medium">Amount</th>
            <th className="px-4 py-2.5 text-left font-medium">Payment date</th>
            <th className="px-4 py-2.5 text-left font-medium">Submitted by</th>
            <th className="px-4 py-2.5 text-left font-medium">Status</th>
            <th className="px-4 py-2.5 text-left font-medium">Submitted</th>
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

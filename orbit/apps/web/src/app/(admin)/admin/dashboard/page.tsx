'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { AdminStats } from '@/lib/types';
import { formatDate } from '@/lib/format';
import { PageHeader } from '@/components/page-header';
import { SummaryCard } from '@/components/summary-card';
import { SubmissionsTable } from '@/components/submissions-table';
import { EmptyState, LoadingBlock } from '@/components/ui/states';

export default function AdminDashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<AdminStats | null>(null);

  useEffect(() => {
    api.get<AdminStats>('/dashboard/admin').then(setStats).catch(() => setStats(null));
  }, []);

  return (
    <div>
      <PageHeader title="Dashboard" description="Submissions across all regional offices" />

      {!stats ? (
        <LoadingBlock />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <SummaryCard label="All submissions" value={stats.total} accent="primary" />
            <SummaryCard label="Pending review" value={stats.pendingReview} accent="review" />
            <SummaryCard
              label="Approved (this month)"
              value={stats.approvedThisMonth}
              accent="approved"
            />
            <SummaryCard
              label="Rejected (this month)"
              value={stats.rejectedThisMonth}
              accent="rejected"
            />
          </div>

          <div className="rounded-lg border border-border bg-surface">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-card-label text-text-primary">
                Requiring action — oldest first
              </h2>
            </div>
            {stats.queue.length === 0 ? (
              <EmptyState title="Nothing pending" message="All submissions have been reviewed." />
            ) : (
              <SubmissionsTable rows={stats.queue} basePath="/admin/submissions" showRo />
            )}
          </div>

          <div className="rounded-lg border border-border bg-surface">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-card-label text-text-primary">Per-RO breakdown</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-body">
                <thead className="border-b border-border bg-bg text-meta uppercase text-text-secondary">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-medium">Regional office</th>
                    <th className="px-4 py-2.5 text-right font-medium">Pending</th>
                    <th className="px-4 py-2.5 text-right font-medium">Last activity</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.perRo.map((ro) => (
                    <tr
                      key={ro.roId}
                      onClick={() => router.push(`/admin/submissions?roId=${ro.roId}`)}
                      className="cursor-pointer border-b border-border last:border-0 hover:bg-primary-light"
                      title="View this office's requests"
                    >
                      <td className="px-4 py-3 font-medium text-text-primary">
                        {ro.name}
                        <span className="ml-2 text-meta text-text-secondary">{ro.code}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-text-secondary">{ro.pending}</td>
                      <td className="px-4 py-3 text-right text-text-secondary">
                        {ro.lastSubmissionAt ? formatDate(ro.lastSubmissionAt) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { RoStats } from '@/lib/types';
import { PageHeader } from '@/components/page-header';
import { SummaryCard } from '@/components/summary-card';
import { SubmissionsTable } from '@/components/submissions-table';
import { Button } from '@/components/ui/button';
import { EmptyState, LoadingBlock } from '@/components/ui/states';

export default function RoDashboardPage() {
  const [stats, setStats] = useState<RoStats | null>(null);

  useEffect(() => {
    api.get<RoStats>('/dashboard/ro').then(setStats).catch(() => setStats(null));
  }, []);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Your regional office activity at a glance"
        action={
          <Link href="/ro/submissions/new">
            <Button>
              <Plus className="h-4 w-4" /> New request
            </Button>
          </Link>
        }
      />

      {!stats ? (
        <LoadingBlock />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <SummaryCard label="Total submissions" value={stats.total} accent="primary" />
            <SummaryCard label="Pending" value={stats.pending} accent="submitted" />
            <SummaryCard label="Approved" value={stats.approved} accent="approved" />
            <SummaryCard label="Rejected" value={stats.rejected} accent="rejected" />
          </div>

          <div className="rounded-lg border border-border bg-surface">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-card-label text-text-primary">Recent requests</h2>
              <Link href="/ro/submissions" className="text-meta text-primary hover:underline">
                View all
              </Link>
            </div>
            {stats.recent.length === 0 ? (
              <EmptyState
                title="No requests yet"
                message="Submit your first request to get started."
                action={
                  <Link href="/ro/submissions/new">
                    <Button>New request</Button>
                  </Link>
                }
              />
            ) : (
              <SubmissionsTable rows={stats.recent} basePath="/ro/submissions" />
            )}
          </div>
        </>
      )}
    </div>
  );
}

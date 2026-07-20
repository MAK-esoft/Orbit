'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Download, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { PaginatedMeta, Submission, SubmissionStatus } from '@/lib/types';
import { usePersistentState } from '@/lib/use-persistent-state';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { SubmissionsTable } from '@/components/submissions-table';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { EmptyState, TableSkeleton } from '@/components/ui/states';

const STATUSES: { value: SubmissionStatus | ''; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'UNDER_REVIEW', label: 'Under Review' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
];

const DEFAULT_FILTERS = {
  status: '',
  type: '',
  sortBy: 'createdAt',
  sortDir: 'desc' as 'asc' | 'desc',
};

export default function RoSubmissionsPage() {
  const [rows, setRows] = useState<Submission[] | null>(null);
  const [meta, setMeta] = useState<PaginatedMeta | null>(null);
  const [page, setPage] = useState(1);
  const [filters, setFilters, hydrated] = usePersistentState(
    'orbit.filters.roRequests',
    DEFAULT_FILTERS,
  );

  const queryParams = useCallback(() => {
    const params = new URLSearchParams();
    if (filters.status) params.set('status', filters.status);
    if (filters.type) params.set('paymentType', filters.type);
    params.set('sortBy', filters.sortBy);
    params.set('sortDir', filters.sortDir);
    return params;
  }, [filters]);

  // `silent` refreshes in place (no skeleton flash) — used by the auto-poll.
  const load = useCallback(
    async (silent = false) => {
      if (!silent) setRows(null);
      const params = queryParams();
      params.set('page', String(page));
      params.set('limit', '20');
      try {
        const { data, meta } = await api.page<Submission[]>(`/submissions?${params}`);
        setRows(data ?? []);
        setMeta((meta as unknown as PaginatedMeta) ?? null);
      } catch {
        if (!silent) setRows([]);
      }
    },
    [page, queryParams],
  );

  useEffect(() => {
    if (hydrated) load();
  }, [load, hydrated]);

  // Auto-refresh every 5s so the list feels live. Skips while the tab is hidden.
  useEffect(() => {
    if (!hydrated) return;
    const id = setInterval(() => {
      if (!document.hidden) load(true);
    }, 5000);
    return () => clearInterval(id);
  }, [load, hydrated]);

  function setFilter<K extends keyof typeof filters>(key: K, value: (typeof filters)[K]) {
    setPage(1);
    setFilters((f) => ({ ...f, [key]: value }));
  }

  function onSort(col: string) {
    setPage(1);
    setFilters((f) =>
      f.sortBy === col
        ? { ...f, sortDir: f.sortDir === 'asc' ? 'desc' : 'asc' }
        : { ...f, sortBy: col, sortDir: 'desc' },
    );
  }

  function exportCsv() {
    window.open(`/api/submissions/export?${queryParams()}`, '_blank');
  }

  return (
    <div>
      <PageHeader
        title="My Requests"
        description="All payment requests for your office"
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={exportCsv} disabled={!rows?.length}>
              <Download className="h-4 w-4" /> Export CSV
            </Button>
            <Link href="/ro/submissions/new">
              <Button>
                <Plus className="h-4 w-4" /> New request
              </Button>
            </Link>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap gap-3">
        <Select
          className="w-auto"
          value={filters.status}
          onChange={(e) => setFilter('status', e.target.value)}
        >
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
        <Select
          className="w-auto"
          value={filters.type}
          onChange={(e) => setFilter('type', e.target.value)}
        >
          <option value="">All types</option>
          <option value="BANK_TRANSFER">Bank Transfer</option>
          <option value="CASH_DEPOSIT">Cash Deposit</option>
          <option value="CHEQUE">Cheque</option>
          <option value="OTHER">Other</option>
        </Select>
      </div>

      <div className="rounded-lg border border-border bg-surface">
        {rows === null ? (
          <TableSkeleton />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No requests found"
            message="Try adjusting the filters, or submit a new request."
          />
        ) : (
          <>
            <SubmissionsTable
              rows={rows}
              basePath="/ro/submissions"
              sort={{ by: filters.sortBy, dir: filters.sortDir }}
              onSort={onSort}
            />
            {meta && <Pagination meta={meta} onPage={setPage} />}
          </>
        )}
      </div>
    </div>
  );
}

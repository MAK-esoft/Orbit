'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { api } from '@/lib/api';
import {
  PaginatedMeta,
  RegionalOffice,
  Submission,
} from '@/lib/types';
import { usePersistentState } from '@/lib/use-persistent-state';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { SubmissionsTable } from '@/components/submissions-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { DateRangePicker } from '@/components/ui/date-picker';
import { EmptyState, TableSkeleton } from '@/components/ui/states';

const DEFAULT_FILTERS = {
  roId: '',
  status: '',
  paymentType: '',
  dateFrom: '',
  dateTo: '',
  search: '',
  sortBy: 'createdAt',
  sortDir: 'desc' as 'asc' | 'desc',
};

export default function AdminSubmissionsPage() {
  const [rows, setRows] = useState<Submission[] | null>(null);
  const [meta, setMeta] = useState<PaginatedMeta | null>(null);
  const [ros, setRos] = useState<RegionalOffice[]>([]);
  const [page, setPage] = useState(1);
  // Filters persist per-browser (survive logout/login) via localStorage.
  const [filters, setFilters, hydrated] = usePersistentState(
    'orbit.filters.adminRequests',
    DEFAULT_FILTERS,
  );
  const appliedUrl = useRef(false);

  useEffect(() => {
    api.get<RegionalOffice[]>('/regional-offices').then(setRos).catch(() => setRos([]));
  }, []);

  // A roId passed via the URL (e.g. from the Offices page) overrides the
  // persisted office filter. Applied once, after the persisted value loads.
  useEffect(() => {
    if (!hydrated || appliedUrl.current) return;
    appliedUrl.current = true;
    const roId = new URLSearchParams(window.location.search).get('roId');
    if (roId) setFilters((f) => ({ ...f, roId }));
  }, [hydrated, setFilters]);

  const buildParams = useCallback(() => {
    const p = new URLSearchParams({ page: String(page), limit: '25' });
    Object.entries(filters).forEach(([k, v]) => v && p.set(k, String(v)));
    return p;
  }, [page, filters]);

  // `silent` refreshes in place (no skeleton flash) — used by the auto-poll.
  const load = useCallback(
    async (silent = false) => {
      if (!silent) setRows(null);
      try {
        const { data, meta } = await api.page<Submission[]>(
          `/submissions?${buildParams()}`,
        );
        setRows(data ?? []);
        setMeta((meta as unknown as PaginatedMeta) ?? null);
      } catch {
        if (!silent) setRows([]);
      }
    },
    [buildParams],
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

  function set<K extends keyof typeof filters>(key: K, value: (typeof filters)[K]) {
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
    const p = buildParams();
    p.delete('page');
    p.delete('limit');
    window.open(`/api/submissions/export?${p}`, '_blank');
  }

  return (
    <div>
      <PageHeader
        title="All Requests"
        description="Across every regional office"
        action={
          <Button variant="secondary" onClick={exportCsv} disabled={!rows?.length}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Select value={filters.roId} onChange={(e) => set('roId', e.target.value)}>
          <option value="">All offices</option>
          {ros.map((ro) => (
            <option key={ro.id} value={ro.id}>
              {ro.name}
            </option>
          ))}
        </Select>
        <Select value={filters.status} onChange={(e) => set('status', e.target.value)}>
          <option value="">All statuses</option>
          <option value="SUBMITTED">Submitted</option>
          <option value="UNDER_REVIEW">Under Review</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
        </Select>
        <Select
          value={filters.paymentType}
          onChange={(e) => set('paymentType', e.target.value)}
        >
          <option value="">All types</option>
          <option value="BANK_TRANSFER">Bank Transfer</option>
          <option value="CASH_DEPOSIT">Cash Deposit</option>
          <option value="CHEQUE">Cheque</option>
          <option value="OTHER">Other</option>
        </Select>
        <DateRangePicker
          className="col-span-2 md:col-span-1"
          from={filters.dateFrom}
          to={filters.dateTo}
          onChange={({ from, to }) => {
            setPage(1);
            setFilters((f) => ({ ...f, dateFrom: from, dateTo: to }));
          }}
          placeholder="Payment date"
        />
        <Input
          placeholder="Search ref / bank"
          value={filters.search}
          onChange={(e) => set('search', e.target.value)}
        />
      </div>

      <div className="rounded-lg border border-border bg-surface">
        {rows === null ? (
          <TableSkeleton cols={7} />
        ) : rows.length === 0 ? (
          <EmptyState title="No requests found" message="Try adjusting your filters." />
        ) : (
          <>
            <SubmissionsTable
              rows={rows}
              basePath="/admin/submissions"
              showRo
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

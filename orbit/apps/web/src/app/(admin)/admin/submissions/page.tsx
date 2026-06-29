'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { api } from '@/lib/api';
import {
  PaginatedMeta,
  RegionalOffice,
  Submission,
} from '@/lib/types';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { SubmissionsTable } from '@/components/submissions-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { EmptyState, TableSkeleton } from '@/components/ui/states';

export default function AdminSubmissionsPage() {
  const [rows, setRows] = useState<Submission[] | null>(null);
  const [meta, setMeta] = useState<PaginatedMeta | null>(null);
  const [ros, setRos] = useState<RegionalOffice[]>([]);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    roId: '',
    status: '',
    paymentType: '',
    dateFrom: '',
    dateTo: '',
    search: '',
  });

  useEffect(() => {
    api.get<RegionalOffice[]>('/regional-offices').then(setRos).catch(() => setRos([]));
    // Pre-apply an RO filter passed via the URL (e.g. from the Offices page).
    const sp = new URLSearchParams(window.location.search);
    const roId = sp.get('roId');
    if (roId) setFilters((f) => ({ ...f, roId }));
  }, []);

  const buildParams = useCallback(() => {
    const p = new URLSearchParams({ page: String(page), limit: '25' });
    Object.entries(filters).forEach(([k, v]) => v && p.set(k, v));
    return p;
  }, [page, filters]);

  const load = useCallback(async () => {
    setRows(null);
    try {
      const { data, meta } = await api.page<Submission[]>(
        `/submissions?${buildParams()}`,
      );
      setRows(data ?? []);
      setMeta((meta as unknown as PaginatedMeta) ?? null);
    } catch {
      setRows([]);
    }
  }, [buildParams]);

  useEffect(() => {
    load();
  }, [load]);

  function set<K extends keyof typeof filters>(key: K, value: string) {
    setPage(1);
    setFilters((f) => ({ ...f, [key]: value }));
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
        <Input
          type="date"
          value={filters.dateFrom}
          onChange={(e) => set('dateFrom', e.target.value)}
          title="Payment date from"
        />
        <Input
          type="date"
          value={filters.dateTo}
          onChange={(e) => set('dateTo', e.target.value)}
          title="Payment date to"
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
            <SubmissionsTable rows={rows} basePath="/admin/submissions" showRo />
            {meta && <Pagination meta={meta} onPage={setPage} />}
          </>
        )}
      </div>
    </div>
  );
}

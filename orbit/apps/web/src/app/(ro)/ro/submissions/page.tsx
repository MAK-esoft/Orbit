'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Download, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { PaginatedMeta, Submission, SubmissionStatus } from '@/lib/types';
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

export default function RoSubmissionsPage() {
  const [rows, setRows] = useState<Submission[] | null>(null);
  const [meta, setMeta] = useState<PaginatedMeta | null>(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string>('');
  const [type, setType] = useState<string>('');

  const queryParams = useCallback(() => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (type) params.set('paymentType', type);
    return params;
  }, [status, type]);

  const load = useCallback(async () => {
    setRows(null);
    const params = queryParams();
    params.set('page', String(page));
    params.set('limit', '20');
    try {
      const { data, meta } = await api.page<Submission[]>(`/submissions?${params}`);
      setRows(data ?? []);
      setMeta((meta as unknown as PaginatedMeta) ?? null);
    } catch {
      setRows([]);
    }
  }, [page, queryParams]);

  useEffect(() => {
    load();
  }, [load]);

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
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value);
          }}
        >
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
        <Select
          className="w-auto"
          value={type}
          onChange={(e) => {
            setPage(1);
            setType(e.target.value);
          }}
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
            <SubmissionsTable rows={rows} basePath="/ro/submissions" />
            {meta && <Pagination meta={meta} onPage={setPage} />}
          </>
        )}
      </div>
    </div>
  );
}

'use client';

import { useRouter } from 'next/navigation';
import { Download, Plus, Search, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { AdjustmentType, RequestType } from '@/lib/types';
import { formatDate, formatPkr, requestTypeLabel } from '@/lib/format';
import { usePersistentState } from '@/lib/use-persistent-state';
import { Button } from '@/components/ui/button';
import { Field, FormError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState, LoadingBlock } from '@/components/ui/states';
import { TablePager } from '@/components/table-pager';
import { DatePicker, DateRangePicker } from '@/components/ui/date-picker';
import { cn } from '@/lib/utils';

const DEFAULT_LEDGER_FILTERS = {
  search: '',
  direction: '' as '' | AdjustmentType,
  kind: '' as '' | 'REQUEST' | 'ADJUSTMENT',
  dateFrom: '',
  dateTo: '',
  sortBy: 'date' as 'date' | 'amount',
  sortDir: 'desc' as 'asc' | 'desc',
  pageSize: 25,
};

/** Build and download a CSV of the given ledger rows (client-side). */
function exportLedgerCsv(rows: LedgerEntry[], label?: string) {
  const header = ['Date', 'Source', 'Description', 'Reference', 'Bank', 'Created by', 'Direction', 'Amount (PKR)', 'Balance (PKR)'];
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = rows.map((e) =>
    [
      e.date,
      e.kind === 'ADJUSTMENT' ? 'Adjustment' : 'Request',
      e.kind === 'REQUEST' ? requestTypeLabel(e.requestType as RequestType) : e.description,
      e.reference ?? '',
      e.bankName ?? '',
      e.by ?? '',
      e.direction,
      e.amount,
      e.running,
    ]
      .map(esc)
      .join(','),
  );
  const csv = [header.map(esc).join(','), ...lines].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `orbit-ledger${label ? `-${label}` : ''}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

interface LedgerEntry {
  id: string;
  kind: 'REQUEST' | 'ADJUSTMENT';
  date: string;
  direction: AdjustmentType;
  amount: string;
  running: string;
  // REQUEST
  submissionId?: string;
  requestType?: RequestType;
  reference?: string;
  bankName?: string | null;
  // ADJUSTMENT
  adjustmentId?: string;
  description?: string;
  by?: string | null;
}

interface LedgerResponse {
  entries: LedgerEntry[];
  totals: { credited: string; debited: string; outstanding: string };
}

/**
 * Per-RO running statement. Approved deposit requests = credit (money the RO
 * remitted); approved expense/salary/vendor requests and admin DEBIT entries =
 * debit (charges, e.g. stock delivered). Outstanding = debits − credits; a
 * positive figure is what the RO still owes IRBAS.
 */
export function LedgerView({
  roId,
  canManage,
  submissionBasePath,
  storageKey,
}: {
  roId?: string;
  canManage: boolean;
  submissionBasePath: string;
  /** localStorage key under which this view's filters persist (per browser). */
  storageKey: string;
}) {
  const router = useRouter();
  const [data, setData] = useState<LedgerResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [filters, setFilters] = usePersistentState(storageKey, DEFAULT_LEDGER_FILTERS);

  const load = useCallback(async () => {
    setData(null);
    setError(null);
    try {
      const res = await api.get<LedgerResponse>(
        `/dashboard/ledger${roId ? `?roId=${roId}` : ''}`,
      );
      setData(res);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load the ledger.');
      setData({ entries: [], totals: { credited: '0.00', debited: '0.00', outstanding: '0.00' } });
    }
  }, [roId]);

  useEffect(() => {
    load();
  }, [load]);

  async function removeEntry(adjustmentId: string) {
    if (!confirm('Remove this ledger entry?')) return;
    await api.del(`/adjustments/${adjustmentId}`).catch(() => {});
    await load();
  }

  function setFilter<K extends keyof typeof filters>(key: K, value: (typeof filters)[K]) {
    setFilters((f) => ({ ...f, [key]: value }));
  }

  // Client-side search / filter / sort over the full statement. The running
  // balance on each row stays the true cumulative balance at that entry's point
  // in chronological history, regardless of how the list is filtered or sorted.
  const displayed = useMemo(() => {
    const all = data?.entries ?? [];
    const q = filters.search.trim().toLowerCase();
    const out = all.filter((e) => {
      if (filters.direction && e.direction !== filters.direction) return false;
      if (filters.kind && e.kind !== filters.kind) return false;
      if (filters.dateFrom && e.date < filters.dateFrom) return false;
      if (filters.dateTo && e.date > filters.dateTo) return false;
      if (q) {
        const hay = [
          e.kind === 'REQUEST' ? requestTypeLabel(e.requestType as RequestType) : e.description,
          e.reference,
          e.bankName,
          e.by,
          e.kind,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    out.sort((a, b) => {
      const cmp =
        filters.sortBy === 'amount'
          ? Number(a.amount) - Number(b.amount)
          : a.date < b.date
            ? -1
            : a.date > b.date
              ? 1
              : 0;
      return filters.sortDir === 'asc' ? cmp : -cmp;
    });
    return out;
  }, [data, filters]);

  const totalCount = data?.entries.length ?? 0;
  const isFiltered =
    !!filters.search || !!filters.direction || !!filters.kind || !!filters.dateFrom || !!filters.dateTo;
  const outstanding = data ? Number(data.totals.outstanding) : 0;

  // Client-side pagination over the filtered/sorted list.
  const [page, setPage] = useState(1);
  useEffect(() => {
    setPage(1);
  }, [filters.search, filters.direction, filters.kind, filters.dateFrom, filters.dateTo, filters.pageSize, roId]);
  const pageSize = filters.pageSize;
  const totalPages = Math.max(1, Math.ceil(displayed.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paged = displayed.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="space-y-5">
      {/* Totals */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile
          label="Total credited (paid in)"
          value={formatPkr(data?.totals.credited ?? 0)}
          className="text-status-approved"
        />
        <StatTile
          label="Total debited (charges)"
          value={formatPkr(data?.totals.debited ?? 0)}
          className="text-status-rejected"
        />
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-meta text-text-secondary">
            {outstanding > 0
              ? 'Outstanding — RO owes IRBAS'
              : outstanding < 0
                ? 'In credit — IRBAS owes RO'
                : 'Settled'}
          </p>
          <p
            className={cn(
              'mt-1 text-2xl font-semibold',
              outstanding > 0
                ? 'text-status-rejected'
                : outstanding < 0
                  ? 'text-status-approved'
                  : 'text-text-primary',
            )}
          >
            {formatPkr(Math.abs(outstanding))}
          </p>
        </div>
      </div>

      {(canManage || totalCount > 0) && (
        <div className="flex justify-end gap-2">
          {totalCount > 0 && (
            <Button
              variant="secondary"
              onClick={() => exportLedgerCsv(displayed)}
              disabled={!displayed.length}
              title="Download the entries matching the current filters"
            >
              <Download className="h-4 w-4" /> Export CSV
            </Button>
          )}
          {canManage && (
            <Button onClick={() => setAddOpen(true)} disabled={!roId}>
              <Plus className="h-4 w-4" /> Add credit / debit
            </Button>
          )}
        </div>
      )}

      {error && <FormError message={error} />}

      {/* Filter / search / sort toolbar */}
      {totalCount > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
            <Input
              className="pl-9"
              placeholder="Search description, reference, bank…"
              value={filters.search}
              onChange={(e) => setFilter('search', e.target.value)}
            />
          </div>
          <Select
            className="w-auto"
            value={filters.direction}
            onChange={(e) => setFilter('direction', e.target.value as '' | AdjustmentType)}
            title="Credit or debit"
          >
            <option value="">All entries</option>
            <option value="CREDIT">Credits only</option>
            <option value="DEBIT">Debits only</option>
          </Select>
          <Select
            className="w-auto"
            value={filters.kind}
            onChange={(e) => setFilter('kind', e.target.value as '' | 'REQUEST' | 'ADJUSTMENT')}
            title="Source"
          >
            <option value="">All sources</option>
            <option value="REQUEST">Requests</option>
            <option value="ADJUSTMENT">Adjustments</option>
          </Select>
          <DateRangePicker
            className="w-auto min-w-[210px]"
            from={filters.dateFrom}
            to={filters.dateTo}
            onChange={({ from, to }) => setFilters((f) => ({ ...f, dateFrom: from, dateTo: to }))}
          />
          <Select
            className="w-auto"
            value={`${filters.sortBy}_${filters.sortDir}`}
            onChange={(e) => {
              const [by, dir] = e.target.value.split('_');
              setFilters((f) => ({ ...f, sortBy: by as 'date' | 'amount', sortDir: dir as 'asc' | 'desc' }));
            }}
            title="Sort"
          >
            <option value="date_desc">Newest first</option>
            <option value="date_asc">Oldest first</option>
            <option value="amount_desc">Amount: high → low</option>
            <option value="amount_asc">Amount: low → high</option>
          </Select>
        </div>
      )}

      {/* Statement */}
      <div className="rounded-lg border border-border bg-surface">
        {data === null ? (
          <LoadingBlock />
        ) : totalCount === 0 ? (
          <EmptyState
            title="No ledger entries yet"
            message="Approved deposit/expense requests and manual credit/debit entries will appear here."
          />
        ) : displayed.length === 0 ? (
          <EmptyState
            title="No entries match your filters"
            message="Try clearing the search or filters above."
          />
        ) : (
          <>
            {isFiltered && (
              <p className="border-b border-border px-4 py-2 text-meta text-text-secondary">
                Filtered — {displayed.length} of {totalCount} entries match
              </p>
            )}
            <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-body">
              <thead className="border-b border-border bg-bg text-meta uppercase text-text-secondary">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Date</th>
                  <th className="px-4 py-2.5 text-left font-medium">Description</th>
                  <th className="px-4 py-2.5 text-right font-medium">Credit</th>
                  <th className="px-4 py-2.5 text-right font-medium">Debit</th>
                  <th className="px-4 py-2.5 text-right font-medium">Balance</th>
                  {canManage && <th className="px-4 py-2.5" />}
                </tr>
              </thead>
              <tbody>
                {paged.map((e) => {
                  const running = Number(e.running);
                  const title =
                    e.kind === 'REQUEST'
                      ? requestTypeLabel(e.requestType as RequestType)
                      : e.description;
                  const subtitle =
                    e.kind === 'REQUEST'
                      ? `#${e.reference}${e.bankName ? ` · ${e.bankName}` : ''}`
                      : `Adjustment${e.by ? ` · ${e.by}` : ''}`;
                  const href = e.submissionId
                    ? `${submissionBasePath}/${e.submissionId}`
                    : undefined;
                  return (
                    <tr
                      key={e.id}
                      className={cn(
                        'border-b border-border last:border-0',
                        href && 'cursor-pointer hover:bg-primary-light',
                      )}
                      onClick={() => href && router.push(href)}
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-text-secondary">
                        {formatDate(e.date)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-text-primary">{title}</div>
                        <div className="text-meta text-text-secondary">
                          <span
                            className={cn(
                              'mr-1.5 rounded px-1.5 py-0.5 text-[10px] font-medium',
                              e.kind === 'ADJUSTMENT'
                                ? 'bg-primary-light text-primary'
                                : 'bg-bg text-text-secondary',
                            )}
                          >
                            {e.kind === 'ADJUSTMENT' ? 'Adjustment' : 'Request'}
                          </span>
                          {subtitle}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-status-approved">
                        {e.direction === 'CREDIT' ? formatPkr(e.amount) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-status-rejected">
                        {e.direction === 'DEBIT' ? formatPkr(e.amount) : '—'}
                      </td>
                      <td
                        className={cn(
                          'px-4 py-3 text-right font-medium',
                          running > 0
                            ? 'text-status-rejected'
                            : running < 0
                              ? 'text-status-approved'
                              : 'text-text-primary',
                        )}
                      >
                        {running < 0 ? '−' : ''}
                        {formatPkr(Math.abs(running))}
                      </td>
                      {canManage && (
                        <td className="px-4 py-3 text-right" onClick={(ev) => ev.stopPropagation()}>
                          {e.adjustmentId && (
                            <button
                              onClick={() => removeEntry(e.adjustmentId!)}
                              className="rounded p-1.5 text-text-secondary hover:bg-bg hover:text-status-rejected"
                              title="Remove entry"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
            <TablePager
              page={currentPage}
              pageSize={pageSize}
              total={displayed.length}
              onPage={setPage}
              onPageSize={(s) => setFilter('pageSize', s)}
            />
          </>
        )}
      </div>

      {canManage && roId && (
        <AddAdjustmentModal
          open={addOpen}
          roId={roId}
          onClose={() => setAddOpen(false)}
          onSaved={() => {
            setAddOpen(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function StatTile({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-meta text-text-secondary">{label}</p>
      <p className={cn('mt-1 text-2xl font-semibold', className)}>{value}</p>
    </div>
  );
}

function AddAdjustmentModal({
  open,
  roId,
  onClose,
  onSaved,
}: {
  open: boolean;
  roId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [type, setType] = useState<AdjustmentType>('DEBIT');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api.post('/adjustments', { roId, type, amount, description, effectiveDate });
      setAmount('');
      setDescription('');
      setType('DEBIT');
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not add entry.');
    } finally {
      setBusy(false);
    }
  }

  const valid = Number(amount) > 0 && description.trim().length >= 3;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add ledger entry"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !valid}>
            {busy ? 'Saving…' : 'Add entry'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormError message={error} />
        <Field label="Type" required>
          <Select value={type} onChange={(e) => setType(e.target.value as AdjustmentType)}>
            <option value="DEBIT">Debit — charge to RO (e.g. stock delivered)</option>
            <option value="CREDIT">Credit — amount paid toward IRBAS</option>
          </Select>
        </Field>
        <Field label="Amount (PKR)" required>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
          />
        </Field>
        <Field label="Effective date" required>
          <DatePicker value={effectiveDate} onChange={setEffectiveDate} max={today} />
        </Field>
        <Field label="Description" required>
          <Textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Stock delivered — KEUNE consignment"
          />
        </Field>
      </div>
    </Modal>
  );
}

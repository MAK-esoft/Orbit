'use client';

import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { AdjustmentType, RequestType } from '@/lib/types';
import { formatDate, formatPkr, requestTypeLabel } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Field, FormError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState, LoadingBlock } from '@/components/ui/states';
import { cn } from '@/lib/utils';

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
}: {
  roId?: string;
  canManage: boolean;
  submissionBasePath: string;
}) {
  const router = useRouter();
  const [data, setData] = useState<LedgerResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

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

  const outstanding = data ? Number(data.totals.outstanding) : 0;

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

      {canManage && (
        <div className="flex justify-end">
          <Button onClick={() => setAddOpen(true)} disabled={!roId}>
            <Plus className="h-4 w-4" /> Add credit / debit
          </Button>
        </div>
      )}

      {error && <FormError message={error} />}

      {/* Statement */}
      <div className="rounded-lg border border-border bg-surface">
        {data === null ? (
          <LoadingBlock />
        ) : data.entries.length === 0 ? (
          <EmptyState
            title="No ledger entries yet"
            message="Approved deposit/expense requests and manual credit/debit entries will appear here."
          />
        ) : (
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
                {data.entries.map((e) => {
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
          <Input
            type="date"
            value={effectiveDate}
            max={today}
            onChange={(e) => setEffectiveDate(e.target.value)}
          />
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

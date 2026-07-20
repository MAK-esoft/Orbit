'use client';

import { useMemo, useState } from 'react';
import { Sparkles, X, Save } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import {
  PaymentType,
  RequestType,
  Submission,
  SubmissionExtraction,
} from '@/lib/types';
import { paymentTypeLabel, requestTypeLabel } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { FormError } from '@/components/ui/field';
import { DatePicker } from '@/components/ui/date-picker';

const REQUEST_TYPES: RequestType[] = [
  'DEPOSIT',
  'EXPENSE',
  'SALARY_DISBURSEMENT',
  'VENDOR_PAYMENT',
  'OTHER',
];
const PAYMENT_TYPES: PaymentType[] = ['BANK_TRANSFER', 'CASH_DEPOSIT', 'CHEQUE', 'OTHER'];

function classificationToRequestType(c?: string): RequestType | null {
  switch ((c ?? '').toLowerCase()) {
    case 'payment_proof':
    case 'deposit':
      return 'DEPOSIT';
    case 'expense_proof':
    case 'expense':
      return 'EXPENSE';
    case 'salary_disbursement':
      return 'SALARY_DISBURSEMENT';
    case 'vendor_payment':
      return 'VENDOR_PAYMENT';
    default:
      return null;
  }
}

function methodToPaymentType(m?: string | null): PaymentType | null {
  switch ((m ?? '').toLowerCase()) {
    case 'bank_transfer':
      return 'BANK_TRANSFER';
    case 'cash_deposit':
      return 'CASH_DEPOSIT';
    case 'cheque':
      return 'CHEQUE';
    case 'card':
      return 'OTHER';
    default:
      return null;
  }
}

/** Pull a dynamic extracted field whose label matches a regex. */
function fieldByLabel(ex: SubmissionExtraction | null | undefined, re: RegExp): string | null {
  const f = (ex?.fields ?? []).find((x) => re.test(x.label));
  return f ? String(f.value) : null;
}

interface FormState {
  requestType: RequestType;
  paymentType: PaymentType;
  paymentTypeNote: string;
  amount: string;
  paymentDate: string;
  bankName: string;
  referenceNumber: string;
  notes: string;
}

/** A small "from the workflow" suggestion chip shown under a field. */
function SuggestChip({ value, onApply }: { value: string; onApply: () => void }) {
  return (
    <button
      type="button"
      onClick={onApply}
      className="mt-1 inline-flex max-w-full items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-meta text-indigo-700 transition hover:bg-indigo-100"
      title="Apply this extracted value"
    >
      <Sparkles className="h-3 w-3 shrink-0" />
      <span className="truncate">Extracted: {value}</span>
    </button>
  );
}

/**
 * Admin edit of a request's information. Supports manual edits and applying the
 * workflow's extracted values — per field (chips) or all at once.
 */
export function SubmissionEditForm({
  submission,
  onCancel,
  onSaved,
}: {
  submission: Submission;
  onCancel: () => void;
  onSaved: (s: Submission) => void;
}) {
  const ex = submission.extraction ?? null;

  const [form, setForm] = useState<FormState>({
    requestType: submission.requestType,
    paymentType: submission.paymentType,
    paymentTypeNote: submission.paymentTypeNote ?? '',
    amount: submission.amount ?? '',
    paymentDate: submission.paymentDate,
    bankName: submission.bankName ?? '',
    referenceNumber: submission.referenceNumber ?? '',
    notes: submission.notes ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Suggestions derived from the extraction (null when nothing relevant found).
  const suggestions = useMemo(
    () => ({
      requestType: classificationToRequestType(ex?.classification),
      paymentType: methodToPaymentType(ex?.extractedPaymentMethod),
      amount: ex?.extractedAmount ?? fieldByLabel(ex, /\b(total )?amount\b/i),
      bankName: fieldByLabel(ex, /\bbank\b/i),
      referenceNumber:
        ex?.slipRef ?? fieldByLabel(ex, /transaction id|reference|slip|trx|txn/i),
      notes: ex?.description ?? null,
    }),
    [ex],
  );

  const hasAnySuggestion =
    !!ex &&
    Object.values(suggestions).some((v) => v !== null && v !== undefined && v !== '');

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function fillAllFromExtracted() {
    setForm((f) => ({
      ...f,
      requestType: suggestions.requestType ?? f.requestType,
      paymentType: suggestions.paymentType ?? f.paymentType,
      amount: suggestions.amount ?? f.amount,
      bankName: suggestions.bankName ?? f.bankName,
      referenceNumber: suggestions.referenceNumber ?? f.referenceNumber,
      notes: suggestions.notes ?? f.notes,
    }));
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      if (form.paymentType === 'OTHER' && !form.paymentTypeNote.trim()) {
        throw new Error('A method note is required when payment method is Other.');
      }
      const payload: Record<string, unknown> = {
        requestType: form.requestType,
        paymentType: form.paymentType,
        paymentTypeNote: form.paymentType === 'OTHER' ? form.paymentTypeNote : '',
        bankName: form.bankName,
        referenceNumber: form.referenceNumber,
        notes: form.notes,
        paymentDate: form.paymentDate,
      };
      if (form.amount.trim() !== '') payload.amount = form.amount.trim();

      const updated = await api.patch<Submission>(`/submissions/${submission.id}`, payload);
      onSaved(updated);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : 'Could not save. Try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  // Show a chip only when the extracted value differs from what's in the field.
  const chip = (key: keyof typeof suggestions, current: string) => {
    const v = suggestions[key];
    if (v === null || v === undefined || String(v) === '' || String(v) === current) {
      return null;
    }
    return <SuggestChip value={String(v)} onApply={() => set(key as keyof FormState, String(v) as never)} />;
  };

  return (
    <div>
      <FormError message={error} />

      {hasAnySuggestion && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-md border border-indigo-200 bg-indigo-50/70 px-4 py-3">
          <p className="flex items-center gap-2 text-meta text-indigo-800">
            <Sparkles className="h-4 w-4" />
            Apply the workflow's extracted values, then review before saving.
          </p>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={fillAllFromExtracted}
            disabled={busy}
            className="border-indigo-300 bg-white text-indigo-700 hover:bg-indigo-100"
          >
            <Sparkles className="h-4 w-4" /> Fill all from extracted
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-card-label text-text-primary">Request type</label>
          <Select value={form.requestType} onChange={(e) => set('requestType', e.target.value as RequestType)} disabled={busy}>
            {REQUEST_TYPES.map((t) => (
              <option key={t} value={t}>{requestTypeLabel(t)}</option>
            ))}
          </Select>
          {chip('requestType', form.requestType)}
        </div>

        <div>
          <label className="mb-1 block text-card-label text-text-primary">Payment method</label>
          <Select value={form.paymentType} onChange={(e) => set('paymentType', e.target.value as PaymentType)} disabled={busy}>
            {PAYMENT_TYPES.map((t) => (
              <option key={t} value={t}>{paymentTypeLabel(t)}</option>
            ))}
          </Select>
          {chip('paymentType', form.paymentType)}
        </div>

        {form.paymentType === 'OTHER' && (
          <div className="sm:col-span-2">
            <label className="mb-1 block text-card-label text-text-primary">Method note</label>
            <Input value={form.paymentTypeNote} onChange={(e) => set('paymentTypeNote', e.target.value)} placeholder="Describe the payment method" disabled={busy} />
          </div>
        )}

        <div>
          <label className="mb-1 block text-card-label text-text-primary">Amount (PKR)</label>
          <Input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => set('amount', e.target.value)} placeholder="Unconfirmed" disabled={busy} />
          {chip('amount', form.amount)}
        </div>

        <div>
          <label className="mb-1 block text-card-label text-text-primary">Payment date</label>
          <DatePicker
            value={form.paymentDate}
            onChange={(d) => set('paymentDate', d)}
            max={new Date().toISOString().slice(0, 10)}
          />
        </div>

        <div>
          <label className="mb-1 block text-card-label text-text-primary">Bank</label>
          <Input value={form.bankName} onChange={(e) => set('bankName', e.target.value)} placeholder="Bank name" disabled={busy} />
          {chip('bankName', form.bankName)}
        </div>

        <div>
          <label className="mb-1 block text-card-label text-text-primary">Reference</label>
          <Input value={form.referenceNumber} onChange={(e) => set('referenceNumber', e.target.value)} placeholder="Reference / slip number" disabled={busy} />
          {chip('referenceNumber', form.referenceNumber)}
        </div>

        <div className="sm:col-span-2">
          <label className="mb-1 block text-card-label text-text-primary">Notes</label>
          <Textarea rows={3} value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Notes" disabled={busy} />
          {chip('notes', form.notes)}
        </div>
      </div>

      <div className="mt-5 flex items-center justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>
          <X className="h-4 w-4" /> Cancel
        </Button>
        <Button type="button" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : (<><Save className="h-4 w-4" /> Save changes</>)}
        </Button>
      </div>
    </div>
  );
}

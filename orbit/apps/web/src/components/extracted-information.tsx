import { SubmissionExtraction } from '@/lib/types';
import { formatDateTime, formatPkr } from '@/lib/format';
import { CheckCircle2, Sparkles, XCircle } from 'lucide-react';

function classificationLabel(c: string): string {
  return c
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div>
      <p className="text-meta text-indigo-700/70">{label}</p>
      <p className="mt-0.5 text-body text-indigo-950">{value}</p>
    </div>
  );
}

/**
 * AI-extracted data from the background workflow. Deliberately rendered as a
 * visually distinct, captioned block so it is never confused with the
 * user-entered / admin-confirmed submission fields.
 */
export function ExtractedInformation({
  extraction,
}: {
  extraction: SubmissionExtraction;
}) {
  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 p-6">
      <div className="mb-1 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-indigo-600" />
        <h3 className="text-card-label text-indigo-900">Extracted Information</h3>
      </div>
      <p className="mb-4 text-meta text-indigo-700/80">
        Automatically extracted by the workflow from the message/attachment. Not
        yet verified — confirm the values before approving.
      </p>

      <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
        <Field label="Classification" value={classificationLabel(extraction.classification)} />
        <Field label="Extracted amount" value={extraction.extractedAmount ? formatPkr(extraction.extractedAmount) : null} />
        <Field label="Payment method" value={extraction.extractedPaymentMethod} />
        <Field label="Slip / reference" value={extraction.slipRef} />
        <Field label="Merchant" value={extraction.merchant} />
        <Field label="Confidence" value={extraction.confidence} />
        <Field
          label="Bank email match"
          value={
            <span className="inline-flex items-center gap-1">
              {extraction.bankEmailMatch ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              ) : (
                <XCircle className="h-4 w-4 text-text-secondary" />
              )}
              {extraction.bankEmailMatch ? 'Matched' : 'No match'}
              {extraction.bankEmailMatch && extraction.bankEmailAmount
                ? ` · ${formatPkr(extraction.bankEmailAmount)}`
                : ''}
            </span>
          }
        />
      </div>

      {extraction.description && (
        <div className="mt-4">
          <Field label="Description" value={extraction.description} />
        </div>
      )}

      <p className="mt-4 text-meta text-indigo-700/60">
        {extraction.model ? `Model: ${extraction.model} · ` : ''}
        Extracted {formatDateTime(extraction.createdAt)}
      </p>
    </div>
  );
}

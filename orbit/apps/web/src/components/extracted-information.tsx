import { SubmissionExtraction } from '@/lib/types';
import { formatDateTime, formatPkr } from '@/lib/format';
import { CopyButton } from '@/components/ui/copy-button';
import { CheckCircle2, Sparkles } from 'lucide-react';

function classificationLabel(c: string): string {
  return c
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === '') return null;
  const copy = typeof value === 'string' ? value : undefined;
  return (
    <div className="group">
      <p className="text-meta text-indigo-700/70">{label}</p>
      <div className="mt-0.5 flex items-start gap-1.5">
        <p className="break-words text-body text-indigo-950">{value}</p>
        {copy && <CopyButton value={copy} className="mt-0.5 text-indigo-400 hover:bg-indigo-100 hover:text-indigo-700" />}
      </div>
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
  // Only fields with a real value — absent fields simply aren't rendered.
  const dynamicFields = (extraction.fields ?? []).filter(
    (f) => f && f.label && f.value != null && String(f.value).trim() !== '',
  );

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
        {extraction.confidence && <Field label="Confidence" value={extraction.confidence} />}

        {/* Dynamic fields — show exactly what the proof contained. */}
        {dynamicFields.map((f, i) => (
          <Field key={`${f.label}-${i}`} label={f.label} value={f.value} />
        ))}

        {/* Fallback for older rows that predate dynamic fields. */}
        {!dynamicFields.length && (
          <>
            <Field label="Amount" value={extraction.extractedAmount ? formatPkr(extraction.extractedAmount) : null} />
            <Field label="Payment method" value={extraction.extractedPaymentMethod} />
            <Field label="Slip / reference" value={extraction.slipRef} />
            <Field label="Merchant" value={extraction.merchant} />
          </>
        )}

        {extraction.bankEmailMatch && (
          <Field
            label="Bank email match"
            value={
              <span className="inline-flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                Matched
                {extraction.bankEmailAmount ? ` · ${formatPkr(extraction.bankEmailAmount)}` : ''}
              </span>
            }
          />
        )}
      </div>

      {!dynamicFields.length && extraction.description && (
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

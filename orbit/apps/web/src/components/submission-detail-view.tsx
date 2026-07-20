'use client';

import { useState } from 'react';
import { HistoryEvent, Submission } from '@/lib/types';
import {
  formatDate,
  formatDateTime,
  formatPkr,
  paymentTypeLabel,
  requestTypeLabel,
  shortRef,
} from '@/lib/format';
import { ExtractedInformation } from '@/components/extracted-information';
import { SourceBadge } from '@/components/source-badge';
import { SubmissionEditForm } from '@/components/submission-edit-form';
import { ImageViewer } from '@/components/image-viewer';
import { StatusBadge } from '@/components/status-badge';
import { StatusTimeline } from '@/components/status-timeline';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { Download, Pencil, Sparkles } from 'lucide-react';

/** Read-only field with a copy-to-clipboard affordance (when the value is text). */
function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  const copy = typeof value === 'string' && value !== '—' ? value : undefined;
  return (
    <div className="group">
      <p className="text-meta text-text-secondary">{label}</p>
      <div className="mt-0.5 flex items-start gap-1.5">
        <p className="break-words text-body text-text-primary">{value || '—'}</p>
        {copy && copy.trim() !== '' && <CopyButton value={copy} className="mt-0.5" />}
      </div>
    </div>
  );
}

/**
 * Presentational. Pages fetch the data and pass an `actions` node (admin review
 * buttons / RO resubmit button) rendered in the header.
 */
export function SubmissionDetailView({
  submission,
  history,
  actions,
  canEdit = false,
  onUpdated,
}: {
  submission: Submission;
  history: HistoryEvent[];
  actions?: React.ReactNode;
  /** Admin-only: enables inline editing of the request's information. */
  canEdit?: boolean;
  onUpdated?: (s: Submission) => void;
}) {
  const [editing, setEditing] = useState(false);
  const attachment = submission.attachment;
  const isImage = attachment?.mimeType?.startsWith('image/');
  const isFinalized = submission.status === 'APPROVED' || submission.status === 'REJECTED';
  const showEdit = canEdit && !isFinalized;
  const rejection =
    submission.status === 'REJECTED'
      ? [...history].reverse().find((h) => h.toStatus === 'REJECTED' && h.submissionId === submission.id)
      : undefined;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Main */}
      <div className="space-y-6 lg:col-span-2">
        <div className="rounded-lg border border-border bg-surface p-6">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <StatusBadge status={submission.status} />
                <SourceBadge source={submission.source} />
              </div>
              <h2 className="text-section">{shortRef(submission.id)}</h2>
              <p className="text-meta text-text-secondary">
                {submission.ro?.name} · submitted by {submission.submittedBy?.fullName}
                {submission.senderRef ? ` (${submission.senderRef})` : ''}
              </p>
            </div>
            {(actions || (showEdit && !editing)) && (
              <div className="flex items-center gap-2">
                {showEdit && !editing && (
                  <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
                    <Pencil className="h-4 w-4" /> Edit
                  </Button>
                )}
                {!editing && actions}
              </div>
            )}
          </div>

          {submission.enrichmentStatus === 'PENDING' && (
            <div className="mb-5 flex items-center gap-2 rounded-md border border-indigo-200 bg-indigo-50 p-3 text-meta text-indigo-700">
              <Sparkles className="h-4 w-4 animate-pulse" />
              Analyzing attachment in the background — extracted information will appear shortly.
            </div>
          )}
          {submission.enrichmentStatus === 'FAILED' && (
            <div className="mb-5 rounded-md border border-amber-200 bg-amber-50 p-3 text-meta text-amber-700">
              Automated extraction could not be completed for this request.
            </div>
          )}

          {rejection?.reason && (
            <div className="mb-5 rounded-md border border-red-200 bg-red-50 p-3">
              <p className="text-card-label text-status-rejected">Rejection reason</p>
              <p className="mt-0.5 text-body text-status-rejected">{rejection.reason}</p>
            </div>
          )}

          {editing ? (
            <SubmissionEditForm
              submission={submission}
              onCancel={() => setEditing(false)}
              onSaved={(s) => {
                setEditing(false);
                onUpdated?.(s);
              }}
            />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
                <Detail label="Request type" value={requestTypeLabel(submission.requestType)} />
                <Detail label="Payment method" value={paymentTypeLabel(submission.paymentType)} />
                {submission.paymentTypeNote && (
                  <Detail label="Method note" value={submission.paymentTypeNote} />
                )}
                <Detail label="Amount" value={formatPkr(submission.amount)} />
                <Detail label="Payment date" value={formatDate(submission.paymentDate)} />
                <Detail label="Bank" value={submission.bankName} />
                <Detail label="Reference" value={submission.referenceNumber} />
                <Detail label="Submitted on" value={formatDate(submission.createdAt)} />
              </div>

              {submission.notes && (
                <div className="mt-4">
                  <Detail label="Notes" value={submission.notes} />
                </div>
              )}
            </>
          )}
        </div>

        {/* Extracted information (from the background workflow) */}
        {submission.extraction && (
          <ExtractedInformation extraction={submission.extraction} />
        )}

        {/* Attachment */}
        {attachment ? (
          <div className="rounded-lg border border-border bg-surface p-6">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-card-label text-text-primary">Attachment</h3>
              <a
                href={attachment.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-meta text-primary hover:underline"
              >
                <Download className="h-4 w-4" />
                {attachment.originalName ?? 'Download'}
              </a>
            </div>
            {isImage ? (
              <ImageViewer url={attachment.url} fileName={attachment.originalName} />
            ) : (
              <a
                href={attachment.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 rounded-md border border-border bg-bg px-4 py-3 text-body text-primary hover:bg-primary-light"
              >
                <Download className="h-5 w-5" /> Open PDF attachment
              </a>
            )}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border bg-surface p-6 text-meta text-text-secondary">
            No attachment — this request arrived as a text message through the
            workflow.
          </div>
        )}
      </div>

      {/* Timeline */}
      <div className="lg:col-span-1">
        <div className="rounded-lg border border-border bg-surface p-6">
          <h3 className="mb-4 text-card-label text-text-primary">Status timeline</h3>
          <StatusTimeline events={history} />
        </div>
      </div>
    </div>
  );
}

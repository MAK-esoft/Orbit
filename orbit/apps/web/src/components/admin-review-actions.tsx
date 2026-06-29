'use client';

import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Submission, SubmissionStatus } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Textarea } from '@/components/ui/textarea';
import { FormError } from '@/components/ui/field';
import { formatPkr } from '@/lib/format';

/** Status-dependent review actions (spec §9.3). */
export function AdminReviewActions({
  submission,
  onUpdated,
}: {
  submission: Submission;
  onUpdated: (s: Submission) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState('');
  // Workflow-originated requests may arrive without a confirmed amount; the
  // admin must set one before approving.
  const needsAmount = submission.amount === null;
  const [amount, setAmount] = useState(
    submission.extraction?.extractedAmount ?? '',
  );

  async function transition(status: SubmissionStatus, rejectReason?: string) {
    setBusy(true);
    setError(null);
    try {
      const updated = await api.patch<Submission>(
        `/submissions/${submission.id}/status`,
        { status, ...(rejectReason ? { reason: rejectReason } : {}) },
      );
      onUpdated(updated);
      setConfirmApprove(false);
      setRejectOpen(false);
      setReason('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Action failed. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    setBusy(true);
    setError(null);
    try {
      // If the amount is still unconfirmed, set it first via the admin edit.
      if (needsAmount) {
        const confirmed = await api.patch<Submission>(
          `/submissions/${submission.id}`,
          { amount: amount.trim() },
        );
        onUpdated(confirmed);
      }
      const updated = await api.patch<Submission>(
        `/submissions/${submission.id}/status`,
        { status: 'APPROVED' },
      );
      onUpdated(updated);
      setConfirmApprove(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Action failed. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const amountValid = !needsAmount || Number(amount) > 0;

  const terminal = submission.status === 'APPROVED' || submission.status === 'REJECTED';
  if (terminal) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {submission.status === 'SUBMITTED' && (
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() => transition('UNDER_REVIEW')}
        >
          Move to Under Review
        </Button>
      )}
      <Button size="sm" disabled={busy} onClick={() => setConfirmApprove(true)}>
        Approve
      </Button>
      <Button size="sm" variant="danger" disabled={busy} onClick={() => setRejectOpen(true)}>
        Reject
      </Button>

      {/* Approve confirmation */}
      <Modal
        open={confirmApprove}
        onClose={() => setConfirmApprove(false)}
        title="Approve this submission?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmApprove(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={approve} disabled={busy || !amountValid}>
              {busy ? 'Approving…' : 'Confirm approve'}
            </Button>
          </>
        }
      >
        <FormError message={error} />
        {needsAmount && (
          <div className="mb-4">
            <label className="mb-1 block text-card-label">
              Confirm amount (PKR) — required before approval
            </label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
            {submission.extraction?.extractedAmount && (
              <button
                type="button"
                className="mt-1 text-meta text-primary hover:underline"
                onClick={() => setAmount(submission.extraction!.extractedAmount!)}
              >
                Use extracted amount ({formatPkr(submission.extraction.extractedAmount)})
              </button>
            )}
          </div>
        )}
        <p className="text-body text-text-secondary">
          The submitting office will be notified. This is a terminal state and cannot be changed.
        </p>
      </Modal>

      {/* Reject with reason */}
      <Modal
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title="Reject submission"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRejectOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={busy || reason.trim().length < 10}
              onClick={() => transition('REJECTED', reason.trim())}
            >
              {busy ? 'Rejecting…' : 'Confirm reject'}
            </Button>
          </>
        }
      >
        <FormError message={error} />
        <label className="mb-1 block text-card-label">Reason (required, min 10 characters)</label>
        <Textarea
          rows={4}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Explain why this request is being rejected…"
        />
        <p className="mt-1 text-meta text-text-secondary">{reason.trim().length}/10 minimum</p>
      </Modal>
    </div>
  );
}

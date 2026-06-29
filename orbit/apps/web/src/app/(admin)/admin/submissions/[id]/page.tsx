'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { api } from '@/lib/api';
import { HistoryEvent, Submission } from '@/lib/types';
import { AdminReviewActions } from '@/components/admin-review-actions';
import { SubmissionDetailView } from '@/components/submission-detail-view';
import { LoadingBlock } from '@/components/ui/states';

export default function AdminSubmissionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [history, setHistory] = useState<HistoryEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  const ackedId = useRef<string | null>(null);

  const loadHistory = useCallback(async () => {
    setHistory(await api.get<HistoryEvent[]>(`/submissions/${id}/history`));
  }, [id]);

  useEffect(() => {
    // Run once per submission id (guards StrictMode double-invoke in dev).
    if (ackedId.current === id) return;
    ackedId.current = id;
    Promise.all([
      api.get<Submission>(`/submissions/${id}`),
      api.get<HistoryEvent[]>(`/submissions/${id}/history`),
    ])
      .then(async ([s, h]) => {
        // Auto-acknowledge: opening a new submission moves it to Under Review
        // so the RO sees it's being looked at, without a manual click (§9.3).
        if (s.status === 'SUBMITTED') {
          try {
            const updated = await api.patch<Submission>(
              `/submissions/${s.id}/status`,
              { status: 'UNDER_REVIEW' },
            );
            setSubmission(updated);
            setHistory(await api.get<HistoryEvent[]>(`/submissions/${id}/history`));
            return;
          } catch {
            // fall back to showing as-is if the transition fails
          }
        }
        setSubmission(s);
        setHistory(h);
      })
      .catch(() => setError('Could not load this submission.'));
  }, [id]);

  if (error) return <p className="py-16 text-center text-status-rejected">{error}</p>;
  if (!submission) return <LoadingBlock />;

  return (
    <div>
      <div className="mb-4">
        <button
          onClick={() => router.push('/admin/submissions')}
          className="inline-flex items-center gap-1.5 text-meta text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft className="h-4 w-4" /> Back to all submissions
        </button>
      </div>
      <SubmissionDetailView
        submission={submission}
        history={history}
        actions={
          <AdminReviewActions
            submission={submission}
            onUpdated={(s) => {
              setSubmission(s);
              loadHistory();
            }}
          />
        }
      />
    </div>
  );
}

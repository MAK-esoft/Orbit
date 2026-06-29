'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { HistoryEvent, Submission } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { LoadingBlock } from '@/components/ui/states';
import { SubmissionDetailView } from '@/components/submission-detail-view';

export default function RoSubmissionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [history, setHistory] = useState<HistoryEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<Submission>(`/submissions/${id}`),
      api.get<HistoryEvent[]>(`/submissions/${id}/history`),
    ])
      .then(([s, h]) => {
        setSubmission(s);
        setHistory(h);
      })
      .catch(() => setError('Could not load this submission.'));
  }, [id]);

  if (error) {
    return <p className="py-16 text-center text-status-rejected">{error}</p>;
  }
  if (!submission) return <LoadingBlock />;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <button
          onClick={() => router.push('/ro/submissions')}
          className="inline-flex items-center gap-1.5 text-meta text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft className="h-4 w-4" /> Back to submissions
        </button>
      </div>
      <SubmissionDetailView
        submission={submission}
        history={history}
        actions={
          submission.status === 'REJECTED' ? (
            <Link href={`/ro/submissions/${submission.id}/resubmit`}>
              <Button size="sm">
                <RefreshCw className="h-4 w-4" /> Resubmit
              </Button>
            </Link>
          ) : undefined
        }
      />
    </div>
  );
}

'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Submission } from '@/lib/types';
import { PageHeader } from '@/components/page-header';
import { SubmissionForm } from '@/components/submission-form';
import { LoadingBlock } from '@/components/ui/states';
import { shortRef } from '@/lib/format';

export default function ResubmitPage() {
  const { id } = useParams<{ id: string }>();
  const [original, setOriginal] = useState<Submission | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Submission>(`/submissions/${id}`)
      .then((s) => {
        if (s.status !== 'REJECTED') {
          setError('Only rejected submissions can be resubmitted.');
        }
        setOriginal(s);
      })
      .catch(() => setError('Could not load this submission.'));
  }, [id]);

  if (error) return <p className="py-16 text-center text-status-rejected">{error}</p>;
  if (!original) return <LoadingBlock />;

  return (
    <div>
      <PageHeader
        title="Resubmit Request"
        description={`Correcting ${shortRef(original.id)} — a new version will be created`}
      />
      <SubmissionForm mode="resubmit" submissionId={original.id} initial={original} />
    </div>
  );
}

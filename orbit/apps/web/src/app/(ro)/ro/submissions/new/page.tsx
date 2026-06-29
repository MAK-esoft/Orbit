import { PageHeader } from '@/components/page-header';
import { SubmissionForm } from '@/components/submission-form';

export default function NewSubmissionPage() {
  return (
    <div>
      <PageHeader
        title="New Request"
        description="Fields marked * are required"
      />
      <SubmissionForm mode="create" />
    </div>
  );
}

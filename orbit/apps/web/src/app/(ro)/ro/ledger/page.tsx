'use client';

import { LedgerView } from '@/components/ledger-view';
import { PageHeader } from '@/components/page-header';

export default function RoLedgerPage() {
  return (
    <div>
      <PageHeader
        title="Reports"
        description="Your statement with IRBAS — filter, sort, paginate and export to CSV"
      />
      <LedgerView
        canManage={false}
        submissionBasePath="/ro/submissions"
        storageKey="orbit.filters.roLedgerView"
      />
    </div>
  );
}

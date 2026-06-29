'use client';

import { LedgerView } from '@/components/ledger-view';
import { PageHeader } from '@/components/page-header';

export default function RoLedgerPage() {
  return (
    <div>
      <PageHeader
        title="Ledger"
        description="Your running statement with IRBAS — credits, debits and outstanding balance"
      />
      <LedgerView canManage={false} submissionBasePath="/ro/submissions" />
    </div>
  );
}

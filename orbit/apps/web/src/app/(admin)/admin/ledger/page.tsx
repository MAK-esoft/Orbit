'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { RegionalOffice } from '@/lib/types';
import { LedgerView } from '@/components/ledger-view';
import { PageHeader } from '@/components/page-header';
import { Select } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/states';

export default function AdminLedgerPage() {
  const [ros, setRos] = useState<RegionalOffice[]>([]);
  const [roId, setRoId] = useState<string>('');

  useEffect(() => {
    api.get<RegionalOffice[]>('/regional-offices').then((list) => {
      setRos(list);
      const fromUrl = new URLSearchParams(window.location.search).get('roId');
      if (fromUrl) setRoId(fromUrl);
      else if (list.length === 1) setRoId(list[0].id);
    });
  }, []);

  const selected = ros.find((r) => r.id === roId);

  return (
    <div>
      <PageHeader
        title="Ledger"
        description="Running statement per regional office — credits, debits and outstanding balance"
        action={
          <Select
            className="w-auto min-w-[200px]"
            value={roId}
            onChange={(e) => setRoId(e.target.value)}
          >
            <option value="">Select an office…</option>
            {ros.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        }
      />

      {roId ? (
        <>
          {selected && (
            <p className="mb-4 text-meta text-text-secondary">
              Showing ledger for <span className="text-text-primary">{selected.name}</span> ({selected.code})
            </p>
          )}
          <LedgerView
            key={roId}
            roId={roId}
            canManage
            submissionBasePath="/admin/submissions"
          />
        </>
      ) : (
        <div className="rounded-lg border border-border bg-surface">
          <EmptyState
            title="Select a regional office"
            message="Choose an office above to view its ledger and add credit or debit entries."
          />
        </div>
      )}
    </div>
  );
}

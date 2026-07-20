'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { RegionalOffice } from '@/lib/types';
import { usePersistentState } from '@/lib/use-persistent-state';
import { LedgerView } from '@/components/ledger-view';
import { PageHeader } from '@/components/page-header';
import { Select } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/states';

export default function AdminLedgerPage() {
  const [ros, setRos] = useState<RegionalOffice[]>([]);
  // Selected office persists per-browser; a roId in the URL overrides it.
  const [roId, setRoId, hydrated] = usePersistentState('orbit.filters.adminLedgerRoId', '');
  const appliedUrl = useRef(false);

  useEffect(() => {
    api.get<RegionalOffice[]>('/regional-offices').then((list) => {
      setRos(list);
      if (list.length === 1) setRoId(list[0].id);
    });
  }, [setRoId]);

  useEffect(() => {
    if (!hydrated || appliedUrl.current) return;
    appliedUrl.current = true;
    const fromUrl = new URLSearchParams(window.location.search).get('roId');
    if (fromUrl) setRoId(fromUrl);
  }, [hydrated, setRoId]);

  const selected = ros.find((r) => r.id === roId);

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Per-office ledger — filter, sort, paginate and export to CSV"
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
            storageKey="orbit.filters.adminLedgerView"
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

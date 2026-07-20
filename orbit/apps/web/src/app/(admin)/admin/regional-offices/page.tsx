'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api';

interface RegionalOffice {
  id: string;
  name: string;
  code: string;
  city: string | null;
  region: string | null;
  whatsappPhone: string | null;
  isActive: boolean;
  userCount: number;
}

const phoneRegex = /^[0-9+\-\s]*$/;

const schema = z.object({
  name: z.string().min(2, 'Required'),
  code: z
    .string()
    .min(2, 'Required')
    .regex(/^[A-Za-z0-9-]+$/, 'Letters, numbers and hyphens only'),
  city: z.string().optional(),
  region: z.string().optional(),
  whatsappPhone: z
    .string()
    .max(32, 'Too long')
    .regex(phoneRegex, 'Digits, +, spaces and dashes only')
    .optional(),
});
type FormValues = z.infer<typeof schema>;

export default function RegionalOfficesPage() {
  const router = useRouter();
  const [offices, setOffices] = useState<RegionalOffice[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [editingWa, setEditingWa] = useState<RegionalOffice | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function load() {
    setOffices(await api.get<RegionalOffice[]>('/regional-offices'));
  }
  useEffect(() => {
    load().catch(() => setOffices([]));
  }, []);

  async function toggleActive(o: RegionalOffice) {
    const verb = o.isActive ? 'Deactivate' : 'Activate';
    if (!confirm(`${verb} ${o.name}? ${o.isActive ? 'New submissions will be blocked.' : ''}`))
      return;
    await api.patch(`/regional-offices/${o.id}`, { isActive: !o.isActive }).catch(() => {});
    await load();
  }

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      await api.post('/regional-offices', values);
      reset();
      setShowForm(false);
      await load();
    } catch (e) {
      setServerError(e instanceof ApiError ? e.message : 'Failed to create office');
    }
  }

  return (
    <div>
      <PageHeader
        title="Regional Offices"
        description="Manage offices and their users"
        action={
          <Button onClick={() => setShowForm((s) => !s)}>
            {showForm ? 'Cancel' : 'New office'}
          </Button>
        }
      />

      {showForm && (
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="mb-6 grid grid-cols-1 gap-4 rounded-lg border border-border bg-surface p-5 md:grid-cols-2"
        >
          {serverError && (
            <div className="md:col-span-2 rounded-md bg-red-50 px-3 py-2 text-meta text-status-rejected">
              {serverError}
            </div>
          )}
          <Field label="Name" error={errors.name?.message}>
            <Input {...register('name')} placeholder="Lahore Regional Office" />
          </Field>
          <Field label="Code" error={errors.code?.message}>
            <Input {...register('code')} placeholder="RO-LHR-01" />
          </Field>
          <Field label="City">
            <Input {...register('city')} placeholder="Lahore" />
          </Field>
          <Field label="Region">
            <Input {...register('region')} placeholder="Punjab" />
          </Field>
          <Field label="WhatsApp number" error={errors.whatsappPhone?.message}>
            <Input {...register('whatsappPhone')} placeholder="e.g. 03012715214" />
            <p className="mt-1 text-meta text-text-secondary">
              Inbound WhatsApp proofs from this number are attributed to this office.
            </p>
          </Field>
          <div className="md:col-span-2">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creating…' : 'Create office'}
            </Button>
          </div>
        </form>
      )}

      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <table className="w-full text-body">
          <thead className="border-b border-border bg-bg text-meta uppercase text-text-secondary">
            <tr>
              <Th>Name</Th>
              <Th>Code</Th>
              <Th>City</Th>
              <Th>WhatsApp #</Th>
              <Th>Users</Th>
              <Th>Status</Th>
              <th className="px-4 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {offices === null ? (
              <tr>
                <td colSpan={7} className="p-6 text-center text-text-secondary">
                  Loading…
                </td>
              </tr>
            ) : offices.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-10 text-center text-text-secondary">
                  No regional offices yet. Create one to get started.
                </td>
              </tr>
            ) : (
              offices.map((o) => (
                <tr
                  key={o.id}
                  onClick={() => router.push(`/admin/submissions?roId=${o.id}`)}
                  className="cursor-pointer border-b border-border last:border-0 hover:bg-primary-light"
                  title="View this office's requests"
                >
                  <Td className="font-medium text-text-primary">{o.name}</Td>
                  <Td>{o.code}</Td>
                  <Td>{o.city ?? '—'}</Td>
                  <Td>
                    {o.whatsappPhone ? (
                      <span className="font-mono text-text-primary">{o.whatsappPhone}</span>
                    ) : (
                      <span className="text-text-secondary">—</span>
                    )}
                  </Td>
                  <Td>{o.userCount}</Td>
                  <Td>
                    <span
                      className={
                        o.isActive ? 'text-status-approved' : 'text-text-secondary'
                      }
                    >
                      {o.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </Td>
                  <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => setEditingWa(o)}
                      className="mr-3 text-meta text-primary hover:underline"
                    >
                      WhatsApp #
                    </button>
                    <button
                      onClick={() => router.push(`/admin/ledger?roId=${o.id}`)}
                      className="mr-3 text-meta text-primary hover:underline"
                    >
                      Ledger
                    </button>
                    <button
                      onClick={() => toggleActive(o)}
                      className="text-meta text-primary hover:underline"
                    >
                      {o.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {editingWa && (
        <WhatsAppEditModal
          office={editingWa}
          onClose={() => setEditingWa(null)}
          onSaved={async () => {
            setEditingWa(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

function WhatsAppEditModal({
  office,
  onClose,
  onSaved,
}: {
  office: RegionalOffice;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [value, setValue] = useState(office.whatsappPhone ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const trimmed = value.trim();
    if (trimmed && !phoneRegex.test(trimmed)) {
      setError('Digits, +, spaces and dashes only');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/regional-offices/${office.id}`, { whatsappPhone: trimmed });
      await onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save WhatsApp number');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-card-title text-text-primary">WhatsApp number</h2>
        <p className="mt-1 text-meta text-text-secondary">
          {office.name} — inbound WhatsApp proofs from this number are attributed to this
          office. Leave blank to unassign.
        </p>
        {error && (
          <div className="mt-3 rounded-md bg-red-50 px-3 py-2 text-meta text-status-rejected">
            {error}
          </div>
        )}
        <div className="mt-4">
          <Input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="e.g. 03012715214"
            onKeyDown={(e) => {
              if (e.key === 'Enter') save();
            }}
          />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-card-label">{label}</label>
      {children}
      {error && <p className="mt-1 text-meta text-status-rejected">{error}</p>}
    </div>
  );
}

const Th = ({ children }: { children: React.ReactNode }) => (
  <th className="px-4 py-2 text-left font-medium">{children}</th>
);
const Td = ({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) => <td className={`px-4 py-3 text-text-secondary ${className}`}>{children}</td>;

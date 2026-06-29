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
  isActive: boolean;
  userCount: number;
}

const schema = z.object({
  name: z.string().min(2, 'Required'),
  code: z
    .string()
    .min(2, 'Required')
    .regex(/^[A-Za-z0-9-]+$/, 'Letters, numbers and hyphens only'),
  city: z.string().optional(),
  region: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

export default function RegionalOfficesPage() {
  const router = useRouter();
  const [offices, setOffices] = useState<RegionalOffice[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
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
              <Th>Users</Th>
              <Th>Status</Th>
              <th className="px-4 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {offices === null ? (
              <tr>
                <td colSpan={6} className="p-6 text-center text-text-secondary">
                  Loading…
                </td>
              </tr>
            ) : offices.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-10 text-center text-text-secondary">
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

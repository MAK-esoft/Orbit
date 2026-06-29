'use client';

import { useEffect, useState } from 'react';
import { KeyRound, UserPlus, UserX } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { CurrentUser, RegionalOffice, Role, UserRow } from '@/lib/types';
import { formatDate } from '@/lib/format';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Field, FormError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { EmptyState, TableSkeleton } from '@/components/ui/states';

export default function UsersPage() {
  const [me, setMe] = useState<CurrentUser | null>(null);
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [ros, setRos] = useState<RegionalOffice[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    setUsers(await api.get<UserRow[]>('/users'));
  }
  useEffect(() => {
    api.get<CurrentUser>('/auth/me').then(setMe).catch(() => {});
    api.get<RegionalOffice[]>('/regional-offices').then(setRos).catch(() => setRos([]));
    load().catch(() => setUsers([]));
  }, []);

  const isSuperAdmin = me?.role === 'SUPER_ADMIN';

  async function deactivate(u: UserRow) {
    if (!confirm(`Deactivate ${u.fullName}? They will be signed out and blocked from logging in.`))
      return;
    await api.del(`/users/${u.id}`).catch(() => {});
    await load();
  }

  async function resetPassword(u: UserRow) {
    await api.post(`/users/${u.id}/reset-password`).catch(() => {});
    setNotice(`Password reset email sent to ${u.email}.`);
  }

  return (
    <div>
      <PageHeader
        title="Users"
        description="Admins and regional office users"
        action={
          <Button onClick={() => setCreateOpen(true)}>
            <UserPlus className="h-4 w-4" /> New user
          </Button>
        }
      />

      {notice && (
        <div className="mb-4 rounded-md bg-primary-light px-3 py-2 text-meta text-primary">
          {notice}
        </div>
      )}

      <div className="rounded-lg border border-border bg-surface">
        {users === null ? (
          <TableSkeleton cols={6} />
        ) : users.length === 0 ? (
          <EmptyState title="No users yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-body">
              <thead className="border-b border-border bg-bg text-meta uppercase text-text-secondary">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Name</th>
                  <th className="px-4 py-2.5 text-left font-medium">Email</th>
                  <th className="px-4 py-2.5 text-left font-medium">Role</th>
                  <th className="px-4 py-2.5 text-left font-medium">Office</th>
                  <th className="px-4 py-2.5 text-left font-medium">Status</th>
                  <th className="px-4 py-2.5 text-left font-medium">Last login</th>
                  <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium text-text-primary">{u.fullName}</td>
                    <td className="px-4 py-3 text-text-secondary">{u.email}</td>
                    <td className="px-4 py-3 text-text-secondary">
                      {u.role.replace('_', ' ').toLowerCase()}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {u.regionalOffice?.name ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          u.isActive ? 'text-status-approved' : 'text-text-secondary'
                        }
                      >
                        {u.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-meta text-text-secondary">
                      {u.lastLoginAt ? formatDate(u.lastLoginAt) : 'Never'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => resetPassword(u)}
                          title="Send password reset"
                          className="rounded p-1.5 text-text-secondary hover:bg-bg hover:text-primary"
                        >
                          <KeyRound className="h-4 w-4" />
                        </button>
                        {isSuperAdmin && u.isActive && u.id !== me?.id && (
                          <button
                            onClick={() => deactivate(u)}
                            title="Deactivate"
                            className="rounded p-1.5 text-text-secondary hover:bg-bg hover:text-status-rejected"
                          >
                            <UserX className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CreateUserModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        ros={ros}
        isSuperAdmin={!!isSuperAdmin}
        onCreated={() => {
          setCreateOpen(false);
          setNotice('User created — a setup email has been sent.');
          load();
        }}
      />
    </div>
  );
}

function CreateUserModal({
  open,
  onClose,
  ros,
  isSuperAdmin,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  ros: RegionalOffice[];
  isSuperAdmin: boolean;
  onCreated: () => void;
}) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('RO_USER');
  const [roId, setRoId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api.post('/users', {
        fullName,
        email,
        role,
        ...(role === 'RO_USER' ? { roId } : {}),
      });
      setFullName('');
      setEmail('');
      setRole('RO_USER');
      setRoId('');
      onCreated();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not create user.');
    } finally {
      setBusy(false);
    }
  }

  const valid =
    fullName.trim() && /\S+@\S+\.\S+/.test(email) && (role !== 'RO_USER' || roId);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create user"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !valid}>
            {busy ? 'Creating…' : 'Create & send setup link'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormError message={error} />
        <Field label="Full name" required>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </Field>
        <Field label="Email" required>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Role" required>
          <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="RO_USER">RO User</option>
            {isSuperAdmin && <option value="ADMIN">Admin</option>}
            {isSuperAdmin && <option value="SUPER_ADMIN">Super Admin</option>}
          </Select>
        </Field>
        {role === 'RO_USER' && (
          <Field label="Regional office" required>
            <Select value={roId} onChange={(e) => setRoId(e.target.value)}>
              <option value="">Select an office…</option>
              {ros
                .filter((r) => r.isActive)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
            </Select>
          </Field>
        )}
      </div>
    </Modal>
  );
}

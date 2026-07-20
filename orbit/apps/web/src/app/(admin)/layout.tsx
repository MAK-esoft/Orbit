import { AuthenticatedLayout } from '@/components/authenticated-layout';
import { NavItem } from '@/components/app-shell';

const ADMIN_NAV: NavItem[] = [
  { href: '/admin/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { href: '/admin/submissions', label: 'Requests', icon: 'submissions' },
  { href: '/admin/ledger', label: 'Reports', icon: 'reports' },
  { href: '/admin/regional-offices', label: 'Offices', icon: 'ros' },
  { href: '/admin/users', label: 'Users', icon: 'users' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthenticatedLayout allow={['ADMIN', 'SUPER_ADMIN']} nav={ADMIN_NAV}>
      {children}
    </AuthenticatedLayout>
  );
}

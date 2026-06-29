import { AuthenticatedLayout } from '@/components/authenticated-layout';
import { NavItem } from '@/components/app-shell';

const RO_NAV: NavItem[] = [
  { href: '/ro/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { href: '/ro/submissions', label: 'Requests', icon: 'submissions' },
  { href: '/ro/submissions/new', label: 'New', icon: 'new' },
  { href: '/ro/ledger', label: 'Ledger', icon: 'ledger' },
];

export default function RoLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthenticatedLayout allow={['RO_USER']} nav={RO_NAV}>
      {children}
    </AuthenticatedLayout>
  );
}

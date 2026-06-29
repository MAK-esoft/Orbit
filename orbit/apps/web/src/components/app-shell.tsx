'use client';

import {
  Bell,
  Building2,
  FilePlus2,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Scale,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { CurrentUser } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Logo } from './logo';
import { NotificationBell } from './notification-bell';

export interface NavItem {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
}

const ICONS = {
  dashboard: LayoutDashboard,
  submissions: ListChecks,
  new: FilePlus2,
  ros: Building2,
  users: Users,
  ledger: Scale,
  notifications: Bell,
};

/** Sidebar + top bar shell. Collapses to a bottom tab bar on mobile (<768px). */
export function AppShell({
  user,
  nav,
  children,
}: {
  user: CurrentUser;
  nav: NavItem[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await api.post('/auth/logout').catch(() => {});
    router.replace('/login');
  }

  const roleLabel =
    user.role === 'RO_USER' ? 'Regional Office' : user.role.replace('_', ' ');

  return (
    <div className="flex min-h-screen bg-bg">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-border bg-surface md:flex">
        <div className="px-5 py-5">
          <Logo />
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {nav.map((item) => {
            const Icon = ICONS[item.icon];
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-card-label',
                  active
                    ? 'bg-primary-light text-primary'
                    : 'text-text-secondary hover:bg-bg hover:text-text-primary',
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border p-3">
          <div className="mb-2 px-2">
            <p className="truncate text-card-label text-text-primary">{user.fullName}</p>
            <p className="truncate text-meta capitalize text-text-secondary">
              {roleLabel.toLowerCase()}
            </p>
          </div>
          <button
            onClick={logout}
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-card-label text-text-secondary hover:bg-bg hover:text-status-rejected"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col md:pl-60">
        <header className="sticky top-0 z-10 flex h-14 items-center justify-end gap-3 border-b border-border bg-surface px-4 md:px-6">
          <NotificationBell basePath={user.role === 'RO_USER' ? '/ro' : '/admin'} />
        </header>
        <main className="flex-1 px-4 pb-24 pt-6 md:px-6 md:pb-8">{children}</main>
      </div>

      {/* Mobile bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-border bg-surface md:hidden">
        {nav.slice(0, 5).map((item) => {
          const Icon = ICONS[item.icon];
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-1 flex-col items-center gap-0.5 py-2 text-meta',
                active ? 'text-primary' : 'text-text-secondary',
              )}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

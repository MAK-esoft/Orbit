'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { CurrentUser, Role } from '@/lib/types';
import { AppShell, NavItem } from './app-shell';

/**
 * Fetches the current user, enforces the allowed roles for this portal, and
 * renders the shell. Redirects to /login if unauthenticated, or to the user's
 * own portal if they hit the wrong one.
 */
export function AuthenticatedLayout({
  allow,
  nav,
  children,
}: {
  allow: Role[];
  nav: NavItem[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    let active = true;
    api
      .get<CurrentUser>('/auth/me')
      .then((u) => {
        if (!active) return;
        if (!allow.includes(u.role)) {
          router.replace(u.role === 'RO_USER' ? '/ro/dashboard' : '/admin/dashboard');
          return;
        }
        setUser(u);
      })
      .catch(() => router.replace('/login'));
    return () => {
      active = false;
    };
  }, [allow, router]);

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-meta text-text-secondary">
        Loading…
      </div>
    );
  }

  return (
    <AppShell user={user} nav={nav}>
      {children}
    </AppShell>
  );
}

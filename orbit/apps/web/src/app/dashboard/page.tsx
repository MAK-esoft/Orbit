'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { api } from '@/lib/api';
import { CurrentUser } from '@/lib/types';

/** Role-aware entry: routes the user to their portal's dashboard. */
export default function DashboardRouter() {
  const router = useRouter();
  useEffect(() => {
    api
      .get<CurrentUser>('/auth/me')
      .then((u) =>
        router.replace(u.role === 'RO_USER' ? '/ro/dashboard' : '/admin/dashboard'),
      )
      .catch(() => router.replace('/login'));
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center text-meta text-text-secondary">
      Loading…
    </div>
  );
}

'use client';

import { Bell, Check, CheckCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Notification } from '@/lib/types';
import { api } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';

const POLL_MS = 30_000;

/** Bell + unread badge + right-side slide-in drawer (spec §11.4). */
export function NotificationBell({ basePath }: { basePath: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);

  // Poll unread count (lightweight) every 30s.
  const pollUnread = useCallback(async () => {
    try {
      const { meta } = await api.page<Notification[]>('/notifications?unread=true');
      setUnread((meta?.unreadCount as number) ?? 0);
    } catch {
      /* ignore transient errors */
    }
  }, []);

  useEffect(() => {
    pollUnread();
    const t = setInterval(pollUnread, POLL_MS);
    return () => clearInterval(t);
  }, [pollUnread]);

  async function openDrawer() {
    setOpen(true);
    try {
      const { data, meta } = await api.page<Notification[]>('/notifications');
      setItems(data ?? []);
      setUnread((meta?.unreadCount as number) ?? 0);
    } catch {
      setItems([]);
    }
  }

  async function onClickItem(n: Notification) {
    if (!n.isRead) {
      await api.patch(`/notifications/${n.id}/read`).catch(() => {});
      setItems((prev) => prev.map((i) => (i.id === n.id ? { ...i, isRead: true } : i)));
      setUnread((u) => Math.max(0, u - 1));
    }
    setOpen(false);
    if (n.submissionId) router.push(`${basePath}/submissions/${n.submissionId}`);
  }

  async function markAll() {
    await api.patch('/notifications/read-all').catch(() => {});
    setItems((prev) => prev.map((i) => ({ ...i, isRead: true })));
    setUnread(0);
  }

  return (
    <>
      <button
        onClick={openDrawer}
        className="relative rounded-md p-2 text-text-secondary hover:bg-bg"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-status-rejected px-1 text-[10px] font-semibold text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/20" />
          <div
            className="relative flex h-full w-full max-w-sm flex-col bg-surface shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h3 className="text-section">Notifications</h3>
              <button
                onClick={markAll}
                className="inline-flex items-center gap-1 text-meta text-primary hover:underline"
              >
                <CheckCheck className="h-4 w-4" /> Mark all read
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {items.length === 0 ? (
                <p className="px-4 py-16 text-center text-meta text-text-secondary">
                  You&apos;re all caught up.
                </p>
              ) : (
                items.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => onClickItem(n)}
                    className={cn(
                      'flex w-full flex-col gap-0.5 border-b border-border px-4 py-3 text-left hover:bg-bg',
                      !n.isRead && 'bg-primary-light/50',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-card-label text-text-primary">
                        {!n.isRead && (
                          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                        )}
                        {n.title}
                      </span>
                      <span className="shrink-0 text-meta text-text-secondary">
                        {timeAgo(n.createdAt)}
                      </span>
                    </div>
                    {n.body && (
                      <span className="text-meta text-text-secondary">{n.body}</span>
                    )}
                    {n.isRead && (
                      <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-text-secondary">
                        <Check className="h-3 w-3" /> Read
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

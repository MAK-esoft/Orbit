'use client';

import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import { Select } from './ui/select';
import { cn } from '@/lib/utils';

const PAGE_SIZES = [10, 25, 50, 100];

function IconBtn({
  disabled,
  onClick,
  children,
  title,
}: {
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={title}
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface text-text-secondary transition',
        disabled ? 'opacity-40' : 'hover:bg-primary-light hover:text-text-primary',
      )}
    >
      {children}
    </button>
  );
}

/**
 * Client-side pager: row-count selector, first/prev/next/last, and a
 * go-to-page input. Callers slice their own data with `page`/`pageSize`.
 */
export function TablePager({
  page,
  pageSize,
  total,
  onPage,
  onPageSize,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), totalPages);
  const start = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const end = Math.min(current * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-meta text-text-secondary">
      <div className="flex items-center gap-2">
        <span>Rows per page</span>
        <Select
          className="h-8 w-auto py-0"
          value={String(pageSize)}
          onChange={(e) => onPageSize(Number(e.target.value))}
        >
          {PAGE_SIZES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <span className="ml-1">
          {start}–{end} of {total}
        </span>
      </div>

      <div className="flex items-center gap-1">
        <IconBtn title="First page" disabled={current <= 1} onClick={() => onPage(1)}>
          <ChevronsLeft className="h-4 w-4" />
        </IconBtn>
        <IconBtn title="Previous" disabled={current <= 1} onClick={() => onPage(current - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </IconBtn>
        <span className="flex items-center gap-1 px-1">
          Page
          <input
            type="number"
            min={1}
            max={totalPages}
            value={current}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (!Number.isNaN(n)) onPage(Math.min(Math.max(1, n), totalPages));
            }}
            className="w-12 rounded-md border border-border bg-surface px-2 py-1 text-center text-text-primary focus-visible:border-primary focus-visible:outline-none"
          />
          of {totalPages}
        </span>
        <IconBtn title="Next" disabled={current >= totalPages} onClick={() => onPage(current + 1)}>
          <ChevronRight className="h-4 w-4" />
        </IconBtn>
        <IconBtn title="Last page" disabled={current >= totalPages} onClick={() => onPage(totalPages)}>
          <ChevronsRight className="h-4 w-4" />
        </IconBtn>
      </div>
    </div>
  );
}

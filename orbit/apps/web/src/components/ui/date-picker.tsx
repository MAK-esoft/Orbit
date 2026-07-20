'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';

// --- date helpers (work in local time on 'YYYY-MM-DD' strings) --------------
const pad = (n: number) => String(n).padStart(2, '0');
const toYMD = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYMD = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const fmt = (s: string) =>
  parseYMD(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const addDays = (s: string, n: number) => {
  const d = parseYMD(s);
  d.setDate(d.getDate() + n);
  return toYMD(d);
};
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export interface DateRange {
  from: string;
  to: string;
}

/**
 * One picker for both a single date and a date range. Single mode: one click
 * selects and closes. Range mode: first click sets the start (a valid single
 * day on its own), a second click completes the range; quick presets included.
 */
export function DateRangePicker({
  from,
  to,
  onChange,
  mode = 'range',
  max,
  min,
  placeholder = 'All dates',
  className,
}: {
  from: string;
  to: string;
  onChange: (range: DateRange) => void;
  mode?: 'single' | 'range';
  /** Latest selectable day ('YYYY-MM-DD'); later days are disabled. */
  max?: string;
  min?: string;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const today = toYMD(new Date());
  const initial = from || to || today;
  const [view, setView] = useState(() => {
    const d = parseYMD(initial);
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  // Close on outside click / Escape; reset the range anchor + view on open.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    const d = parseYMD(from || to || today);
    setView({ y: d.getFullYear(), m: d.getMonth() });
    setAnchor(null);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const label = useMemo(() => {
    if (mode === 'single') return from ? fmt(from) : placeholder;
    if (!from && !to) return placeholder;
    if (from && to && from !== to) return `${fmt(from)} – ${fmt(to)}`;
    return fmt(from || to);
  }, [from, to, mode, placeholder]);

  const hasValue = mode === 'single' ? !!from : !!(from || to);

  function pick(ymd: string) {
    if (mode === 'single') {
      onChange({ from: ymd, to: ymd });
      setOpen(false);
      return;
    }
    if (anchor === null) {
      setAnchor(ymd);
      onChange({ from: ymd, to: ymd });
    } else {
      const lo = ymd < anchor ? ymd : anchor;
      const hi = ymd < anchor ? anchor : ymd;
      onChange({ from: lo, to: hi });
      setAnchor(null);
      setOpen(false);
    }
  }

  function applyPreset(f: string, t: string) {
    onChange({ from: f, to: t });
    setAnchor(null);
    setOpen(false);
  }

  function clear() {
    onChange({ from: '', to: '' });
    setAnchor(null);
    setOpen(false);
  }

  // Calendar grid for the viewed month.
  const firstOffset = (new Date(view.y, view.m, 1).getDay() + 6) % 7; // Mon-first
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (string | null)[] = [
    ...Array(firstOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => toYMD(new Date(view.y, view.m, i + 1))),
  ];

  const presets: { label: string; from: string; to: string }[] = [
    { label: 'Today', from: today, to: today },
    { label: 'Yesterday', from: addDays(today, -1), to: addDays(today, -1) },
    { label: 'Last 7 days', from: addDays(today, -6), to: today },
    { label: 'Last 30 days', from: addDays(today, -29), to: today },
    { label: 'This month', from: toYMD(new Date(view.y, view.m, 1)), to: today },
  ];

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex h-10 w-full items-center gap-2 rounded-md border border-border bg-surface px-3 text-left text-body',
          hasValue ? 'text-text-primary' : 'text-text-secondary',
          'focus-visible:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary',
        )}
      >
        <Calendar className="h-4 w-4 shrink-0 text-text-secondary" />
        <span className="flex-1 truncate">{label}</span>
        {hasValue && (
          <span
            role="button"
            tabIndex={-1}
            title="Clear"
            onClick={(e) => {
              e.stopPropagation();
              clear();
            }}
            className="shrink-0 rounded p-0.5 text-text-secondary hover:bg-primary-light hover:text-text-primary"
          >
            <X className="h-3.5 w-3.5" />
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 z-50 mt-1 flex flex-col gap-3 rounded-lg border border-border bg-surface p-3 shadow-lg sm:flex-row">
          {mode === 'range' && (
            <div className="flex shrink-0 flex-row flex-wrap gap-1 sm:w-32 sm:flex-col">
              {presets.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => applyPreset(p.from, p.to)}
                  className="rounded-md px-2 py-1 text-left text-meta text-text-secondary hover:bg-primary-light hover:text-text-primary"
                >
                  {p.label}
                </button>
              ))}
              <button
                type="button"
                onClick={clear}
                className="rounded-md px-2 py-1 text-left text-meta text-text-secondary hover:bg-primary-light hover:text-text-primary"
              >
                All dates
              </button>
            </div>
          )}

          <div className="w-[252px]">
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setView((v) => (v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 }))}
                className="rounded p-1 text-text-secondary hover:bg-primary-light hover:text-text-primary"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-card-label text-text-primary">
                {MONTHS[view.m]} {view.y}
              </span>
              <button
                type="button"
                onClick={() => setView((v) => (v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 }))}
                className="rounded p-1 text-text-secondary hover:bg-primary-light hover:text-text-primary"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-0.5 text-center text-meta text-text-secondary">
              {WEEKDAYS.map((w) => (
                <div key={w} className="py-1">{w}</div>
              ))}
              {cells.map((ymd, i) => {
                if (!ymd) return <div key={`e${i}`} />;
                const disabled = (!!max && ymd > max) || (!!min && ymd < min);
                const isStart = ymd === from;
                const isEnd = ymd === to;
                const inRange = mode === 'range' && from && to && ymd > from && ymd < to;
                const selected = isStart || isEnd;
                return (
                  <button
                    key={ymd}
                    type="button"
                    disabled={disabled}
                    onClick={() => pick(ymd)}
                    className={cn(
                      'h-8 rounded-md text-body transition-colors',
                      disabled && 'cursor-not-allowed text-text-secondary/30',
                      !disabled && !selected && !inRange && 'text-text-primary hover:bg-primary-light',
                      inRange && 'bg-primary-light text-text-primary',
                      selected && 'bg-primary font-medium text-white',
                      ymd === today && !selected && 'ring-1 ring-inset ring-border',
                    )}
                  >
                    {parseYMD(ymd).getDate()}
                  </button>
                );
              })}
            </div>

            {mode === 'range' && anchor && (
              <p className="mt-2 text-center text-meta text-text-secondary">
                Pick an end date, or click the same day for a single date.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Single-date convenience wrapper around the unified picker. */
export function DatePicker({
  value,
  onChange,
  max,
  min,
  placeholder = 'Select date',
  className,
}: {
  value: string;
  onChange: (date: string) => void;
  max?: string;
  min?: string;
  placeholder?: string;
  className?: string;
}) {
  return (
    <DateRangePicker
      mode="single"
      from={value}
      to={value}
      onChange={(r) => onChange(r.from)}
      max={max}
      min={min}
      placeholder={placeholder}
      className={className}
    />
  );
}

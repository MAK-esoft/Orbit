'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Small inline "copy this value" affordance shown next to a field. Muted by
 * default, brightens on hover/focus, and flips to a green check for ~1.5s after
 * a successful copy. Stops propagation so it works inside clickable rows.
 */
export function CopyButton({
  value,
  className,
  size = 14,
}: {
  value: string | null | undefined;
  className?: string;
  size?: number;
}) {
  const [copied, setCopied] = useState(false);
  if (value === null || value === undefined || String(value).trim() === '') return null;

  async function copy(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(String(value));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (e.g. insecure context) — silently ignore.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={copied ? 'Copied!' : 'Copy'}
      aria-label={copied ? 'Copied' : 'Copy value'}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded p-0.5 align-middle transition-colors',
        copied
          ? 'text-emerald-600'
          : 'text-text-secondary/40 hover:bg-primary-light hover:text-text-primary',
        className,
      )}
    >
      {copied ? (
        <Check style={{ width: size, height: size }} />
      ) : (
        <Copy style={{ width: size, height: size }} />
      )}
    </button>
  );
}

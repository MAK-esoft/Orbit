import { cn } from '@/lib/utils';

/**
 * Orbit logomark — a core with a tilted orbital ring and an orbiting body.
 * Uses `currentColor` so it inherits text colour (white on the dark brand chip).
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <g transform="rotate(-28 16 16)">
        <ellipse
          cx="16"
          cy="16"
          rx="13"
          ry="6.2"
          stroke="currentColor"
          strokeWidth="2"
        />
        <circle cx="29" cy="16" r="2.4" fill="currentColor" />
      </g>
      <circle cx="16" cy="16" r="4.8" fill="currentColor" />
    </svg>
  );
}

/** Brand lockup: dark chip with the white mark + the "Orbit" wordmark. */
export function Logo({
  className,
  size = 'md',
}: {
  className?: string;
  size?: 'md' | 'lg';
}) {
  const chip = size === 'lg' ? 'h-11 w-11' : 'h-8 w-8';
  const mark = size === 'lg' ? 'h-7 w-7' : 'h-5 w-5';
  const word = size === 'lg' ? 'text-page-title' : 'text-section';
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <span
        className={cn(
          'flex items-center justify-center rounded-lg bg-primary',
          chip,
        )}
      >
        <LogoMark className={cn('text-white', mark)} />
      </span>
      <span className={cn('font-semibold tracking-tight text-text-primary', word)}>
        Orbit
      </span>
    </div>
  );
}

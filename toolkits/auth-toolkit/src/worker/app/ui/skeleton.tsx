import type { ReactNode } from 'react';
import { cx } from './cx.ts';

const pulse = 'bg-muted motion-safe:animate-pulse';

/** Holds the shape of what is loading. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      // Its own corners unless told others: two radii would race in the CSS.
      className={cx(
        'block',
        !className?.includes('rounded-') && 'rounded-md',
        pulse,
        className,
      )}
    />
  );
}

/**
 * Text not there yet, drawn as bars on the lines it will take: given the
 * words it will say, or ones as long, it is exactly as tall and as wide.
 */
export function SkeletonText({ children }: { children: ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'select-none rounded-md text-transparent [box-decoration-break:clone]',
        pulse,
      )}
    >
      {children}
    </span>
  );
}

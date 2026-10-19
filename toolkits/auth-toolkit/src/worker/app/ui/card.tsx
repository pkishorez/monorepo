import type { HTMLAttributes } from 'react';
import { cx } from './cx.ts';

/** A raised surface: hairline edge and a soft, layered shadow in light; an edge alone in dark. */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx(
        'rounded-2xl bg-surface shadow-(--shadow-raised)',
        className,
      )}
      {...props}
    />
  );
}

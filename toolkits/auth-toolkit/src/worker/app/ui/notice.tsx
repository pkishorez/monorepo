import { CircleAlert, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { cx } from './cx.ts';

/** Says what went wrong, or what to know before going on: icon and words, never colour alone. */
export function Notice({
  tone = 'error',
  children,
  className,
}: {
  tone?: 'error' | 'warning';
  children: ReactNode;
  className?: string;
}) {
  const Icon = tone === 'error' ? CircleAlert : TriangleAlert;
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cx(
        'flex gap-2.5 rounded-lg px-3 py-2.5 text-sm text-pretty',
        tone === 'error'
          ? 'bg-danger-soft text-danger'
          : 'bg-warning-soft text-warning',
        className,
      )}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

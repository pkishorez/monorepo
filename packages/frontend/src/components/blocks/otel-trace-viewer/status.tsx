import { cn } from '#lib/utils';

import type { OtelStatus } from './types';

export const STATUS_BG: Record<OtelStatus, string> = {
  success: 'bg-emerald-700 dark:bg-emerald-600',
  error: 'bg-red-700 dark:bg-red-600',
  running: 'bg-amber-600 dark:bg-amber-500',
  unset: 'bg-muted-foreground/60',
};

export const STATUS_RING: Record<OtelStatus, string> = {
  success: 'ring-emerald-700 dark:ring-emerald-600',
  error: 'ring-red-700 dark:ring-red-600',
  running: 'ring-amber-600 dark:ring-amber-500',
  unset: 'ring-muted-foreground/60',
};

export const STATUS_LEFT_BORDER: Record<OtelStatus, string> = {
  success: 'border-l-emerald-500 dark:border-l-emerald-400',
  error: 'border-l-red-500 dark:border-l-red-400',
  running: 'border-l-amber-400 dark:border-l-amber-300',
  unset: 'border-l-muted-foreground/30',
};

export function StatusDot({ status }: { status: OtelStatus }) {
  return (
    <span
      className={cn(
        'size-2 shrink-0 rounded-full',
        STATUS_BG[status],
        status === 'running' && 'animate-pulse',
      )}
    />
  );
}

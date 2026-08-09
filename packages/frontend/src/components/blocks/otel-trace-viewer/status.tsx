import { cn } from '#lib/utils';

import type { OtelStatus } from './trace-model';

export const STATUS_BG: Record<OtelStatus, string> = {
  success: 'bg-emerald-700 dark:bg-emerald-600',
  error: 'bg-destructive/80',
  running: 'bg-amber-500/75',
  unset: 'bg-muted-foreground/60',
};

export const STATUS_RING: Record<OtelStatus, string> = {
  success: 'ring-emerald-700 dark:ring-emerald-600',
  error: 'ring-destructive/80',
  running: 'ring-amber-500/75',
  unset: 'ring-muted-foreground/60',
};

export const STATUS_LEFT_BORDER: Record<OtelStatus, string> = {
  success: 'border-l-emerald-500 dark:border-l-emerald-400',
  error: 'border-l-destructive/70',
  running: 'border-l-amber-500/70',
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

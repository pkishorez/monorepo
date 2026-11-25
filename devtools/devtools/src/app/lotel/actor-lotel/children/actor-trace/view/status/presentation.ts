import type { OtelStatus } from '../../../../../services/telemetry/contract/index.js';

export const STATUS_BG: Record<OtelStatus, string> = {
  success: 'bg-emerald-700 dark:bg-emerald-600',
  error: 'bg-destructive/80',
  interrupted: 'bg-orange-600/70',
  running: 'bg-amber-500/75',
  unset: 'bg-muted-foreground/60',
};

export const LOG_DOT_CLASS = 'size-1 rounded-full ring-1 ring-white/90';

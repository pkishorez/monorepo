import { cn } from '@kestack/web-platform/ui/components/utils';
import { STATUS_BG, type OtelStatus } from '../../../trace-model/index.js';

/** A Span's or a Trace's status as a dot, pulsing while it runs. */
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

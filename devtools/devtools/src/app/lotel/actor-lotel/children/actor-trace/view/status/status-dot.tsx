import { cn } from '@kestack/web-platform/ui/components/utils';
import { STATUS_BG } from './presentation.js';
import type { OtelStatus } from '../../../../../services/telemetry/contract/index.js';

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

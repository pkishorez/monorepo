import type { Session } from '@kestack/ai-toolkit/api';
import {
  CircleAlertIcon,
  SquareIcon,
  TriangleAlertIcon,
} from '@kestack/web-platform/components/lucide';
import { RunningDot } from '../running-dot/index.ts';

/*
 * How a session stands, as one small mark beside its title: a breathing dot
 * while it runs, and how its last turn ended until the next one starts. Idle
 * shows nothing. A stop by the server is a warning: it was not asked for,
 * and the work may be half done.
 */

const LABEL: Record<Exclude<Session['status'], 'idle' | 'running'>, string> = {
  cancelled: 'Stopped by you',
  failed: 'Last turn failed',
  interrupted: 'Interrupted by the server stopping',
};

export function SessionStatus({
  status,
}: {
  readonly status: Session['status'];
}) {
  if (status === 'idle') return null;
  if (status === 'running') return <RunningDot />;
  const label = LABEL[status];
  const Icon =
    status === 'cancelled'
      ? SquareIcon
      : status === 'failed'
        ? CircleAlertIcon
        : TriangleAlertIcon;
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`inline-flex shrink-0 ${
        status === 'cancelled'
          ? 'text-muted-foreground'
          : status === 'failed'
            ? 'text-destructive'
            : 'text-warning'
      }`}
    >
      <Icon
        aria-hidden
        className={
          status === 'cancelled' ? 'size-2.5 fill-current' : 'size-3.5'
        }
      />
    </span>
  );
}

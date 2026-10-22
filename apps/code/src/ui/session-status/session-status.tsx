import type { Session } from '@kestack/ai-toolkit/api';
import {
  CircleAlertIcon,
  SquareIcon,
  TriangleAlertIcon,
} from '@kestack/web-platform/components/lucide';
import { RunningDot } from '../running-dot/index.ts';

/*
 * How a session stands, as one small mark beside its title, each in the
 * same square so a column of them lines up: a breathing dot while it runs,
 * and how its last turn ended until the next one starts. Idle shows
 * nothing, so the marks that remain stand out. A stop by the server is a
 * warning: it was not asked for, and the work may be half done.
 */

const LABEL: Record<Exclude<Session['status'], 'idle'>, string> = {
  running: 'Running',
  cancelled: 'Stopped by you',
  failed: 'Last turn failed',
  interrupted: 'Interrupted by the server stopping',
};

const box = 'inline-flex size-3.5 shrink-0 items-center justify-center';

export function SessionStatus({
  status,
}: {
  readonly status: Session['status'];
}) {
  if (status === 'idle') return null;
  const label = LABEL[status];
  if (status === 'running')
    return (
      <span className={box}>
        <RunningDot label={label} />
      </span>
    );
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`${box} ${
        status === 'cancelled'
          ? 'text-muted-foreground/80'
          : status === 'failed'
            ? 'text-destructive'
            : 'text-warning'
      }`}
    >
      {status === 'cancelled' ? (
        <SquareIcon aria-hidden className="size-2 fill-current" />
      ) : status === 'failed' ? (
        <CircleAlertIcon aria-hidden className="size-3.5" />
      ) : (
        <TriangleAlertIcon aria-hidden className="size-3.5" />
      )}
    </span>
  );
}

/** How many Background Jobs a session's agent runs; nothing when none. */
export function JobCount({ count }: { readonly count: number }) {
  if (count === 0) return null;
  const label = `${count} background job${count === 1 ? '' : 's'} running`;
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-foreground/[0.07] px-1 text-[10px] leading-none font-medium text-muted-foreground tabular-nums dark:bg-foreground/10"
    >
      {count}
    </span>
  );
}

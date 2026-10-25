import type { Session } from '@kestack/connect/code';
import { LoaderCircleIcon } from '@kestack/web-platform/ui/components/lucide';
import { cn } from '@kestack/web-platform/ui/components/utils';
import { ago, since } from '../time/index.ts';

/*
 * How a Session stands, as one short word at the right of its row: a
 * turning "Running" while it runs, still when motion is reduced; "Failed"
 * in red when its last Turn failed; "Interrupted" in amber when the
 * server's stopping cut it off; "Stopped" when you stopped it; a "New" pill
 * when it finished since you last looked; and otherwise, idle, how long
 * ago it was last active, quieter and in a letter or two (`5m`, `3h`), so
 * the title keeps the row. Each says what it means on hover and to a
 * screen reader.
 */

// A title's line tall, so beside one it sits level with it.
const word =
  'shrink-0 text-xs leading-5 font-medium whitespace-nowrap tabular-nums';

export function StatusWord({
  status,
  unseen,
  at,
}: {
  readonly status: Session['status'];
  /** Whether its last Turn ended since it was last open here. */
  readonly unseen: boolean;
  /** When it was last active. */
  readonly at: number;
}) {
  switch (status) {
    case 'running':
      return (
        <span
          title="Running"
          className={cn(word, 'flex items-center gap-1 text-muted-foreground')}
        >
          <LoaderCircleIcon
            aria-hidden
            className="size-3 animate-spin motion-reduce:animate-none"
          />
          Running
        </span>
      );
    case 'failed':
      return (
        <span title="Last turn failed" className={cn(word, 'text-destructive')}>
          Failed
        </span>
      );
    case 'interrupted':
      return (
        <span
          title="Interrupted by the server stopping"
          className={cn(word, 'text-warning')}
        >
          Interrupted
        </span>
      );
    case 'cancelled':
      return (
        <span
          title="Stopped by you"
          className={cn(word, 'text-muted-foreground/70')}
        >
          Stopped
        </span>
      );
    case 'idle':
      return unseen ? (
        <span
          title="Finished, not seen yet"
          className={cn(
            word,
            'rounded-full bg-sky-500/15 px-1.5 py-0.5 leading-4 text-sky-600 dark:text-sky-400',
          )}
        >
          New
        </span>
      ) : (
        <span
          title={new Date(at).toLocaleString()}
          className={cn(word, 'font-normal text-muted-foreground/70')}
        >
          <span aria-hidden>{since(at)}</span>
          <span className="sr-only">{ago(at)}</span>
        </span>
      );
  }
}

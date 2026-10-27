import type { Session } from '@kestack/connect/code';
import { LoaderCircleIcon } from '@kestack/web-platform/ui/components/lucide';
import { cn } from '@kestack/web-platform/ui/components/utils';
import { ago, since } from '../time/index.ts';

/*
 * How a Session stands, at the right of its row, as quietly as it can say
 * it, so the titles keep the sidebar: a small turning circle while it
 * runs, still when motion is reduced; a dot when it needs a look, blue
 * when it finished since you last looked, red when its last Turn failed,
 * amber when the server's stopping cut it off; and otherwise how long ago
 * it was last active, in a letter or two (`5m`, `3h`). Stopped by you
 * needs no mark: you know. Each says what it means on hover and to a
 * screen reader.
 */

// A title's line tall, so beside one it sits level with it.
const mark = 'flex h-5 shrink-0 items-center';

function Dot({
  tone,
  label,
}: {
  readonly tone: string;
  readonly label: string;
}) {
  return (
    <span title={label} className={mark}>
      <span aria-hidden className={cn('size-2 rounded-full', tone)} />
      <span className="sr-only">{label}</span>
    </span>
  );
}

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
  if (status === 'running')
    return (
      <span title="Running" className={cn(mark, 'text-muted-foreground')}>
        <LoaderCircleIcon
          aria-hidden
          className="size-3.5 animate-spin motion-reduce:animate-none"
        />
        <span className="sr-only">Running</span>
      </span>
    );
  if (status === 'failed')
    return <Dot tone="bg-destructive" label="Last turn failed" />;
  if (status === 'interrupted')
    return <Dot tone="bg-warning" label="Interrupted by the server stopping" />;
  if (unseen) return <Dot tone="bg-sky-500" label="Finished, not seen yet" />;
  return (
    <span
      title={`${status === 'cancelled' ? 'Stopped by you · ' : ''}${new Date(at).toLocaleString()}`}
      className={cn(mark, 'text-xs text-muted-foreground/70 tabular-nums')}
    >
      <span aria-hidden>{since(at)}</span>
      <span className="sr-only">
        {status === 'cancelled' ? 'Stopped, ' : ''}
        {ago(at)}
      </span>
    </span>
  );
}

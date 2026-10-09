import { useEffect, useRef } from 'react';
import type { Entry } from 'effect-oak';

const clock = (time: number) =>
  new Date(time).toLocaleTimeString([], { hour12: false });

const payloadOf = ({ _tag, ...payload }: { readonly _tag: string }) =>
  Object.keys(payload).length === 0 ? '' : JSON.stringify(payload);

const ROW =
  'grid w-full grid-cols-[2rem_minmax(0,1fr)_auto] items-baseline gap-x-2 px-4 py-2 text-left transition-colors duration-150 hover:bg-muted/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring';

/**
 * Every Message with what came of it and when, newest at the bottom. Row 0 is
 * the start, right after init. Runs of the same plain Message (a timer's
 * ticks) share one row. Clicking a row replays the app up to it; while
 * replaying, the current row is marked and later ones recede.
 */
export const LogPanel = ({
  log,
  at,
  onPick,
}: {
  readonly log: ReadonlyArray<Entry>;
  readonly at: number | null;
  /** Show the app after this many Messages; 0 is right after init. */
  readonly onPick: (at: number) => void;
}) => {
  const current = useRef<HTMLLIElement>(null);
  const end = useRef<HTMLLIElement>(null);
  useEffect(() => {
    (at === null ? end : current).current?.scrollIntoView({
      block: 'nearest',
    });
  }, [log.length, at]);

  const rowState = (position: number) =>
    at === position
      ? 'bg-primary/10 shadow-[inset_2px_0_0_var(--color-primary)]'
      : at !== null && position > at
        ? 'opacity-40'
        : '';

  return (
    <ol className="flex flex-col divide-y text-sm">
      <li ref={at === 0 ? current : undefined}>
        <button
          type="button"
          className={`${ROW} ${rowState(0)}`}
          onClick={() => onPick(0)}
        >
          <span className="text-xs text-muted-foreground tabular-nums">0</span>
          <span className="text-muted-foreground">
            Start <span className="text-xs">· every Node from its init</span>
          </span>
          <span />
        </button>
      </li>
      {runsOf(log).map(({ entry, first, last }) => {
        const count = last - first + 1;
        const holds = at !== null && at >= first && at <= last;
        const payload = payloadOf(entry.message);
        return (
          <li key={first} ref={holds ? current : undefined}>
            <button
              type="button"
              className={`${ROW} ${rowState(holds ? at : first)}`}
              onClick={() => onPick(last)}
            >
              <span className="text-xs text-muted-foreground tabular-nums">
                {first}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="flex min-w-0 items-baseline gap-2">
                  <span
                    className={
                      entry.outcome === 'handled'
                        ? 'font-medium'
                        : 'font-medium text-muted-foreground line-through decoration-muted-foreground/50'
                    }
                  >
                    {entry.message._tag}
                  </span>
                  {count > 1 && (
                    <span className="text-xs text-muted-foreground tabular-nums">
                      ×{count}
                    </span>
                  )}
                  <span className="truncate font-mono text-xs text-muted-foreground">
                    {entry.path}
                  </span>
                </span>
                <Outcome entry={entry} />
                {payload && (
                  <span className="truncate font-mono text-xs text-muted-foreground">
                    {payload}
                  </span>
                )}
              </span>
              <time className="text-xs text-muted-foreground tabular-nums">
                {clock(log[last - 1]!.time)}
              </time>
            </button>
          </li>
        );
      })}
      <li ref={end} aria-hidden />
    </ol>
  );
};

type Run = {
  readonly entry: Entry;
  /** Positions of the run's first and last Message (1-based). */
  readonly first: number;
  readonly last: number;
};

/** The same plain Message to the same Node, again and again (a timer), reads as one row. */
const runsOf = (log: ReadonlyArray<Entry>): ReadonlyArray<Run> => {
  const runs: Array<Run> = [];
  log.forEach((entry, index) => {
    const previous = runs.at(-1);
    const plain =
      entry.outcome === 'handled' &&
      entry.from === entry.to &&
      !payloadOf(entry.message);
    if (
      plain &&
      previous &&
      previous.last === index &&
      previous.entry.path === entry.path &&
      previous.entry.message._tag === entry.message._tag &&
      previous.entry.outcome === 'handled' &&
      previous.entry.from === previous.entry.to &&
      !payloadOf(previous.entry.message)
    ) {
      runs[runs.length - 1] = { ...previous, last: index + 1 };
    } else {
      runs.push({ entry, first: index + 1, last: index + 1 });
    }
  });
  return runs;
};

/** A Transition, or why a Message changed nothing. Plain updates say nothing. */
const Outcome = ({ entry }: { readonly entry: Entry }) => {
  if (entry.outcome === 'ignored') {
    return (
      <span className="text-xs text-muted-foreground">
        Ignored · {entry.from} has no rule for it
      </span>
    );
  }
  if (entry.outcome === 'dropped') {
    return (
      <span className="text-xs text-muted-foreground">
        Dropped · its Node was already gone
      </span>
    );
  }
  if (entry.from === entry.to) return null;
  return (
    <span className="text-xs text-primary">
      {entry.from} → {entry.to}
    </span>
  );
};

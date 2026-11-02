import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import { ChevronRightIcon } from 'lucide-react';
import { useContext } from 'react';
import type { Row } from '../../../rows/index.ts';
import { Folder, KINDS, StateMark, summary } from '../../../../tool/index.ts';
import { stateNow, useLive } from '../../../rows/index.ts';
import { Count } from '../../../../words/index.ts';

/*
 * A subagent as one line of its own: what it was asked to do, and, while
 * it runs, what it is doing now; done, how many steps it took. A tap opens
 * it whole in a drawer over the page (`drawers.tsx`), never here, so
 * the transcript stays one quiet column however much a subagent did.
 */

type SubagentRow = Extract<Row, { readonly kind: 'subagent' }>;

/** A subagent's steps: its tool calls and its own subagents. */
export const stepsOf = (row: SubagentRow) =>
  row.rows.filter((each) => each.kind === 'tool' || each.kind === 'subagent')
    .length;

/** What a running subagent is doing now, in a few words. */
export const doingOf = (row: SubagentRow, folder: string | null): string => {
  const now = [...row.rows]
    .reverse()
    .find(
      (each) =>
        (each.kind === 'tool' || each.kind === 'subagent') &&
        each.state === 'running',
    );
  if (now?.kind === 'tool') {
    const { verb, target } = summary(now.call, 'running', folder);
    return `${verb} ${target}`.trim();
  }
  if (now?.kind === 'subagent') return now.call.title || 'Asking a subagent';
  return stepsOf(row) === 0 ? 'Starting' : 'Working';
};

export function Subagent({
  row,
  running,
}: {
  readonly row: SubagentRow;
  readonly running: boolean;
}) {
  const folder = useContext(Folder);
  const live = useLive();
  const state = stateNow(row, running, live);
  const steps = stepsOf(row);
  const title = row.call.title || 'Subagent';
  return (
    <li className="flex min-w-0 flex-col">
      <button
        type="button"
        onClick={() => live.open(row.id, live.depth)}
        aria-label={`Open the subagent: ${title}`}
        className="group focus-ring -mx-2 flex min-h-11 min-w-0 cursor-pointer items-center gap-2 rounded-md px-2 text-left text-sm transition-colors duration-150 hover:bg-muted/60 keyboard:min-h-8 motion-reduce:transition-none"
      >
        <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground [&_svg]:size-3.5">
          <KINDS.subagent.icon />
        </span>
        <span className="flex min-w-0 flex-1 items-baseline gap-2">
          <span className="min-w-0 shrink truncate" title={title}>
            {title}
          </span>
          {state === 'running' ? (
            <span className="flex min-w-0 flex-[0_1_auto] items-center gap-1.5 text-xs text-muted-foreground">
              <Spinner aria-hidden className="size-3 shrink-0" />
              <span className="truncate">{doingOf(row, folder)}…</span>
            </span>
          ) : null}
        </span>
        {state === 'done' ? (
          <span className="shrink-0 text-xs text-muted-foreground">
            <Count value={steps} /> {steps === 1 ? 'step' : 'steps'}
          </span>
        ) : state === 'running' ? (
          steps > 0 && (
            <span className="shrink-0 text-xs text-muted-foreground">
              <Count value={steps} />
            </span>
          )
        ) : (
          <StateMark state={state} />
        )}
        <ChevronRightIcon
          aria-hidden
          className="size-3.5 shrink-0 text-muted-foreground opacity-60 transition-[translate,opacity] duration-150 group-hover:translate-x-0.5 group-hover:opacity-100 motion-reduce:transition-none"
        />
      </button>
    </li>
  );
}

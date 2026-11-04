import { CheckIcon, ChevronRightIcon, SquareIcon, XIcon } from 'lucide-react';
import { useContext } from 'react';
import type { Row, ToolState } from '../../../rows/index.ts';
import { Folder, KINDS, summary } from '../../../../tool/index.ts';
import { stateNow, useLive } from '../../../rows/index.ts';
import { Count } from '../../../../words/index.ts';

/*
 * A subagent as two lines of its own: what it was asked to do, and under
 * it where it stands. Running, its icon turns in a ring and the line says
 * what it is doing now; done, a check and how many steps it took; stopped
 * or failed, a mark that says so, failed in red. A tap opens it whole
 * (`drawers.tsx`), never here, so the transcript stays one quiet column
 * however much a subagent did.
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

const WORD: Record<Exclude<ToolState, 'running'>, string> = {
  done: 'Done',
  failed: 'Failed',
  stopped: 'Stopped',
};

/** The mark on a subagent's icon, as it stands. */
function Badge({ state }: { readonly state: ToolState }) {
  if (state === 'running')
    return (
      <span
        aria-hidden
        className="absolute -inset-0.5 animate-spin rounded-full border-[1.5px] border-transparent border-t-foreground/70 [animation-duration:1.2s] motion-reduce:animate-none"
      />
    );
  const Mark =
    state === 'done' ? CheckIcon : state === 'failed' ? XIcon : SquareIcon;
  return (
    <span
      aria-hidden
      className={`absolute -right-1 -bottom-1 flex size-3.5 items-center justify-center rounded-full ring-2 ring-background ${
        state === 'done'
          ? 'bg-positive text-background'
          : state === 'failed'
            ? 'bg-destructive text-white'
            : 'bg-muted-foreground/70 text-background'
      }`}
    >
      <Mark
        className={state === 'stopped' ? 'size-1.5 fill-current' : 'size-2.5'}
        strokeWidth={3}
      />
    </span>
  );
}

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
  const said = state === 'running' ? `${doingOf(row, folder)}…` : WORD[state];
  return (
    <li className="flex min-w-0 flex-col">
      <button
        type="button"
        onClick={() => live.open(row.id, live.depth)}
        aria-label={`Open the subagent: ${title}, ${said}`}
        className="group focus-ring -mx-2 flex min-h-14 min-w-0 cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors duration-150 hover:bg-muted/60 motion-reduce:transition-none"
      >
        <span
          className={`relative flex size-7 shrink-0 items-center justify-center rounded-full bg-muted [&_svg]:size-3.5 ${state === 'running' ? 'text-foreground' : 'text-muted-foreground'}`}
        >
          <KINDS.subagent.icon />
          <Badge state={state} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span
            className={`truncate text-sm ${state === 'stopped' ? 'text-muted-foreground' : ''}`}
            title={title}
          >
            {title}
          </span>
          <span
            className={`flex min-w-0 items-center gap-1.5 text-xs ${state === 'failed' ? 'text-destructive' : 'text-muted-foreground'}`}
          >
            <span className="truncate">{said}</span>
            {steps > 0 && (
              <span className="shrink-0">
                <span aria-hidden>· </span>
                <Count value={steps} /> {steps === 1 ? 'step' : 'steps'}
              </span>
            )}
            {row.background && state === 'running' && (
              <span className="shrink-0 max-sm:hidden">
                · in the background
              </span>
            )}
          </span>
        </span>
        <ChevronRightIcon
          aria-hidden
          className="size-3.5 shrink-0 text-muted-foreground opacity-60 transition-[translate,opacity] duration-150 group-hover:translate-x-0.5 group-hover:opacity-100 motion-reduce:transition-none"
        />
      </button>
    </li>
  );
}

import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import { memo, useContext } from 'react';
import { Chevron, type Opening, useOpen } from '../../../words/index.ts';
import { type Row, sameItems } from '../../rows/index.ts';
import { Folder, KINDS, stateOf, summary } from '../../../tool/index.ts';
import { Steps } from './steps.tsx';
import { kindsOf, tally } from './tally.ts';

/*
 * Everything the agent did between two things it said, as one quiet line
 * that opens to the steps. Done, it counts the work up beside the icons of
 * the kinds of tool it used, how many steps failed, and whether any were
 * stopped. While it runs, it
 * says what the agent is doing now, a step at a time, so a long turn
 * never looks stuck. Open, every step in order.
 */

/** What the agent is doing now, in a few words, while the run is the live one. */
const nowOf = (rows: ReadonlyArray<Row>, folder: string | null): string => {
  const last = rows.at(-1);
  const call = [...rows]
    .reverse()
    .find((row) => row.kind === 'tool' && row.state === 'running');
  if (call?.kind === 'tool') {
    const { verb, target } = summary(call.call, 'running', folder);
    return `${verb} ${target}`.trim();
  }
  const subagent = [...rows]
    .reverse()
    .find((row) => row.kind === 'subagent' && row.state === 'running');
  if (subagent?.kind === 'subagent')
    return `A subagent is working: ${subagent.call.title}`;
  if (last?.kind === 'reasoning') return 'Thinking';
  return 'Working';
};

interface WorkProps {
  readonly id: string;
  readonly rows: ReadonlyArray<Row>;
  readonly opening: Opening;
  /** Whether the session runs. */
  readonly running: boolean;
  /** Whether this run of work is going on now: the last thing in a turn that runs, or a step of it still running. */
  readonly live: boolean;
}

/** Drawn again only as its steps, or whether it runs, change. */
export const Work = memo(
  WorkLine,
  (a, b) =>
    a.id === b.id &&
    a.opening === b.opening &&
    a.running === b.running &&
    a.live === b.live &&
    sameItems(a.rows, b.rows),
);

function WorkLine({ id, rows, opening, running, live }: WorkProps) {
  const folder = useContext(Folder);
  const open = useOpen(opening, id);
  const states = rows.flatMap((row) =>
    row.kind === 'tool' || row.kind === 'subagent'
      ? [stateOf(row.state, running)]
      : [],
  );
  const failed = states.filter((state) => state === 'failed').length;
  const stopped = !live && states.includes('stopped');
  const said = live ? nowOf(rows, folder) : tally(rows);
  return (
    <div className="flex min-w-0 flex-col">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => opening.toggle(id)}
        className="focus-ring -mx-2.5 flex min-h-11 max-w-[calc(100%+1.25rem)] items-center gap-2 self-start rounded-lg px-2.5 text-left text-sm text-muted-foreground transition-colors duration-150 hover:bg-muted/60 hover:text-foreground keyboard:min-h-9 motion-reduce:transition-none"
      >
        {live ? (
          <Spinner aria-hidden className="size-3.5 shrink-0" />
        ) : (
          <Icons rows={rows} />
        )}
        <span role={live ? 'status' : undefined} className="min-w-0 truncate">
          {said}
          {live && '…'}
        </span>
        {failed > 0 && (
          <span className="shrink-0 font-medium text-destructive">
            · {failed} failed
          </span>
        )}
        {stopped && <span className="shrink-0">· stopped</span>}
        <Chevron open={open} />
      </button>
      {open && (
        <div className="mt-1 ml-[7px] min-w-0 border-l border-border pl-4">
          <Steps rows={rows} opening={opening} running={running} />
        </div>
      )}
    </div>
  );
}

/** Up to three icons of the kinds of tool a run used, overlapping. */
function Icons({ rows }: { readonly rows: ReadonlyArray<Row> }) {
  const kinds = kindsOf(rows).slice(0, 3);
  if (kinds.length === 0) return null;
  return (
    <span aria-hidden className="flex shrink-0 -space-x-1">
      {kinds.map((kind) => {
        const Icon = KINDS[kind].icon;
        return (
          <span
            key={kind}
            className="grid size-5 place-items-center rounded-full bg-background ring-1 ring-border"
          >
            <Icon className="size-3" />
          </span>
        );
      })}
    </span>
  );
}

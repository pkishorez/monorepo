import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import { useContext } from 'react';
import {
  Chevron,
  type Opening,
  unlessSelecting,
  useOpen,
} from '../../../words/index.ts';
import type { Row } from '../../rows/index.ts';
import {
  Folder,
  KINDS,
  StateMark,
  stateOf,
  summary,
} from '../../../tool/index.ts';
import { Long } from '../../../words/index.ts';
import { Steps } from './steps.tsx';

/*
 * A subagent as a card of its own: what it was asked to do, and where it
 * stands, as its title, how many steps it took, or what it is doing now
 * while it runs. Shut, its report shows under it, its start only. Open,
 * its prompt, each step it took, and its report in full.
 */

type SubagentRow = Extract<Row, { readonly kind: 'subagent' }>;

export function Subagent({
  row,
  opening,
  running,
}: {
  readonly row: SubagentRow;
  readonly opening: Opening;
  readonly running: boolean;
}) {
  const folder = useContext(Folder);
  const id = `${row.id}:open`;
  const open = useOpen(opening, id);
  const toggle = () => opening.toggle(id);
  const state = stateOf(row.state, running);
  const first = row.rows[0];
  const prompt = first?.kind === 'prompt' ? first : undefined;
  const rows = prompt === undefined ? row.rows : row.rows.slice(1);
  const steps = rows.filter(
    (each) => each.kind === 'tool' || each.kind === 'subagent',
  ).length;
  const now = [...rows]
    .reverse()
    .find((each) => each.kind === 'tool' && each.state === 'running');
  const doing =
    state === 'running'
      ? now?.kind === 'tool'
        ? (() => {
            const { verb, target } = summary(now.call, 'running', folder);
            return `${verb} ${target}`;
          })()
        : steps === 0
          ? 'Starting…'
          : 'Working…'
      : null;
  const report = row.result;
  return (
    <li className="my-1.5 flex min-w-0 flex-col rounded-xl border border-border">
      <div
        onClick={unlessSelecting(toggle)}
        className="group flex min-h-12 cursor-pointer items-center gap-2.5 rounded-xl px-3 text-sm transition-colors duration-150 hover:bg-muted/40 keyboard:min-h-10 motion-reduce:transition-none"
      >
        <KINDS.subagent.icon className="size-4 shrink-0 text-muted-foreground" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-medium" title={row.call.title}>
            {row.call.title || 'Subagent'}
          </span>
          {doing && (
            <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
              <Spinner className="size-3 shrink-0" />
              <span className="truncate">{doing}</span>
            </span>
          )}
        </span>
        {state === 'running' ? null : state === 'done' ? (
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {steps === 1 ? 'One step' : `${steps} steps`}
          </span>
        ) : (
          <StateMark state={state} />
        )}
        <button
          type="button"
          aria-expanded={open}
          aria-label={open ? 'Hide the subagent' : 'Show the subagent'}
          onClick={(event) => {
            event.stopPropagation();
            toggle();
          }}
          className="focus-ring -mr-1 flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 group-hover:text-foreground hover:bg-muted keyboard:size-6"
        >
          <Chevron open={open} />
        </button>
      </div>
      {open && (
        <div className="flex min-w-0 flex-col gap-2 border-t border-border/70 px-3 py-2.5">
          {prompt?.kind === 'prompt' && (
            <div className="border-l-2 border-border pl-3 text-muted-foreground">
              <Long
                id={`${row.id}:prompt`}
                opening={opening}
                text={prompt.text}
                className="text-sm"
              />
            </div>
          )}
          <Steps rows={rows} opening={opening} running={running} />
        </div>
      )}
      {report && (
        <div
          className={`min-w-0 px-3 py-2.5 ${open ? 'pt-0' : 'border-t border-border/70'}`}
        >
          {open && (
            <span
              className={`mb-1 block text-xs font-medium ${report.isError ? 'text-destructive' : 'text-muted-foreground'}`}
            >
              {report.isError ? 'It failed' : 'Its report'}
            </span>
          )}
          <Long
            id={`${row.id}:report`}
            opening={opening}
            text={report.output}
            className={`text-sm ${open ? '' : 'text-muted-foreground [&_p]:my-0'} ${report.isError ? 'text-destructive' : ''}`}
          />
          {report.truncated && (
            <span className="text-xs text-muted-foreground">
              Report cut short
            </span>
          )}
        </div>
      )}
    </li>
  );
}

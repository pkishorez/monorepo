import { useContext, type ReactNode } from 'react';
import { Chevron, type Opening, unlessSelecting } from '../fold/index.ts';
import type { Row } from '../rows/index.ts';
import { Folder, reasonOf, summary } from './call/index.ts';
import { KINDS } from './kinds.ts';
import { StateMark, stateOf } from './state.tsx';

/*
 * One tool call as one line: its kind's icon, what it did in the tense of
 * where it stands ("Reading", "Read"), what it did it to, an edit's lines
 * added and removed, and its state; why it failed under it. Clicked, or
 * from its chevron, it opens to what its kind shows. Tall enough to tap on
 * a touch screen, a row of text with a keyboard.
 */

type ToolRow = Extract<Row, { readonly kind: 'tool' }>;

/** A line that opens: the shape a tool call and a group of them share. */
export function StepLine({
  id,
  opening,
  icon,
  hint,
  title,
  end,
  below,
  children,
}: {
  readonly id: string;
  readonly opening: Opening;
  readonly icon: ReactNode;
  /** The whole title, for when the line cuts it short. */
  readonly hint: string;
  readonly title: ReactNode;
  readonly end?: ReactNode;
  readonly below?: ReactNode;
  readonly children: ReactNode;
}) {
  const open = opening.isOpen(id);
  const toggle = () => opening.toggle(id);
  return (
    <li className="flex min-w-0 flex-col">
      <div
        onClick={unlessSelecting(toggle)}
        className="group -mx-2 flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 text-sm transition-colors duration-150 hover:bg-muted/60 keyboard:min-h-8 motion-reduce:transition-none"
      >
        <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground [&_svg]:size-3.5">
          {icon}
        </span>
        <span title={hint} className="min-w-0 flex-1 truncate">
          {title}
        </span>
        {end}
        <button
          type="button"
          aria-expanded={open}
          aria-label={`${open ? 'Hide' : 'Show'} ${hint}`}
          onClick={(event) => {
            event.stopPropagation();
            toggle();
          }}
          className="focus-ring -mr-1 flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 group-hover:text-foreground hover:bg-muted keyboard:size-6 motion-reduce:transition-none"
        >
          <Chevron open={open} />
        </button>
      </div>
      {below}
      {open && (
        <div className="mt-1 mb-3 flex min-w-0 flex-col gap-2 pl-6">
          {children}
        </div>
      )}
    </li>
  );
}

/** An edit's lines added and removed, green and red. */
function Lines({
  lines,
}: {
  readonly lines: { readonly added: number; readonly removed: number };
}) {
  if (lines.added === 0 && lines.removed === 0) return null;
  return (
    <span className="shrink-0 font-mono text-xs tabular-nums">
      {lines.added > 0 && <span className="text-positive">+{lines.added}</span>}
      {lines.added > 0 && lines.removed > 0 && ' '}
      {lines.removed > 0 && (
        <span className="text-destructive">−{lines.removed}</span>
      )}
    </span>
  );
}

export function ToolStep({
  row,
  opening,
  running,
}: {
  readonly row: ToolRow;
  readonly opening: Opening;
  readonly running: boolean;
}) {
  const folder = useContext(Folder);
  const kind = KINDS[row.call.tool];
  const state = stateOf(row.state, running);
  const { verb, target, code, lines } = summary(row.call, state, folder);
  const reason =
    state === 'failed' && row.result ? reasonOf(row.result.output) : '';
  return (
    <StepLine
      id={row.id}
      opening={opening}
      icon={<kind.icon />}
      hint={`${verb} ${target}`.trim()}
      title={
        <>
          {verb && <span className="text-muted-foreground">{verb} </span>}
          <span className={code ? 'font-mono text-xs' : ''}>{target}</span>
        </>
      }
      end={
        <>
          {lines && <Lines lines={lines} />}
          <StateMark state={state} />
        </>
      }
      below={
        reason && (
          <p className="truncate pl-6 text-xs text-destructive" title={reason}>
            {reason}
          </p>
        )
      }
    >
      <kind.Detail row={row} opening={opening} folder={folder} />
    </StepLine>
  );
}

import { XIcon } from '@kestack/web-platform/ui/components/lucide';
import { useContext } from 'react';
import type { Opening } from '../fold/index.ts';
import type { Row } from '../rows/index.ts';
import { Folder, groupTitle, summary } from './call/index.ts';
import { KINDS } from './kinds.ts';
import { StateMark, stateOf } from './state.tsx';
import { StepLine, ToolStep } from './step.tsx';

/** A run of calls of one kind as one line, "Read 3 files · a.ts, b.ts", that opens to each. */

type ToolRow = Extract<Row, { readonly kind: 'tool' }>;

export function ToolGroup({
  id,
  rows,
  opening,
  running,
}: {
  readonly id: string;
  readonly rows: ReadonlyArray<ToolRow>;
  readonly opening: Opening;
  readonly running: boolean;
}) {
  const folder = useContext(Folder);
  const kind = KINDS[rows[0]!.call.tool];
  const states = rows.map((row) => stateOf(row.state, running));
  const failed = states.filter((state) => state === 'failed').length;
  const targets = rows
    .map((row) => summary(row.call, 'done', folder).target)
    .join(', ');
  return (
    <StepLine
      id={id}
      opening={opening}
      icon={<kind.icon />}
      hint={`${groupTitle(rows)}: ${targets}`}
      title={
        <>
          <span>{groupTitle(rows)}</span>
          <span className="text-muted-foreground"> · {targets}</span>
        </>
      }
      end={
        states.includes('running') ? (
          <StateMark state="running" />
        ) : failed > 0 ? (
          <span className="flex shrink-0 items-center gap-1 text-xs text-destructive">
            <XIcon aria-hidden className="size-3.5" />
            {failed} failed
          </span>
        ) : states.includes('stopped') ? (
          <StateMark state="stopped" />
        ) : (
          <StateMark state="done" />
        )
      }
    >
      <ul className="-mt-1 flex flex-col">
        {rows.map((row) => (
          <ToolStep
            key={row.id}
            row={row}
            opening={opening}
            running={running}
          />
        ))}
      </ul>
    </StepLine>
  );
}

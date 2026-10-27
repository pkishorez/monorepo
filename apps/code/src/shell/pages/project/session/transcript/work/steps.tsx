import { BrainIcon } from '@kestack/web-platform/ui/components/lucide';
import type { Opening } from '../fold/index.ts';
import type { Row } from '../rows/index.ts';
import { isSaid, Said } from '../said/index.ts';
import { grouped, StepLine, ToolGroup, ToolStep } from '../tool/index.ts';
import { Writing } from '../words/index.ts';
import { Subagent } from './subagent.tsx';

/*
 * The steps a run of work took, in order, as lines: each tool call, a run
 * of calls of one kind folded into one, a thought, a subagent as a card of
 * its own, and, inside a subagent, what it said. A run that is nothing but
 * calls of one kind is not folded again: the line that opened it already
 * says "Ran 3 commands", so its calls show at once.
 */

/** Runs of one kind folded, unless that fold would be all there is. */
const itemsOf = (rows: ReadonlyArray<Row>) => {
  const items = grouped(rows);
  const only = items[0];
  return items.length === 1 && only?.kind === 'group'
    ? only.rows.map((row) => ({ kind: 'row' as const, row }))
    : items;
};

export function Steps({
  rows,
  opening,
  running,
}: {
  readonly rows: ReadonlyArray<Row>;
  readonly opening: Opening;
  readonly running: boolean;
}) {
  return (
    <ol className="flex min-w-0 flex-col">
      {itemsOf(rows).map((item) => {
        if (item.kind === 'group')
          return (
            <ToolGroup
              key={item.id}
              id={item.id}
              rows={item.rows}
              opening={opening}
              running={running}
            />
          );
        const { row } = item;
        if (row.kind === 'tool')
          return (
            <ToolStep
              key={row.id}
              row={row}
              opening={opening}
              running={running}
            />
          );
        if (row.kind === 'subagent')
          return (
            <Subagent
              key={row.id}
              row={row}
              opening={opening}
              running={running}
            />
          );
        if (row.kind === 'reasoning') {
          const thinking = row.writing && running;
          return (
            <StepLine
              key={row.id}
              id={row.id}
              opening={opening}
              icon={<BrainIcon />}
              hint={thinking ? 'Thinking' : 'Thought'}
              title={
                <span className="text-muted-foreground">
                  {thinking ? 'Thinking' : 'Thought'}
                </span>
              }
              end={thinking ? <Writing /> : undefined}
            >
              <p className="max-w-[68ch] text-sm leading-6 text-pretty whitespace-pre-wrap text-muted-foreground">
                {row.text}
              </p>
            </StepLine>
          );
        }
        if (isSaid(row))
          return (
            <li key={row.id} className="py-1">
              <Said row={row} running={running} nested />
            </li>
          );
        return null;
      })}
    </ol>
  );
}

import { CircleAlertIcon, ListChecksIcon } from 'lucide-react';
import type { Row } from '../rows/index.ts';
import { Checklist, Markdown, progressOf, Writing } from '../../words/index.ts';
import { Asked, stateOf } from '../../tool/index.ts';
import { askedOf } from '../../tool/parse/index.ts';

/*
 * What the agent says, as opposed to what it does: its words, in full
 * type, the newest part fading in while they stream, a breathing dot at
 * their end; a plan, as a small card of its steps; an error, in red with
 * its icon; and a note, such as the context compacted, as a quiet rule
 * across the column; and a question it asked you, with what you answered,
 * since asking is saying (`tool/`). Inside a subagent its words are a step
 * smaller.
 */

/** The agent's words; a row that is text or reasoning, narrowed to text. */
type TextRow = Extract<Row, { readonly kind: 'text' | 'reasoning' }> & {
  readonly kind: 'text';
};

type ToolRow = Extract<Row, { readonly kind: 'tool' }>;

export type SaidRow =
  | TextRow
  | Extract<Row, { readonly kind: 'plan' | 'error' | 'note' }>
  | ToolRow;

export const isSaid = (row: Row): row is SaidRow =>
  row.kind === 'text' ||
  row.kind === 'plan' ||
  row.kind === 'error' ||
  row.kind === 'note' ||
  (row.kind === 'tool' && askedOf(row.call, row.answered) !== null);

export function Said({
  row,
  running,
  nested = false,
}: {
  readonly row: SaidRow;
  /** Whether its turn runs, so words still marked as arriving are. */
  readonly running: boolean;
  /** Inside a subagent. */
  readonly nested?: boolean;
}) {
  switch (row.kind) {
    case 'text': {
      const writing = row.writing && running;
      return (
        <div className="flex min-w-0 flex-col">
          <Markdown
            text={row.text}
            className={`${nested ? 'text-sm text-muted-foreground' : 'text-base'} ${writing ? '[&>:last-child]:animate-chunk-in motion-reduce:[&>:last-child]:animate-none' : ''}`}
          />
          {writing && <Writing />}
        </div>
      );
    }
    case 'plan': {
      const steps = row.steps.map(({ step, status }) => ({
        text: step,
        status,
      }));
      return (
        <div className="flex w-full max-w-md flex-col gap-2.5 rounded-xl border border-border px-4 py-3">
          <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <ListChecksIcon aria-hidden className="size-3.5" />
            Plan
            <span className="ml-auto font-normal tabular-nums">
              {progressOf(steps)} done
            </span>
          </span>
          <Checklist steps={steps} />
        </div>
      );
    }
    case 'error':
      return (
        <p
          role="alert"
          className="flex items-start gap-2.5 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          <CircleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span className="min-w-0 break-words">{row.message}</span>
        </p>
      );
    case 'tool':
      return <Asked row={row} state={stateOf(row.state, running)} />;
    case 'note':
      return (
        <p className="flex items-center gap-3 text-xs text-muted-foreground">
          <span aria-hidden className="h-px flex-1 bg-border/70" />
          {row.label}
          <span aria-hidden className="h-px flex-1 bg-border/70" />
        </p>
      );
  }
}

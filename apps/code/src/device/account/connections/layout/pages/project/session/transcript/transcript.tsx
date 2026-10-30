import { GitForkIcon } from 'lucide-react';
import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import { useMemo } from 'react';
import { Chevron, type Opening } from './words/index.ts';
import { thread, type Earlier, type Row } from './turns/rows/index.ts';
import { Said } from './turns/answer/said.tsx';
import { Ask } from './turns/ask/ask.tsx';
import { Footer, type Forking, type Spend } from './turns/answer/footer.tsx';
import {
  piecesOf,
  saidIn,
  spendsOf,
  type Turn,
  turnsOf,
} from './turns/turns.ts';
import { Work } from './turns/answer/work/work.tsx';

/*
 * A session as a conversation, outcome first, its turns built from the
 * session's messages (`turns/rows/`). Your words are bubbles on the right
 * (`turns/ask/`); the agent answers on the left in full type
 * (`turns/answer/`). Everything it did between two things it said folds
 * into one quiet line that counts it up and opens to each step
 * (`turns/answer/work/`), each kind of tool drawn its own way (`tool/`);
 * while it runs, that line says what it is doing now. A turn ends with how
 * long it took, and a way to copy the answer or fork there, quiet until
 * you point at it. Text, folds and checklists are drawn alike throughout
 * (`words/`).
 *
 * Every word can be selected: a line opens on a click that selected
 * nothing, or from its chevron, which is the button a keyboard reaches.
 */

export function Rows({
  rows,
  opening,
  running,
  forking,
  forked = false,
}: {
  readonly rows: ReadonlyArray<Row>;
  readonly opening: Opening;
  /** Whether the session runs: a call left without a result while it does not was stopped. */
  readonly running: boolean;
  /** How to fork after a finished turn. */
  readonly forking?: Forking;
  /** A fork, whose first cost told holds what it was forked from. */
  readonly forked?: boolean;
}) {
  const turns = turnsOf(rows);
  const spends = spendsOf(turns, forked);
  return (
    <div className="flex min-w-0 flex-col gap-10">
      {turns.map((turn, at) => (
        <TurnView
          key={turn.id}
          turn={turn}
          opening={opening}
          running={running && turn.ended === null && at === turns.length - 1}
          sessionRunning={running}
          forking={forking}
          spend={spends.get(turn.id)}
        />
      ))}
    </div>
  );
}

function TurnView({
  turn,
  opening,
  running,
  sessionRunning,
  forking,
  spend,
}: {
  readonly turn: Turn;
  readonly opening: Opening;
  /** Whether this turn is the one running now. */
  readonly running: boolean;
  readonly sessionRunning: boolean;
  readonly forking: Forking | undefined;
  readonly spend: Spend | undefined;
}) {
  const pieces = piecesOf(turn.rows);
  const last = pieces.at(-1);
  // Running, with nothing on its way in sight: say it is working.
  const waiting =
    running &&
    (last === undefined ||
      last.kind === 'ask' ||
      (last.kind === 'said' &&
        !(last.row.kind === 'text' && last.row.writing) &&
        // A question says itself that it waits.
        last.row.kind !== 'tool'));
  return (
    <section className="group/turn flex min-w-0 flex-col gap-4">
      {turn.asks.map((ask) => (
        <Ask key={ask.id} row={ask} />
      ))}
      <div className="flex min-w-0 flex-col gap-3">
        {pieces.map((piece, at) =>
          piece.kind === 'ask' ? (
            // Sent while it worked, where it came in: as much room around
            // it as between turns.
            <div key={piece.row.id} className="py-1">
              <Ask row={piece.row} />
            </div>
          ) : piece.kind === 'work' ? (
            <Work
              key={piece.id}
              id={piece.id}
              rows={piece.rows}
              opening={opening}
              running={sessionRunning}
              live={
                running &&
                (at === pieces.length - 1 ||
                  piece.rows.some(
                    (row) =>
                      (row.kind === 'tool' || row.kind === 'subagent') &&
                      row.state === 'running',
                  ))
              }
            />
          ) : (
            <Said key={piece.row.id} row={piece.row} running={running} />
          ),
        )}
        {waiting && (
          <span
            role="status"
            className="flex min-h-11 items-center gap-2 text-sm text-muted-foreground keyboard:min-h-9"
          >
            <Spinner aria-hidden className="size-3.5" />
            {last === undefined ? 'Thinking…' : 'Working…'}
          </span>
        )}
        {turn.ended && (
          <Footer
            ended={turn.ended}
            said={saidIn(turn)}
            forking={forking}
            spend={spend}
          />
        )}
      </div>
    </section>
  );
}

/** What a Fork carries on from, folded into one line until opened. */
export function EarlierRows({
  title,
  earlier,
  opening,
  forking,
}: {
  /** The title of the Session forked. */
  readonly title: string;
  readonly earlier: Earlier;
  readonly opening: Opening;
  readonly forking?: Forking;
}) {
  const rows = useMemo(
    () => (earlier._tag === 'Read' ? thread(earlier.messages) : []),
    [earlier],
  );
  if (earlier._tag === 'Missing') return null;
  const id = 'earlier';
  const open = earlier._tag === 'Read' && opening.isOpen(id);
  const turns =
    earlier._tag === 'Read'
      ? ` · ${earlier.turns} turn${earlier.turns === 1 ? '' : 's'}`
      : '';
  return (
    <div className="flex flex-col gap-6">
      <button
        type="button"
        aria-expanded={open}
        disabled={earlier._tag !== 'Read'}
        onClick={() => opening.toggle(id)}
        className="focus-ring group -mx-2 flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 text-left text-sm text-muted-foreground transition-colors duration-150 hover:bg-muted/60 hover:text-foreground disabled:cursor-default disabled:hover:bg-transparent disabled:hover:text-muted-foreground keyboard:min-h-8 motion-reduce:transition-none"
      >
        <span className="flex size-4 shrink-0 items-center justify-center">
          {earlier._tag === 'Reading' ? (
            <Spinner className="size-3.5" />
          ) : (
            <Chevron open={open} />
          )}
        </span>
        <span className="min-w-0 flex-1 truncate">
          Earlier in <span className="text-foreground/80">{title}</span>
          <span className="tabular-nums">{turns}</span>
        </span>
      </button>
      {open && (
        <>
          <Rows
            rows={rows}
            opening={opening}
            running={false}
            forking={forking}
          />
          <div
            role="separator"
            className="flex items-center gap-2 text-xs text-muted-foreground"
          >
            <GitForkIcon aria-hidden className="size-3.5 shrink-0" />
            Forked here
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      )}
    </div>
  );
}

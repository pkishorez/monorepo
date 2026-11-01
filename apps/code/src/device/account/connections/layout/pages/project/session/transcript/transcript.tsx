import type { Message } from '@kestack/connect/code';
import { GitForkIcon } from 'lucide-react';
import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import { memo, useMemo, useRef } from 'react';
import { Block, useBlocks, useGroup } from '../scroller/index.ts';
import { Chevron, type Opening, useOpen } from './words/index.ts';
import {
  threaded,
  UNTHREADED,
  type Earlier,
  type Row,
} from './turns/rows/index.ts';
import { Said } from './turns/answer/said.tsx';
import { Ask } from './turns/ask/ask.tsx';
import { Footer, type Forking, type Spend } from './turns/answer/footer.tsx';
import {
  keptTurns,
  type Piece,
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
 *
 * However long it is, what changes is all that is drawn again: a row or a
 * turn stays the same object while nothing in it changes (`useRows`), and
 * a turn that did not change is not drawn again, so words streaming in
 * draw only the turn they are in. Each part of a turn, your words, each
 * thing the agent said, each line of its work and the turn's end, is a
 * block of the scroller it is drawn in (`../scroller/`): a long session
 * draws its last blocks, and more above as the reader scrolls up, so it
 * opens as fast as a short one, however long its turns.
 */

const NONE: ReadonlyArray<never> = [];

/**
 * A session's Messages as rows, each row the same object for as long as
 * nothing in it changes; only the turns whose Messages changed are
 * threaded again.
 */
export const useRows = (messages: ReadonlyArray<Message>) => {
  const before = useRef(UNTHREADED);
  return useMemo(
    () => (before.current = threaded(before.current, messages)).rows,
    [messages],
  );
};

/**
 * Room beside a block, and a turn, for what it draws past its edges, such
 * as a line's hover reaching into the margin, which a skippable turn's
 * containment would clip; the margin takes it back, so nothing moves.
 */
const BLEED = '-mx-3 px-3';

/** A turn's pieces, worked out once for each turn. */
const pieces = new WeakMap<Turn, ReadonlyArray<Piece>>();
const piecesIn = (turn: Turn) => {
  let found = pieces.get(turn);
  if (found === undefined) pieces.set(turn, (found = piecesOf(turn.rows)));
  return found;
};

const pieceId = (piece: Piece) =>
  piece.kind === 'work' ? piece.id : piece.row.id;

/** A turn's blocks, by id, in order: your words, its pieces, its end. */
const idsIn = (turn: Turn): ReadonlyArray<string> => [
  ...turn.asks.map(({ id }) => id),
  ...piecesIn(turn).map(pieceId),
  ...(turn.ended === null ? NONE : [turn.ended.id]),
];

export function Rows({
  rows,
  opening,
  running,
  forking,
  forked = false,
  whole = false,
}: {
  readonly rows: ReadonlyArray<Row>;
  readonly opening: Opening;
  /** Whether the session runs: a call left without a result while it does not was stopped. */
  readonly running: boolean;
  /** How to fork after a finished turn. */
  readonly forking?: Forking;
  /** A fork, whose first cost told holds what it was forked from. */
  readonly forked?: boolean;
  /** Every block drawn, as what a fork carries on from, which is opened by hand. */
  readonly whole?: boolean;
}) {
  const before = useRef<ReadonlyArray<Turn>>(NONE);
  const turns = useMemo(
    () => (before.current = keptTurns(before.current, turnsOf(rows))),
    [rows],
  );
  const spends = useMemo(() => spendsOf(turns, forked), [turns, forked]);
  const { order, counts } = useMemo(() => {
    const ids = turns.map(idsIn);
    return { order: ids.flat(), counts: ids.map(({ length }) => length) };
  }, [turns]);
  const { from, mark } = useBlocks(whole ? null : order);
  let start = 0;
  return (
    <div className="relative flex min-w-0 flex-col gap-10">
      {/* More above: drawn as the reader nears it. */}
      {mark && (
        <div
          ref={mark}
          data-more
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
        />
      )}
      {turns.map((turn, at) => {
        const count = counts[at]!;
        const hidden = Math.min(count, Math.max(0, from - start));
        start += count;
        return hidden === count && count > 0 ? null : (
          <TurnView
            key={turn.id}
            turn={turn}
            hidden={hidden}
            opening={opening}
            running={running && turn.ended === null && at === turns.length - 1}
            sessionRunning={running}
            forking={forking}
            spend={spends.get(turn.id)}
          />
        );
      })}
    </div>
  );
}

interface TurnProps {
  readonly turn: Turn;
  /** How many of its first blocks are not drawn yet. */
  readonly hidden: number;
  readonly opening: Opening;
  /** Whether this turn is the one running now. */
  readonly running: boolean;
  readonly sessionRunning: boolean;
  readonly forking: Forking | undefined;
  readonly spend: Spend | undefined;
}

/** A turn, drawn again only as what it shows changes. */
const TurnView = memo(
  function TurnView({
    turn,
    hidden,
    opening,
    running,
    sessionRunning,
    forking,
    spend,
  }: TurnProps) {
    const group = useGroup();
    const all = piecesIn(turn);
    const last = all.at(-1);
    // Running, with nothing on its way in sight: say it is working.
    const waiting =
      running &&
      (last === undefined ||
        last.kind === 'ask' ||
        (last.kind === 'said' &&
          !(last.row.kind === 'text' && last.row.writing) &&
          // A question says itself that it waits.
          last.row.kind !== 'tool'));
    const asks = turn.asks.slice(hidden);
    const shown = all.slice(Math.max(0, hidden - turn.asks.length));
    const skipped = all.length - shown.length;
    return (
      <section
        // Skipped as one, far from the view, once all of it is drawn.
        ref={hidden === 0 ? group : undefined}
        data-turn={turn.id}
        data-blocks
        className={`group/turn flex min-w-0 flex-col gap-4 ${BLEED}`}
      >
        {asks.map((ask) => (
          <Block key={ask.id} id={ask.id} className={BLEED}>
            <Ask row={ask} />
          </Block>
        ))}
        <div className="flex min-w-0 flex-col gap-3">
          {shown.map((piece, each) => {
            const at = skipped + each;
            return (
              <Block
                key={pieceId(piece)}
                id={pieceId(piece)}
                // Sent while it worked, where it came in: as much room
                // around it as between turns.
                className={piece.kind === 'ask' ? `${BLEED} py-1` : BLEED}
              >
                {piece.kind === 'ask' ? (
                  <Ask row={piece.row} />
                ) : piece.kind === 'work' ? (
                  <Work
                    id={piece.id}
                    rows={piece.rows}
                    opening={opening}
                    running={sessionRunning}
                    live={
                      running &&
                      (at === all.length - 1 ||
                        piece.rows.some(
                          (row) =>
                            (row.kind === 'tool' || row.kind === 'subagent') &&
                            row.state === 'running',
                        ))
                    }
                  />
                ) : (
                  <Said row={piece.row} running={running} />
                )}
              </Block>
            );
          })}
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
            <Block id={turn.ended.id} className={BLEED}>
              <Footer
                ended={turn.ended}
                said={saidIn(turn)}
                forking={forking}
                spend={spend}
              />
            </Block>
          )}
        </div>
      </section>
    );
  },
  (a, b) =>
    a.turn === b.turn &&
    a.hidden === b.hidden &&
    a.opening === b.opening &&
    a.running === b.running &&
    a.sessionRunning === b.sessionRunning &&
    a.forking === b.forking &&
    a.spend?.turn === b.spend?.turn &&
    a.spend?.total === b.spend?.total,
);

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
  const rows = useRows(earlier._tag === 'Read' ? earlier.messages : NONE);
  const id = 'earlier';
  const opened = useOpen(opening, id);
  if (earlier._tag === 'Missing') return null;
  const open = earlier._tag === 'Read' && opened;
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
            whole
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

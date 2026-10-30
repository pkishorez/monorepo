import type { Message } from '@kestack/connect/code';
import { GitForkIcon } from 'lucide-react';
import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import {
  memo,
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Chevron, type Opening, useOpen } from './words/index.ts';
import { kept, thread, type Earlier, type Row } from './turns/rows/index.ts';
import { Said } from './turns/answer/said.tsx';
import { Ask } from './turns/ask/ask.tsx';
import { Footer, type Forking, type Spend } from './turns/answer/footer.tsx';
import {
  keptTurns,
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
 * draw only the turn they are in. A long session opens on its last few
 * turns, drawn at once; the turns above them are drawn a batch at a time
 * after, nothing on the screen moving as they are (`gradual`). Until then
 * each stands in as an empty space as tall as it was when last drawn,
 * from any visit to it since the app started, or as a guess. Nothing drawn
 * is ever taken away again; `whole` draws every turn at once.
 */

const NONE: ReadonlyArray<never> = [];

/** A session's Messages as rows, each row the same object for as long as nothing in it changes. */
export const useRows = (messages: ReadonlyArray<Message>) => {
  const before = useRef<ReadonlyArray<Row>>(NONE);
  return useMemo(
    () => (before.current = kept(before.current, thread(messages))),
    [messages],
  );
};

/** Turns drawn at once on opening. */
const FIRST = 6;

/** Turns drawn above them in each step after. */
const BATCH = 10;

/** How tall a turn never drawn is guessed to be, in px. */
const GUESS = 480;

/** How many turns' heights are remembered. */
const REMEMBERED = 5000;

/** How tall each turn was when last drawn, by its id, for as long as the app runs. */
const heights = new Map<string, number>();

const remember = (id: string, height: number) => {
  heights.delete(id);
  heights.set(id, height);
  if (heights.size > REMEMBERED) heights.delete(heights.keys().next().value!);
};

/** The element a transcript scrolls in. */
const scrollerOf = (element: HTMLElement): HTMLElement | null => {
  for (let at = element.parentElement; at; at = at.parentElement) {
    const { overflowY } = getComputedStyle(at);
    if (overflowY === 'auto' || overflowY === 'scroll') return at;
  }
  return null;
};

interface Place {
  /** How far down what its scroller holds it starts, however it is scrolled. */
  readonly top: number;
  readonly height: number;
}

/** Where each turn in a list is, by its id, in order. */
const placesOf = (scroller: HTMLElement, list: HTMLElement) => {
  const base =
    list.getBoundingClientRect().top -
    scroller.getBoundingClientRect().top +
    scroller.scrollTop -
    list.offsetTop;
  const places = new Map<string, Place>();
  for (const child of list.children)
    if (child instanceof HTMLElement && child.dataset.turn !== undefined)
      places.set(child.dataset.turn, {
        top: base + child.offsetTop,
        height: child.offsetHeight,
      });
  return places;
};

export function Rows({
  rows,
  opening,
  running,
  forking,
  forked = false,
  gradual = false,
  whole = false,
  shift,
}: {
  readonly rows: ReadonlyArray<Row>;
  readonly opening: Opening;
  /** Whether the session runs: a call left without a result while it does not was stopped. */
  readonly running: boolean;
  /** How to fork after a finished turn. */
  readonly forking?: Forking;
  /** A fork, whose first cost told holds what it was forked from. */
  readonly forked?: boolean;
  /** Opens on its last turns, and draws those above them after. */
  readonly gradual?: boolean;
  /** Every turn drawn now, as before going to the top. */
  readonly whole?: boolean;
  /** Moves the view by as much as was drawn above it; else it is scrolled here. */
  readonly shift?: (by: number) => void;
}) {
  const before = useRef<ReadonlyArray<Turn>>(NONE);
  const turns = useMemo(
    () => (before.current = keptTurns(before.current, turnsOf(rows))),
    [rows],
  );
  const spends = useMemo(() => spendsOf(turns, forked), [turns, forked]);
  // The first turn drawn; those before it stand in as space until drawn.
  const [start, setStart] = useState(() =>
    gradual ? Math.max(0, turns.length - FIRST) : 0,
  );
  const from = whole ? 0 : start;
  const list = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLElement | null>(null);
  /** Where each turn was, by its id, as the last batch was drawn, while more are to come. */
  const placed = useRef<ReadonlyMap<string, Place> | null>(null);
  // A batch more, after each is drawn, as a Transition, so whatever the
  // reader does goes first.
  useEffect(() => {
    if (from === 0) return;
    const timer = setTimeout(
      () =>
        startTransition(() => setStart((start) => Math.max(0, start - BATCH))),
      0,
    );
    return () => clearTimeout(timer);
  }, [from]);
  // What a batch drew above the view moves nothing in it: the turn at its
  // top stays where it was on the screen. Read as each batch is drawn,
  // when the page is laid out for the screen anyway.
  useLayoutEffect(() => {
    const element = list.current;
    if (element === null) return;
    scroller.current ??= scrollerOf(element);
    const outer = scroller.current;
    if (outer === null) return;
    const before = placed.current;
    const now = placesOf(outer, element);
    if (before !== null) {
      for (const [id, place] of before) {
        if (place.top + place.height <= outer.scrollTop) continue;
        const moved = (now.get(id)?.top ?? place.top) - place.top;
        if (moved !== 0)
          if (shift) shift(moved);
          else outer.scrollTop += moved;
        break;
      }
    }
    placed.current = from === 0 ? null : now;
  }, [from]);
  // How tall each drawn turn is, for the next time it stands in.
  const [measure] = useState(() =>
    typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver((entries) => {
          for (const entry of entries) {
            const id = (entry.target as HTMLElement).dataset.turn;
            const height =
              entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
            if (id !== undefined && height > 0) remember(id, height);
          }
        }),
  );
  useEffect(() => () => measure?.disconnect(), [measure]);
  return (
    <div ref={list} className="flex min-w-0 flex-col gap-10">
      {turns.map((turn, at) =>
        at < from ? (
          <section
            key={turn.id}
            data-turn={turn.id}
            aria-hidden
            style={{ height: heights.get(turn.id) ?? GUESS }}
          />
        ) : (
          <TurnView
            key={turn.id}
            turn={turn}
            opening={opening}
            running={running && turn.ended === null && at === turns.length - 1}
            sessionRunning={running}
            forking={forking}
            spend={spends.get(turn.id)}
            measure={measure}
          />
        ),
      )}
    </div>
  );
}

interface TurnProps {
  readonly turn: Turn;
  readonly opening: Opening;
  /** Whether this turn is the one running now. */
  readonly running: boolean;
  readonly sessionRunning: boolean;
  readonly forking: Forking | undefined;
  readonly spend: Spend | undefined;
  /** Told how tall it is as that changes. */
  readonly measure: ResizeObserver | null;
}

/** A turn, drawn again only as what it shows changes. */
const TurnView = memo(
  function TurnView({
    turn,
    opening,
    running,
    sessionRunning,
    forking,
    spend,
    measure,
  }: TurnProps) {
    const pieces = useMemo(() => piecesOf(turn.rows), [turn.rows]);
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
    const measured = useCallback(
      (element: HTMLElement | null) => {
        if (element === null || measure === null) return;
        measure.observe(element);
        return () => measure.unobserve(element);
      },
      [measure],
    );
    return (
      <section
        ref={measured}
        data-turn={turn.id}
        className="group/turn flex min-w-0 flex-col gap-4"
      >
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
  },
  (a, b) =>
    a.turn === b.turn &&
    a.opening === b.opening &&
    a.running === b.running &&
    a.sessionRunning === b.sessionRunning &&
    a.forking === b.forking &&
    a.measure === b.measure &&
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

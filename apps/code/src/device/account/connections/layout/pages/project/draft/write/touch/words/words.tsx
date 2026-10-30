import { EditorView } from '@codemirror/view';
import { cn } from '@kestack/web-platform/ui/components/utils';
import { useEffect, useRef, type MouseEvent, type RefObject } from 'react';
import { useCaret } from './caret.ts';
import { Selecting, useEditDrag, wordAround } from './select.tsx';
import { SwipeZone, type Swipes } from './swipe.tsx';

/*
 * The Touch Draft's words, scrolling up and down inside their own height.
 *
 * 1. Read only  where a tap does not edit, it puts the caret where it
 *               lands, no keyboard raised, so the next Dictation goes
 *               there; a double tap selects the word, and a press held
 *               still selects it and drags out from it (`select.tsx`), so
 *               the next Dictation replaces it. With a selection, a tap
 *               leaves a cursor where it lands, and either end is dragged
 *               by its handle. Elsewhere a tap edits. An empty Draft's
 *               placeholder edits it. The caret is drawn, steady and lit,
 *               and kept in view (`caret.ts`), so text coming in shows; a
 *               selection, shaded the same blue over its lines' whole
 *               height, a handle at each end, its start's knob above and
 *               its end's below, and no caret besides.
 * 2. Editing    the Composer: the caret and a selection drawn as when read
 *               only, the editor's own hidden, so the two look alike; the
 *               caret stays in view as the words' size changes, as when
 *               the keyboard rises, if it was in view as editing began;
 *               else they stay where they were scrolled to. With Smart Displacement, the caret
 *               and the ends drag as when read only (`select.tsx`).
 * 3. Swipe      sideways, what `swipes` says for that way (`swipe.tsx`);
 *               a way it says nothing for goes on to the sidebar.
 */

/** Where the caret, or a selection's ends, are drawn. */
type Caret = ReturnType<typeof useCaret>['caret'];

/** How long, as editing begins, the words are kept where they were scrolled to, in ms: as long as the keyboard takes to rise. */
const KEEP = 800;

/** Two taps within this many ms, at one spot, are a double tap. */
const DOUBLE = 350;

/** What the words draw of the Draft's editor. */
type Editor = {
  /** The ref that moves the editor into the words. */
  readonly mount: (element: HTMLDivElement | null) => void;
  readonly view: RefObject<EditorView | null>;
  readonly placeholder: string;
  /** Nothing in it yet, nor a Dictation coming. */
  readonly empty: boolean;
};

export function Words({
  editor,
  editing,
  onEdit,
  tapEdits,
  swipes,
  onSwipeMove,
  oneLine = false,
  displace = false,
  className,
}: {
  readonly editor: Editor;
  readonly editing: boolean;
  readonly onEdit: () => void;
  /** A tap edits, rather than placing the caret. */
  readonly tapEdits: boolean;
  readonly swipes: Swipes;
  /** How far a Swipe has gone, in px, signed, as it goes; null once it ends. */
  readonly onSwipeMove: (offset: number | null) => void;
  /** Read only on one line, its start, fading out: no caret drawn. */
  readonly oneLine?: boolean;
  /** Smart Displacement: a caret or an end dragged sits above the finger (`select.tsx`). */
  readonly displace?: boolean;
  /** Its height and padding. */
  readonly className: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const { caret, moved } = useCaret(
    editor.view,
    // Editing, an empty Draft has its caret too.
    !oneLine && (editing || !editor.empty),
    inner,
  );

  // 1. Read only: a tap places the caret, or edits; a second tap there
  // soon after selects the word. A Swipe, or a press held to select,
  // took the press: the click that ends it is no tap.
  const swiped = useRef(false);
  const selects = !editing && !tapEdits;
  const last = useRef<{
    at: number;
    time: number;
    /** No selection as it was tapped. */
    empty: boolean;
  } | null>(null);
  const click = (event: MouseEvent) => {
    if (editing) return;
    if (swiped.current) return void (swiped.current = false);
    // A button in the words, such as Retry, is its own tap.
    if ((event.target as Element).closest('button') !== null) return;
    if (editor.empty) return onEdit();
    const view = editor.view.current;
    const at =
      view?.posAtCoords({ x: event.clientX, y: event.clientY }) ?? null;
    if (view !== null && at !== null) {
      const { empty } = view.state.selection.main;
      const before = last.current;
      const twice =
        selects &&
        before !== null &&
        event.timeStamp - before.time < DOUBLE &&
        Math.abs(at - before.at) <= 2;
      last.current = twice ? null : { at, time: event.timeStamp, empty };
      const word = wordAround(view, at);
      view.dispatch({
        selection: !selects
          ? { anchor: at }
          : twice
            ? // A double tap: a word from a cursor, a cursor from a selection.
              before.empty
              ? { anchor: word.from, head: word.to }
              : { anchor: at }
            : // A tap: a cursor there, a selection or not.
              { anchor: at },
      });
    }
    moved();
    if (tapEdits) onEdit();
  };
  useEffect(() => {
    const scroller = box.current;
    const content = inner.current;
    if (editing || caret === null || scroller === null || content === null)
      return;
    const top = caret.top + content.offsetTop;
    const bottom = top + caret.height;
    if (top < scroller.scrollTop) scroller.scrollTop = top - 4;
    else if (bottom > scroller.scrollTop + scroller.clientHeight)
      scroller.scrollTop = bottom - scroller.clientHeight + 4;
  }, [caret?.top, caret?.height]);

  // On one line, its start shows.
  useEffect(() => {
    if (oneLine && box.current !== null) box.current.scrollTop = 0;
  }, [oneLine]);

  // 2. Editing
  useEditDrag(box, editor.view, editing && displace);
  // As its size changes, the editor's caret stays in view, if it was in
  // view as editing began. If not, what was scrolled to stays, as the
  // keyboard rises and iOS would scroll to its caret, until the words are
  // touched or typed at.
  useEffect(() => {
    const scroller = box.current;
    const view = editor.view.current;
    if (!editing || scroller === null || view === null) return;
    const at = view.coordsAtPos(view.state.selection.main.head);
    const shown = scroller.getBoundingClientRect();
    let follows = at !== null && at.bottom > shown.top && at.top < shown.bottom;
    const top = scroller.scrollTop;
    let held = !follows;
    // Touched or typed at, the caret is followed from then on.
    const release = () => {
      held = false;
      follows = true;
    };
    scroller.addEventListener('pointerdown', release);
    scroller.addEventListener('keydown', release);
    const timer = setTimeout(() => void (held = false), KEEP);
    const keep = () => {
      if (held && scroller.scrollTop !== top) scroller.scrollTop = top;
    };
    scroller.addEventListener('scroll', keep);
    const observer = new ResizeObserver(() => {
      if (held) return keep();
      if (!follows) return;
      const now = editor.view.current;
      now?.dispatch({
        effects: EditorView.scrollIntoView(now.state.selection.main.head, {
          y: 'nearest',
          yMargin: 8,
        }),
      });
    });
    observer.observe(scroller);
    return () => {
      observer.disconnect();
      clearTimeout(timer);
      scroller.removeEventListener('pointerdown', release);
      scroller.removeEventListener('keydown', release);
      scroller.removeEventListener('scroll', keep);
    };
  }, [editing]);

  return (
    <SwipeZone
      ref={box}
      swipes={editing ? {} : swipes}
      onMove={onSwipeMove}
      onSwiped={() => void (swiped.current = true)}
      onPointerDown={() => void (swiped.current = false)}
      onClick={click}
      className={cn(
        // Never scrolled sideways, so a sideways Swipe is never a scroll's.
        'relative min-w-0 flex-1 overflow-x-clip overflow-y-auto overscroll-contain text-foreground group-data-disabled/draft:opacity-40',
        // Selecting is its own: no callout, no selection of the page's.
        selects && 'select-none [-webkit-touch-callout:none]',
        // The caret and a selection are drawn by `Marks`, not by
        // CodeMirror, whose own would be a second, out of step.
        (selects || editing) &&
          '[&_.cm-cursorLayer]:hidden [&_.cm-selectionLayer]:hidden',
        className,
      )}
    >
      <Selecting
        view={editor.view}
        enabled={selects}
        displace={displace}
        onSelected={() => {
          swiped.current = true;
          moved();
        }}
      />
      {/* Its own stack, so a selection's shade lies under the words, not
          under the card. */}
      <div ref={inner} className="relative isolate">
        {editor.empty && (
          <p
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 truncate text-muted-foreground"
          >
            {editor.placeholder}
          </p>
        )}
        {/* Read only, its words take no tap; a button in them, such as a
            failed Dictation's Retry, still does. */}
        <div
          ref={editor.mount}
          className={cn(
            !editing && 'pointer-events-none [&_button]:pointer-events-auto',
            !editing && editor.empty && 'opacity-0',
            // On one line by the card's own data-collapsed, so a card
            // drawn open by hand wraps at once.
            'group-data-collapsed/draft:overflow-hidden group-data-collapsed/draft:mask-r-from-85% group-data-collapsed/draft:[&_.cm-content]:whitespace-nowrap!',
          )}
        />
        {caret !== null && <Bands bands={caret.bands} />}
        {/* The caret and handles on a layer of their own, reaching above
            the words to hold a start knob, drawn again whole as they
            change: iOS left a removed knob above the first line drawn. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-x-3 -top-3 bottom-0 transform-gpu"
        >
          <div className="absolute top-3 left-3">
            {caret !== null && <Marks caret={caret} />}
          </div>
        </div>
      </div>
    </SwipeZone>
  );
}

/** The glow of the caret. */
const GLOW =
  'shadow-[0_0_0_1px_oklch(0.62_0.19_255/0.25),0_0_10px_2px_oklch(0.62_0.19_255/0.6)]';

/**
 * The caret, steady and lit, the blue of a text caret, so where the next
 * Dictation goes is plain at a glance; with a selection, a handle at each
 * end instead, alike, its start's knob above and its end's below, either
 * dragged (`select.tsx`).
 */
function Marks({ caret }: { readonly caret: NonNullable<Caret> }) {
  const { anchor, forward } = caret;
  if (anchor === null)
    return (
      <span
        aria-hidden
        style={{
          transform: `translate(${caret.left - 1}px, ${caret.top}px)`,
          height: caret.height,
        }}
        className={cn(
          'pointer-events-none absolute top-0 left-0 w-0.75 rounded-full bg-blue-500 transition-transform duration-150 ease-out motion-reduce:transition-none dark:bg-blue-400',
          GLOW,
        )}
      />
    );
  return (
    <>
      <Handle spot={forward ? anchor : caret} start />
      <Handle spot={forward ? caret : anchor} start={false} />
    </>
  );
}

/** A selection's shade, a box a line, under the words. */
function Bands({ bands }: { readonly bands: NonNullable<Caret>['bands'] }) {
  return bands.map((band) => (
    <span
      key={band.top}
      aria-hidden
      style={{
        transform: `translate(${band.left}px, ${band.top - 3}px)`,
        width: band.width,
        height: band.height + 6,
      }}
      className="pointer-events-none absolute top-0 left-0 -z-10 rounded-[4px] bg-blue-500/30 dark:bg-blue-400/40"
    />
  ));
}

/** One end of a selection: a line its text's height, and a knob. */
function Handle({
  spot,
  start,
}: {
  readonly spot: {
    readonly top: number;
    readonly left: number;
    readonly height: number;
  };
  readonly start: boolean;
}) {
  return (
    <span
      aria-hidden
      style={{
        transform: `translate(${spot.left - 1}px, ${spot.top - 3}px)`,
        height: spot.height + 6,
      }}
      className="pointer-events-none absolute top-0 left-0 w-0.5 bg-blue-500 dark:bg-blue-400"
    >
      <span
        className={cn(
          'absolute left-1/2 size-2.5 -translate-x-1/2 rounded-full bg-blue-500 dark:bg-blue-400',
          start ? '-top-2' : '-bottom-2',
        )}
      />
    </span>
  );
}

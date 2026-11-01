import {
  useElementScrollRestoration,
  useKeepScrollAnchor,
} from '@kestack/kabuki/routing/router';
import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  anchorOf,
  blockAt,
  BOTTOM,
  gapOf,
  keptAnchor,
  NEAR,
  putBack,
} from './anchor.ts';
import { blocksOf, type Blocks, type Planned } from './blocks.ts';

export { useScrollKeys } from './keys.ts';
export type { Planned } from './blocks.ts';

/*
 * A scroller over a list of blocks that keeps the reader's place. Where
 * the reader is, is one anchor (`anchor.ts`): the bottom, or the block at
 * the top of the view. The reader's own scroll moves it; after anything in
 * the list grows or shrinks, the view is put back there, so what is on the
 * screen never moves by itself, and a reader at the bottom stays there as
 * words arrive. Only the reader scrolling up lets go of the bottom: a
 * scroll with no wheel, touch, drag or key of theirs just before, as when
 * what it holds shrinks for a moment, is the page's own. A click that
 * opens or shuts something at the bottom keeps what is on the screen
 * still, and follows on only if that left it at the bottom.
 *
 * The list's blocks are drawn as the reader nears them (`blocks.ts`), so a
 * long one opens as fast as a short one. The anchor is kept with the
 * history entry: Back, Forward and a reload open where the reader was, its
 * blocks drawn around it, and anywhere else at the bottom.
 *
 * The list draws each block in a `Block`, says which there are with
 * `useBlocks`, and is drawn inside `Scrolled`.
 */

/**
 * How long after a reader's own wheel, touch or key a scroll up still
 * counts as theirs, in ms: a flick or a wheel's spin goes on scrolling, by
 * the browser's momentum, for up to about a second after its last event.
 */
const GESTURE_MS = 1000;

/** The blocks of the scroller a list is drawn in; none outside one, where every block is drawn. */
export const Scrolled = createContext<Blocks | null>(null);

/**
 * The scroller of one list, by its key, and its history entry's name: its
 * element and its content's, whether the reader is away from the bottom,
 * and how to go back to it or to the top.
 */
export function useScroller(key: string, id: string) {
  const scroller = useRef<HTMLDivElement | null>(null);
  const content = useRef<HTMLDivElement | null>(null);
  const kept = useElementScrollRestoration({ id });
  const keep = useKeepScrollAnchor({ id });
  // A new list, its own place.
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  const blocks = useMemo(() => blocksOf(BOTTOM), [key]);
  // Until its blocks are told, it opens where the entry was left, as that
  // is known: on a page load, only once the Router knows its entry.
  if (!blocks.planned()) blocks.anchor = keptAnchor(kept?.anchor) ?? BOTTOM;
  const [away, setAway] = useState(false);
  const moves = useRef({
    gesture: () => {},
    holdOn: (_smooth?: boolean) => {},
    toTop: () => {},
  });
  useLayoutEffect(() => {
    const outer = scroller.current;
    const inner = content.current;
    if (!outer || !inner) return;
    /** Where the view was last put; a scroll that lands there is ours. */
    let put = Number.NaN;
    let gesture = -Infinity;
    /** The anchor is read once a frame, however many scrolls it has. */
    let reading = 0;
    const theirs = () => performance.now() - gesture < GESTURE_MS;
    const report = () =>
      setAway(blocks.anchor.at !== 'bottom' && gapOf(outer) >= NEAR);
    const read = () => {
      blocks.anchor = anchorOf(outer);
      keep(blocks.anchor);
    };
    const place = () => {
      if (!putBack(outer, blocks.anchor, blocks.elementOf) && blocks.planned())
        // Its block is not in the list: no place to go back to.
        putBack(outer, (blocks.anchor = BOTTOM), blocks.elementOf);
      put = outer.scrollTop;
      report();
    };
    const onScroll = () => {
      // Nothing to read a place from before its blocks are there.
      if (!blocks.planned() || Math.abs(outer.scrollTop - put) < 1) return;
      blocks.moved();
      put = outer.scrollTop;
      if (theirs() || blocks.anchor.at === 'block')
        // Before the frame is laid out, so before anything is put back.
        reading ||= requestAnimationFrame(() => {
          reading = 0;
          read();
          report();
        });
      else report();
    };
    const onGesture = () => {
      gesture = performance.now();
    };
    // Before what it opens is drawn: what is on the screen stays still.
    const onClick = () => {
      if (blocks.anchor.at !== 'bottom') return;
      blocks.anchor = blockAt(outer);
      requestAnimationFrame(() => {
        if (gapOf(outer) < NEAR) blocks.anchor = BOTTOM;
        keep(blocks.anchor);
        report();
      });
    };
    moves.current = {
      gesture: onGesture,
      holdOn: (smooth = false) => {
        blocks.anchor = BOTTOM;
        keep(BOTTOM);
        outer.scrollTo({
          top: outer.scrollHeight,
          behavior:
            smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches
              ? 'smooth'
              : 'instant',
        });
        put = outer.scrollTop;
        report();
      },
      toTop: () => {
        onGesture();
        blocks.drawTop();
        outer.scrollTop = 0;
        put = outer.scrollTop;
        read();
        report();
      },
    };
    const disconnect = blocks.connect(outer, inner, place);
    place();
    outer.addEventListener('scroll', onScroll, { passive: true });
    outer.addEventListener('wheel', onGesture, { passive: true });
    outer.addEventListener('touchmove', onGesture, { passive: true });
    outer.addEventListener('pointerdown', onGesture);
    // The browser's own keys, while the scroller itself has focus.
    outer.addEventListener('keydown', onGesture);
    inner.addEventListener('click', onClick, { capture: true });
    return () => {
      cancelAnimationFrame(reading);
      disconnect();
      outer.removeEventListener('scroll', onScroll);
      outer.removeEventListener('wheel', onGesture);
      outer.removeEventListener('touchmove', onGesture);
      outer.removeEventListener('pointerdown', onGesture);
      outer.removeEventListener('keydown', onGesture);
      inner.removeEventListener('click', onClick, { capture: true });
    };
  }, [blocks, keep]);
  return useMemo(
    () => ({
      scroller,
      content,
      blocks,
      /** Away from the bottom, not following: show a way back down. */
      away,
      /** The reader moves the view, by a key of the app's own. */
      gesture: () => moves.current.gesture(),
      /** Back to the bottom, following again; `smooth` glides there. */
      holdOn: (smooth?: boolean) => moves.current.holdOn(smooth),
      /** To the top, its first blocks drawn first. */
      toTop: () => moves.current.toTop(),
    }),
    [blocks, away],
  );
}

export type Scroller = ReturnType<typeof useScroller>;

/**
 * Says which blocks a list holds, in order, as it is first drawn; with
 * none, its blocks are drawn at once, as a list inside the list is.
 */
export const useBlocks = (order: (() => ReadonlyArray<Planned>) | null) => {
  const blocks = use(Scrolled);
  if (order !== null) blocks?.plan(order);
};

/**
 * One block of the list: drawn once it is near the view, standing in as
 * space until then. `guess` is how tall it may be, in px, before it was
 * ever drawn.
 */
export function Block({
  id,
  guess,
  className,
  children,
}: {
  readonly id: string;
  readonly guess: number;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  const blocks = use(Scrolled);
  const [drawn, setDrawn] = useState(() => blocks?.isDrawn(id) ?? true);
  const ref = useCallback(
    (element: HTMLDivElement | null) =>
      element === null || blocks === null
        ? undefined
        : blocks.register(id, element, () => setDrawn(true)),
    [blocks, id],
  );
  useLayoutEffect(() => {
    if (drawn) blocks?.landed(id);
  }, [blocks, id, drawn]);
  return drawn ? (
    <div ref={ref} data-block={id} className={className}>
      {children}
    </div>
  ) : (
    <div
      ref={ref}
      data-block={id}
      aria-hidden
      className={className}
      style={{ height: blocks?.heightOf(id) ?? guess }}
    />
  );
}

import {
  useElementScrollRestoration,
  useKeepScrollAnchor,
} from '@kestack/kabuki/routing/router';
import {
  createContext,
  type ReactNode,
  use,
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
import { type Scroll, scrollOf, useShown } from './shown.ts';

export { useScrollKeys } from './keys.ts';

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
 * A list draws its last few blocks, enough to fill the view and some,
 * and more above as the reader nears the top of them (`shown.ts`), so a
 * long one opens as fast as a short one. While a finger moves it, and
 * after, while the glide it set off goes on, the page moves nothing: a
 * phone's glide takes no notice of the view being put back, so nothing is
 * drawn above, nor put back, until the glide settles. The anchor is kept
 * with the history entry: Back, Forward and a reload open where the
 * reader was, drawn from there down, and anywhere else at the bottom.
 *
 * The list is drawn inside `Scrolled`, says which blocks it holds with
 * `useBlocks`, draws each in a `Block`, and may group them (`useGroup`).
 */

/**
 * How long after a reader's own wheel, touch or key a scroll up still
 * counts as theirs, in ms: a flick or a wheel's spin goes on scrolling, by
 * the browser's momentum, for up to about a second after its last event.
 */
const GESTURE_MS = 1000;

/**
 * How long without a scroll a touch's glide has settled, in ms: a glide
 * scrolls every frame until it stops. Not the finger lifting alone: its
 * end never comes when what it touched is taken away, as words streaming
 * in may.
 */
const SETTLE_MS = 150;

/** The scroll a list is drawn in; outside one, every block is drawn. */
export const Scrolled = createContext<Scroll | null>(null);

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
  const scroll = useMemo(() => scrollOf(BOTTOM), [key]);
  // Until its list is drawn, it opens where the entry was left, as that is
  // known: on a page load, only once the Router knows its entry.
  if (!scroll.drawn) scroll.anchor = keptAnchor(kept?.anchor) ?? BOTTOM;
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
    scroll.scroller = outer;
    /** Where the view was last put; a scroll that lands there is ours. */
    let put = Number.NaN;
    let gesture = -Infinity;
    const theirs = () =>
      scroll.gliding || performance.now() - gesture < GESTURE_MS;
    /** Whether a finger is on it. */
    let touching = false;
    let settling = 0;
    const blockOf = (id: string) =>
      outer.querySelector<HTMLElement>(`[data-block="${CSS.escape(id)}"]`) ??
      undefined;
    const report = () =>
      setAway(scroll.anchor.at !== 'bottom' && gapOf(outer) >= NEAR);
    const read = () => {
      scroll.anchor = anchorOf(outer);
      keep(scroll.anchor);
    };
    const place = () => {
      // Not while a glide goes on: it would take the view back.
      if (scroll.gliding) return;
      // A scroll of the reader's whose event is yet to come moved the view
      // from the anchor by as much: what is put back is where they are now.
      // Not the browser's own, as it clamps the view to what it now holds.
      const pending = outer.scrollTop - put;
      const clamped =
        pending < 0 &&
        outer.scrollTop >= outer.scrollHeight - outer.clientHeight - 1;
      if (Math.abs(pending) >= 1 && theirs() && !clamped) {
        if (scroll.anchor.at === 'block')
          scroll.anchor = {
            ...scroll.anchor,
            offset: scroll.anchor.offset - pending,
          };
        else scroll.anchor = anchorOf(outer);
        keep(scroll.anchor);
      }
      if (!putBack(outer, scroll.anchor, blockOf) && scroll.drawn)
        // Its block is not in the list: no place to go back to.
        putBack(outer, (scroll.anchor = BOTTOM), blockOf);
      put = outer.scrollTop;
      report();
    };
    /** The glide has settled: back to the anchor, and what waited drawn. */
    const settled = () => {
      scroll.gliding = false;
      place();
      scroll.settle();
    };
    const settleSoon = () => {
      clearTimeout(settling);
      settling = window.setTimeout(settled, SETTLE_MS);
    };
    const onTouchStart = () => {
      touching = true;
      scroll.gliding = true;
      settleSoon();
      onGesture();
    };
    const onTouchEnd = (event: TouchEvent) => {
      if (event.touches.length > 0) return;
      touching = false;
      settleSoon();
    };
    const onScroll = () => {
      // Moved by a finger, again after it rested: a glide until quiet.
      if (touching) scroll.gliding = true;
      if (scroll.gliding) settleSoon();
      // Nothing to read a place from before its list is drawn.
      if (!scroll.drawn || Math.abs(outer.scrollTop - put) < 1) return;
      put = outer.scrollTop;
      // Now, while the page is as the reader saw it: by the next frame,
      // more may be drawn above, not yet put back.
      if (theirs() || scroll.anchor.at === 'block') read();
      report();
      // Near the top of what is drawn: more above.
      scroll.fill(false);
    };
    const onGesture = () => {
      gesture = performance.now();
    };
    // Before what it opens is drawn: what is on the screen stays still.
    const onClick = () => {
      if (scroll.anchor.at !== 'bottom') return;
      scroll.anchor = blockAt(outer);
      requestAnimationFrame(() => {
        if (gapOf(outer) < NEAR) scroll.anchor = BOTTOM;
        keep(scroll.anchor);
        report();
      });
    };
    scroll.place = place;
    moves.current = {
      gesture: onGesture,
      holdOn: (smooth = false) => {
        scroll.anchor = BOTTOM;
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
        clearTimeout(settling);
        scroll.gliding = false;
        scroll.showAll();
        outer.scrollTop = 0;
        put = outer.scrollTop;
        read();
        report();
      },
    };
    // After anything in it grows or shrinks, or it does, as when shown
    // again or the window grows: back to the anchor, and enough drawn.
    const resized =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            place();
            scroll.fill(false);
          });
    resized?.observe(inner);
    resized?.observe(outer);
    place();
    // Now that it can be measured: enough drawn above, before it is shown.
    scroll.fill(true);
    outer.addEventListener('scroll', onScroll, { passive: true });
    outer.addEventListener('wheel', onGesture, { passive: true });
    outer.addEventListener('touchmove', onGesture, { passive: true });
    outer.addEventListener('touchstart', onTouchStart, { passive: true });
    outer.addEventListener('touchend', onTouchEnd, { passive: true });
    outer.addEventListener('touchcancel', onTouchEnd, { passive: true });
    outer.addEventListener('pointerdown', onGesture);
    // The browser's own keys, while the scroller itself has focus.
    outer.addEventListener('keydown', onGesture);
    inner.addEventListener('click', onClick, { capture: true });
    return () => {
      scroll.place = () => {};
      clearTimeout(settling);
      scroll.gliding = false;
      resized?.disconnect();
      outer.removeEventListener('scroll', onScroll);
      outer.removeEventListener('wheel', onGesture);
      outer.removeEventListener('touchmove', onGesture);
      outer.removeEventListener('touchstart', onTouchStart);
      outer.removeEventListener('touchend', onTouchEnd);
      outer.removeEventListener('touchcancel', onTouchEnd);
      outer.removeEventListener('pointerdown', onGesture);
      outer.removeEventListener('keydown', onGesture);
      inner.removeEventListener('click', onClick, { capture: true });
    };
  }, [scroll, keep]);
  return useMemo(
    () => ({
      scroller,
      content,
      scroll,
      /** Away from the bottom, not following: show a way back down. */
      away,
      /** The reader moves the view, by a key of the app's own. */
      gesture: () => moves.current.gesture(),
      /** Back to the bottom, following again; `smooth` glides there. */
      holdOn: (smooth?: boolean) => moves.current.holdOn(smooth),
      /** To the top, every block drawn first. */
      toTop: () => moves.current.toTop(),
    }),
    [scroll, away],
  );
}

export type Scroller = ReturnType<typeof useScroller>;

/**
 * Which of a list's blocks, by id in order, are drawn: from `from` on,
 * with `list` the list's element, while `more` are above. With no order,
 * as for a list inside the list, every one is.
 */
export const useBlocks = (order: ReadonlyArray<string> | null) =>
  useShown(use(Scrolled), order);

/** A group of blocks, as a turn: skipped far from the view once laid out. */
export const useGroup = () => use(Scrolled)?.group;

/** One block of the list, as its anchor finds it. */
export function Block({
  id,
  className,
  children,
}: {
  readonly id: string;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return (
    <div data-block={id} className={className}>
      {children}
    </div>
  );
}

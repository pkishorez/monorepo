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
  atBottom,
  blockAt,
  BOTTOM,
  keptAnchor,
  putBack,
} from './anchor.ts';
import { type Scroll, scrollOf, useShown } from './shown.ts';

export { useScrollKeys } from './keys.ts';

/*
 * A scroller over a list of blocks that keeps the reader's place, by five
 * rules. Where the reader is, is one anchor (`anchor.ts`): the bottom, or
 * the block at the top of the view and how far down it is.
 *
 * 1. Follow  at the bottom, a pixel from it or less, it stays at the
 *            bottom as what it holds grows.
 * 2. Stay    anywhere else, what is on the screen never moves by itself:
 *            after anything in the list grows or shrinks, below the view
 *            or above it, the view is put back at the anchor.
 * 3. Read    every scroll it did not make itself is the reader's, and
 *            sets the anchor where the view is now: at the bottom, it
 *            follows; scrolled up even a pixel, it stays.
 * 4. More    near the top of what is drawn, more is drawn above
 *            (`shown.ts`), and rule 2 keeps the view where it was.
 * 5. Down    `holdOn` goes back to the bottom, as a message is sent: one
 *            glide there, not the reader's scroll unless it goes up, and
 *            once it is quiet, the rest of the way at once if the bottom
 *            moved while it went.
 *
 * What opens and shuts in the list keeps itself on the screen with
 * `keepStill` (`../transcript/words/fold.tsx`); this needs nothing else.
 *
 * A phone takes no notice of the view being put back while a finger moves
 * it, or while the glide it set off goes on: then nothing is put back nor
 * drawn above, until the glide settles. Near the top, with more above, it
 * does not bounce, so a glide that reaches it settles at once. The anchor
 * is kept with the history entry: Back, Forward and a reload open where
 * the reader was, drawn from there down, and anywhere else at the bottom.
 *
 * The list is drawn inside `Scrolled`, says which blocks it holds with
 * `useBlocks`, draws each in a `Block`, and may group them (`useGroup`).
 */

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
    holdOn: (_smooth?: boolean) => {},
    toTop: () => {},
  });
  useLayoutEffect(() => {
    const outer = scroller.current;
    const inner = content.current;
    if (!outer || !inner) return;
    scroll.scroller = outer;
    /** Where the view was last put or seen; a scroll that lands there is its own. */
    let put = Number.NaN;
    /** Whether the view has been put in place since its list was drawn. */
    let placed = false;
    /** Whether it glides down to the bottom on its own (rule 5). */
    let descending = false;
    let landing = 0;
    /** Whether a finger is on it. */
    let touching = false;
    let settling = 0;
    const blockOf = (id: string) =>
      outer.querySelector<HTMLElement>(`[data-block="${CSS.escape(id)}"]`) ??
      undefined;
    const report = () => setAway(scroll.anchor.at !== 'bottom');
    const set = (anchor: typeof scroll.anchor) => {
      scroll.anchor = anchor;
      keep(anchor);
    };
    /** Rule 3: where the reader is now. */
    const read = () => set(anchorOf(outer));
    const stopDescending = () => {
      descending = false;
      clearTimeout(landing);
    };
    /** Its glide down, quiet now: what the bottom moved by since, at once. */
    const landSoon = () => {
      clearTimeout(landing);
      landing = window.setTimeout(() => {
        descending = false;
        place();
      }, SETTLE_MS);
    };
    const place = () => {
      // Not while a glide goes on: it would take the view back.
      if (scroll.gliding) return;
      const moved = outer.scrollTop - put;
      // Rule 5: its glide down goes on undisturbed, unless the reader goes
      // up out of it; it lands once quiet.
      if (descending && moved > -1) return;
      stopDescending();
      // Rule 3, for a scroll whose event is yet to come: the reader, or
      // the browser keeping the view in what it holds, moved it.
      if (Math.abs(moved) >= 1) {
        if (atBottom(outer)) set(BOTTOM);
        else if (scroll.anchor.at === 'block')
          set({ ...scroll.anchor, offset: scroll.anchor.offset - moved });
        else read();
      }
      // Rule 2, or rule 1.
      if (!putBack(outer, scroll.anchor, blockOf) && scroll.drawn) {
        // Its block is gone, as when an answer's words were split again:
        // the view stays where it is, or, never put in place, as when a
        // kept place is gone, is at the end.
        set(placed ? anchorOf(outer) : BOTTOM);
        putBack(outer, scroll.anchor, blockOf);
      }
      if (scroll.drawn) placed = true;
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
    };
    const onTouchEnd = (event: TouchEvent) => {
      if (event.touches.length > 0) return;
      touching = false;
      if (scroll.gliding) settleSoon();
    };
    /**
     * Within a view of the top, with more above still to be drawn: no
     * bounce there. A glide that reaches it stops, rather than springing
     * back for most of a second, and what is above is drawn once it does,
     * as nothing can be while the bounce goes on.
     */
    const bounce = () => {
      const stop =
        outer.scrollTop < outer.clientHeight &&
        inner.querySelector('[data-more]') !== null;
      outer.style.overscrollBehaviorY = stop ? 'none' : '';
    };
    const onScroll = () => {
      bounce();
      // Where it put the view itself: nothing of the reader's.
      if (Math.abs(outer.scrollTop - put) < 1) return;
      // A finger moving it: a glide, until it is quiet. A tap moves
      // nothing, so what it opens or shuts is put in place at once.
      if (touching && !scroll.gliding) {
        scroll.gliding = true;
        scroll.glide();
      }
      if (scroll.gliding) settleSoon();
      // Nothing to read a place from before its list is drawn.
      if (!scroll.drawn) return;
      const up = outer.scrollTop < put;
      put = outer.scrollTop;
      // Rule 5: its own glide down, landing once quiet, unless it goes up.
      if (descending && !up) landSoon();
      else {
        stopDescending();
        read();
      }
      report();
      // Rule 4: near the top of what is drawn, more above.
      scroll.fill(false);
    };
    scroll.place = place;
    scroll.keepStill = () => {
      stopDescending();
      if (scroll.anchor.at === 'bottom') set(blockAt(outer));
    };
    moves.current = {
      holdOn: (smooth = false) => {
        set(BOTTOM);
        stopDescending();
        const glide =
          smooth &&
          !atBottom(outer) &&
          !matchMedia('(prefers-reduced-motion: reduce)').matches;
        outer.scrollTo({
          top: outer.scrollHeight,
          behavior: glide ? 'smooth' : 'instant',
        });
        if (glide) {
          descending = true;
          landSoon();
        }
        put = outer.scrollTop;
        report();
      },
      toTop: () => {
        clearTimeout(settling);
        scroll.gliding = false;
        stopDescending();
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
    outer.addEventListener('touchstart', onTouchStart, { passive: true });
    outer.addEventListener('touchend', onTouchEnd, { passive: true });
    outer.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      scroll.place = () => {};
      scroll.keepStill = () => {};
      clearTimeout(settling);
      clearTimeout(landing);
      scroll.gliding = false;
      resized?.disconnect();
      outer.removeEventListener('scroll', onScroll);
      outer.removeEventListener('touchstart', onTouchStart);
      outer.removeEventListener('touchend', onTouchEnd);
      outer.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [scroll, keep]);
  return useMemo(
    () => ({
      scroller,
      content,
      scroll,
      /** Away from the bottom, not following: show a way back down. */
      away,
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

import type { useElementScrollRestoration } from '@kestack/kabuki/routing';
import { useEffect, useRef } from 'react';

/*
 * Keeps a scroller at its bottom while it is there: whenever what it holds
 * grows, a reader at the bottom stays at the bottom. Only the reader
 * scrolling up lets go (wheel, touch, a drag, a key in the scroller, or a
 * scroll Action through `letGo`), never a scroll the page made by itself,
 * such as content shrinking for a moment as it redraws; reaching the
 * bottom again, or `holdOn`, holds on. It opens at the bottom, and opens
 * there again for each new `key`, such as another session in the same
 * page, unless the history entry kept where it was scrolled (`kept`), as
 * on Back and Forward: then it opens there, as soon as what it holds is
 * long enough to reach it, and follows only once the reader is at the
 * bottom again. The scroller itself changing size, as the Draft under it
 * grows when it is written in, keeps a reader at the bottom there too.
 */

const NEAR = 48;
/** How long after a reader's gesture a scroll still counts as theirs. */
const GESTURE_MS = 1000;

export function useFollow(
  key: string,
  kept: ReturnType<typeof useElementScrollRestoration>,
) {
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const stuck = useRef(true);
  const toBottom = useRef(() => {});
  /** Where the entry was scrolled, until it is reached or the reader moves. */
  const target = useRef<number | null>(null);
  const keptNow = useRef(kept);
  keptNow.current = kept;
  useEffect(() => {
    const outer = scroller.current;
    const inner = content.current;
    if (!outer || !inner) return;
    target.current = keptNow.current?.scrollY ?? null;
    stuck.current = target.current === null;
    let last = 0;
    let gesture = -Infinity;
    toBottom.current = () => {
      outer.scrollTop = outer.scrollHeight;
      last = outer.scrollTop;
    };
    /** Back where the entry was, once what it holds reaches that far. */
    const toKept = () => {
      const to = target.current;
      if (to === null) return;
      outer.scrollTop = to;
      last = outer.scrollTop;
      // Not there yet, or nothing to scroll yet, as while its messages are
      // still read: a transcript too short to scroll is no bottom to hold.
      if (
        outer.scrollHeight - outer.clientHeight < to ||
        outer.scrollHeight <= outer.clientHeight
      )
        return;
      target.current = null;
      // There, it follows again only if that was the bottom.
      stuck.current = outer.scrollHeight - to - outer.clientHeight < NEAR;
    };
    const onGesture = () => {
      gesture = performance.now();
      target.current = null;
    };
    const onScroll = () => {
      // Putting it back where it was is not the reader's scroll.
      if (target.current !== null) return;
      const top = outer.scrollTop;
      if (outer.scrollHeight - top - outer.clientHeight < NEAR)
        stuck.current = true;
      else if (top < last && performance.now() - gesture < GESTURE_MS)
        stuck.current = false;
      last = top;
    };
    const grown = new ResizeObserver(() => {
      if (target.current !== null) toKept();
      else if (stuck.current) toBottom.current();
    });
    if (target.current === null) toBottom.current();
    else toKept();
    outer.addEventListener('scroll', onScroll, { passive: true });
    outer.addEventListener('wheel', onGesture, { passive: true });
    outer.addEventListener('touchmove', onGesture, { passive: true });
    outer.addEventListener('pointerdown', onGesture);
    // The browser's own keys, while the scroller itself has focus.
    outer.addEventListener('keydown', onGesture);
    grown.observe(inner);
    grown.observe(outer);
    return () => {
      outer.removeEventListener('scroll', onScroll);
      outer.removeEventListener('wheel', onGesture);
      outer.removeEventListener('touchmove', onGesture);
      outer.removeEventListener('pointerdown', onGesture);
      outer.removeEventListener('keydown', onGesture);
      grown.disconnect();
    };
  }, [key]);
  return {
    scroller,
    content,
    /** The reader scrolls up: stop following. */
    letGo: () => {
      target.current = null;
      stuck.current = false;
    },
    /** Back to the bottom, following again. */
    holdOn: () => {
      target.current = null;
      stuck.current = true;
      toBottom.current();
    },
  };
}

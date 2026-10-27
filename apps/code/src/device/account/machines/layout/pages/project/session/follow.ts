import type { useElementScrollRestoration } from '@kestack/kabuki/routing';
import { useEffect, useRef, useState } from 'react';

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
 *
 * Opening or shutting anything in it, by a click or a key, is reading,
 * not new words: what was clicked stays just where it was on the screen,
 * whatever grew or shrank above or below it, and it follows on only if
 * that left the reader at the bottom. Away from the bottom, `away` says
 * so, for a way back down.
 */

const NEAR = 48;
/** How long after a reader's gesture a scroll still counts as theirs. */
const GESTURE_MS = 1000;
/** How long after a click what grows is its opening, not new words. */
const PIN_MS = 300;

export function useFollow(
  key: string,
  kept: ReturnType<typeof useElementScrollRestoration>,
) {
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const stuck = useRef(true);
  const toBottom = useRef((_smooth?: boolean) => {});
  /** Where the entry was scrolled, until it is reached or the reader moves. */
  const target = useRef<number | null>(null);
  const keptNow = useRef(kept);
  keptNow.current = kept;
  /** Whether the reader is away from the bottom and not following. */
  const [away, setAway] = useState(false);
  useEffect(() => {
    const outer = scroller.current;
    const inner = content.current;
    if (!outer || !inner) return;
    target.current = keptNow.current?.scrollY ?? null;
    stuck.current = target.current === null;
    let last = 0;
    let gesture = -Infinity;
    let pinUntil = -Infinity;
    const gap = () => outer.scrollHeight - outer.scrollTop - outer.clientHeight;
    const report = () => setAway(!stuck.current && gap() >= NEAR);
    toBottom.current = (smooth = false) => {
      outer.scrollTo({
        top: outer.scrollHeight,
        behavior:
          smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches
            ? 'smooth'
            : 'instant',
      });
      if (!smooth) last = outer.scrollTop;
      report();
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
      stuck.current = gap() < NEAR;
      report();
    };
    const onGesture = () => {
      gesture = performance.now();
      target.current = null;
    };
    /**
     * A click that opens or shuts something: keep what was clicked where
     * it is on the screen once it has drawn again, then follow on only if
     * that is still the bottom.
     */
    const onClick = (event: Event) => {
      const clicked = event.target;
      if (!(clicked instanceof Element)) return;
      const line = clicked.closest('button, [aria-expanded], li, a') ?? clicked;
      const before = line.getBoundingClientRect().top;
      target.current = null;
      pinUntil = performance.now() + PIN_MS;
      requestAnimationFrame(() => {
        if (!line.isConnected) return;
        const moved = line.getBoundingClientRect().top - before;
        if (moved !== 0) outer.scrollTop += moved;
        last = outer.scrollTop;
        stuck.current = gap() < NEAR;
        report();
      });
    };
    const onScroll = () => {
      // Putting it back where it was is not the reader's scroll.
      if (target.current !== null) return;
      const top = outer.scrollTop;
      if (gap() < NEAR) stuck.current = true;
      else if (top < last && performance.now() - gesture < GESTURE_MS)
        stuck.current = false;
      last = top;
      report();
    };
    // A glide down ends short when more arrived on the way: finish it.
    const onScrollEnd = () => {
      if (stuck.current && target.current === null && gap() > 1)
        toBottom.current();
    };
    const grown = new ResizeObserver(() => {
      if (target.current !== null) toKept();
      // What a click opened is not new words to follow.
      else if (stuck.current && performance.now() > pinUntil)
        toBottom.current();
      else report();
    });
    if (target.current === null) toBottom.current();
    else toKept();
    outer.addEventListener('scroll', onScroll, { passive: true });
    outer.addEventListener('scrollend', onScrollEnd);
    outer.addEventListener('wheel', onGesture, { passive: true });
    outer.addEventListener('touchmove', onGesture, { passive: true });
    outer.addEventListener('pointerdown', onGesture);
    // The browser's own keys, while the scroller itself has focus.
    outer.addEventListener('keydown', onGesture);
    // Before React draws what the click opens, so where it was is known.
    inner.addEventListener('click', onClick, { capture: true });
    grown.observe(inner);
    grown.observe(outer);
    return () => {
      outer.removeEventListener('scroll', onScroll);
      outer.removeEventListener('scrollend', onScrollEnd);
      outer.removeEventListener('wheel', onGesture);
      outer.removeEventListener('touchmove', onGesture);
      outer.removeEventListener('pointerdown', onGesture);
      outer.removeEventListener('keydown', onGesture);
      inner.removeEventListener('click', onClick, { capture: true });
      grown.disconnect();
    };
  }, [key]);
  return {
    scroller,
    content,
    /** Away from the bottom, not following: show a way back down. */
    away,
    /** The reader scrolls up: stop following. */
    letGo: () => {
      target.current = null;
      stuck.current = false;
    },
    /** Back to the bottom, following again; `smooth` glides there. */
    holdOn: (smooth = false) => {
      target.current = null;
      stuck.current = true;
      toBottom.current(smooth);
    },
  };
}

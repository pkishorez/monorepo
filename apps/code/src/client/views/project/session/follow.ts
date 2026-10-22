import { useEffect, useRef } from 'react';

/*
 * Keeps a scroller at its bottom while it is there: whenever what it holds
 * grows, a reader at the bottom stays at the bottom. Only the reader
 * scrolling up lets go (wheel, touch, a drag, a key in the scroller, or a
 * scroll Action through `letGo`), never a scroll the page made by itself,
 * such as content shrinking for a moment as it redraws; reaching the
 * bottom again, or `holdOn`, holds on. It opens at the bottom.
 */

const NEAR = 48;
/** How long after a reader's gesture a scroll still counts as theirs. */
const GESTURE_MS = 1000;

export function useFollow() {
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const stuck = useRef(true);
  const toBottom = useRef(() => {});
  useEffect(() => {
    const outer = scroller.current;
    const inner = content.current;
    if (!outer || !inner) return;
    stuck.current = true;
    let last = 0;
    let gesture = -Infinity;
    toBottom.current = () => {
      outer.scrollTop = outer.scrollHeight;
      last = outer.scrollTop;
    };
    const onGesture = () => {
      gesture = performance.now();
    };
    const onScroll = () => {
      const top = outer.scrollTop;
      if (outer.scrollHeight - top - outer.clientHeight < NEAR)
        stuck.current = true;
      else if (top < last && performance.now() - gesture < GESTURE_MS)
        stuck.current = false;
      last = top;
    };
    const grown = new ResizeObserver(() => {
      if (stuck.current) toBottom.current();
    });
    toBottom.current();
    outer.addEventListener('scroll', onScroll, { passive: true });
    outer.addEventListener('wheel', onGesture, { passive: true });
    outer.addEventListener('touchmove', onGesture, { passive: true });
    outer.addEventListener('pointerdown', onGesture);
    // The browser's own keys, while the scroller itself has focus.
    outer.addEventListener('keydown', onGesture);
    grown.observe(inner);
    return () => {
      outer.removeEventListener('scroll', onScroll);
      outer.removeEventListener('wheel', onGesture);
      outer.removeEventListener('touchmove', onGesture);
      outer.removeEventListener('pointerdown', onGesture);
      outer.removeEventListener('keydown', onGesture);
      grown.disconnect();
    };
  }, []);
  return {
    scroller,
    content,
    /** The reader scrolls up: stop following. */
    letGo: () => {
      stuck.current = false;
    },
    /** Back to the bottom, following again. */
    holdOn: () => {
      stuck.current = true;
      toBottom.current();
    },
  };
}

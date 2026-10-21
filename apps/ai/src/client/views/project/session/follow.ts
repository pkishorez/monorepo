import { useEffect, useRef } from 'react';

/*
 * Keeps a scroller at its bottom while it is there: whenever what it holds
 * grows, a reader at the bottom stays at the bottom. Only the reader
 * scrolling up lets go (wheel, touch, a drag or a key), never a scroll the
 * page made by itself, such as content shrinking for a moment as it
 * redraws; reaching the bottom again holds on. It opens at the bottom.
 */

const NEAR = 48;
/** How long after a reader's gesture a scroll still counts as theirs. */
const GESTURE_MS = 1000;
const KEYS = new Set(['ArrowUp', 'PageUp', 'Home', ' ']);

export function useFollow() {
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const outer = scroller.current;
    const inner = content.current;
    if (!outer || !inner) return;
    let stuck = true;
    let last = 0;
    let gesture = -Infinity;
    const toBottom = () => {
      outer.scrollTop = outer.scrollHeight;
      last = outer.scrollTop;
    };
    const onGesture = () => {
      gesture = performance.now();
    };
    const onKey = (event: KeyboardEvent) => {
      if (KEYS.has(event.key)) onGesture();
    };
    const onScroll = () => {
      const top = outer.scrollTop;
      if (outer.scrollHeight - top - outer.clientHeight < NEAR) stuck = true;
      else if (top < last && performance.now() - gesture < GESTURE_MS)
        stuck = false;
      last = top;
    };
    const grown = new ResizeObserver(() => {
      if (stuck) toBottom();
    });
    toBottom();
    outer.addEventListener('scroll', onScroll, { passive: true });
    outer.addEventListener('wheel', onGesture, { passive: true });
    outer.addEventListener('touchmove', onGesture, { passive: true });
    outer.addEventListener('pointerdown', onGesture);
    window.addEventListener('keydown', onKey);
    grown.observe(inner);
    return () => {
      outer.removeEventListener('scroll', onScroll);
      outer.removeEventListener('wheel', onGesture);
      outer.removeEventListener('touchmove', onGesture);
      outer.removeEventListener('pointerdown', onGesture);
      window.removeEventListener('keydown', onKey);
      grown.disconnect();
    };
  }, []);
  return { scroller, content };
}

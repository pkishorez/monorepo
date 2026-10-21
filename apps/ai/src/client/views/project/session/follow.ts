import { useEffect, useRef } from 'react';

/*
 * Keeps a scroller at its bottom while it is there: whenever what it holds
 * grows, a reader at the bottom stays at the bottom. Only scrolling up lets
 * go, never a scroll this hook made itself; reaching the bottom again holds
 * on. It opens at the bottom.
 */

const NEAR = 48;

export function useFollow() {
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const outer = scroller.current;
    const inner = content.current;
    if (!outer || !inner) return;
    let stuck = true;
    let last = 0;
    const toBottom = () => {
      outer.scrollTop = outer.scrollHeight;
      last = outer.scrollTop;
    };
    const onScroll = () => {
      const top = outer.scrollTop;
      if (outer.scrollHeight - top - outer.clientHeight < NEAR) stuck = true;
      else if (top < last) stuck = false;
      last = top;
    };
    const grown = new ResizeObserver(() => {
      if (stuck) toBottom();
    });
    toBottom();
    outer.addEventListener('scroll', onScroll, { passive: true });
    grown.observe(inner);
    return () => {
      outer.removeEventListener('scroll', onScroll);
      grown.disconnect();
    };
  }, []);
  return { scroller, content };
}

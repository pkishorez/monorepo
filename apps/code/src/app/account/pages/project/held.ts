import { useEffect, useState } from 'react';

/*
 * A move draws the next page in one step, never a blank one first: the page
 * drawn before stays until the next can be drawn whole, read from this
 * device. Stopped, the one before keeps drawing its last data, as every
 * View does while it leaves the page. One never drawn whole within `HOLD`
 * is drawn all the same, and says it is loading.
 */

/** How long the page before stays while the next is read, in ms. */
export const HOLD = 400;

/**
 * What to draw of `next`, a Child that comes and goes, such as the page the
 * URL names: `next` once it is `ready` or has been waited for `wait` ms,
 * else the one drawn before it.
 */
export function useHeld<H extends { readonly id: string }>(
  next: H,
  ready: boolean,
  wait = HOLD,
): H {
  const [held, setHeld] = useState(next);
  const [waited, setWaited] = useState<string | null>(null);
  const moving = held.id !== next.id;
  useEffect(() => {
    if (!moving) return;
    const timer = setTimeout(() => setWaited(next.id), wait);
    return () => clearTimeout(timer);
  }, [moving, next.id, wait]);
  const through = !moving || ready || waited === next.id;
  if (through && moving) setHeld(next);
  return through ? next : held;
}

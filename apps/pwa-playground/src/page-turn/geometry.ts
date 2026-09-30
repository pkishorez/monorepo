export type Side = 'prev' | 'next';

// How far a page sinks below, or rises above, the screen it leaves.
const DEPTH = 0.08;

type Place = { readonly x: number; readonly scale: number };

/**
 * Where the current page stands when a Page Turn is `t` (0 → 1) of the way
 * toward `side`, `x` as a fraction of the surface's width. Toward the next
 * page it sinks off to the left; toward the previous one it rises off to the right.
 */
export const pageAt = (side: Side, t: number): Place =>
  side === 'next'
    ? { x: -t, scale: 1 - DEPTH * t }
    : { x: t, scale: 1 + DEPTH * t };

/**
 * Where the Placeholder Page stands at the same moment: the next page settles
 * down from above at the right, the previous one comes up from below at the
 * left. At `t` 0 it sits just past the surface's edge, out of sight.
 */
export const placeholderAt = (side: Side, t: number): Place => {
  const away = 1 - t;
  return side === 'next'
    ? { x: away * (1 + DEPTH / 2), scale: 1 + DEPTH * away }
    : { x: -away * (1 - DEPTH / 2), scale: 1 - DEPTH * away };
};

export const opposite = (side: Side): Side =>
  side === 'next' ? 'prev' : 'next';

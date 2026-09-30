import type { Side } from './geometry.ts';

export type Neighbours = { readonly prev?: string; readonly next?: string };

/** Which way `to` lies from the page that declared `neighbours`, if beside it. */
export const sideOf = (neighbours: Neighbours, to: string): Side | undefined =>
  to === neighbours.next ? 'next' : to === neighbours.prev ? 'prev' : undefined;

/**
 * View-transition types for a route change the router animates: `turn-next`
 * or `turn-prev` when the page left declared the one arrived at as its
 * neighbour, whichever way history moved, and a crossfade otherwise and under
 * reduced motion. `false` skips it: the first render, or a reload of the same
 * page.
 */
export const transitionTypes = (
  change: {
    readonly fromLocation?: { readonly pathname: string };
    readonly toLocation: { readonly pathname: string };
    readonly pathChanged: boolean;
  },
  neighbours: Neighbours,
): Array<string> | false => {
  if (change.fromLocation === undefined || !change.pathChanged) return false;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return ['fade'];
  }
  const side = sideOf(neighbours, change.toLocation.pathname);
  return side === undefined ? ['fade'] : [`turn-${side}`];
};

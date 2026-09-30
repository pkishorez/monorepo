import type { Side } from './geometry.ts';

type Location = {
  readonly pathname: string;
  readonly state: object;
};

const turnOf = (location: Location): Side | undefined => {
  const turn = (location.state as { readonly pageTurn?: unknown }).pageTurn;
  return turn === 'next' || turn === 'prev' ? turn : undefined;
};

const indexOf = (location: Location): number | undefined => {
  const index = (location.state as { readonly __TSR_index?: unknown })
    .__TSR_index;
  return typeof index === 'number' ? index : undefined;
};

/** The history entry a Page Turn lands on remembers which way it turned. */
export const rememberTurn =
  (side: Side) =>
  <State extends object>(state: State): State & { pageTurn: Side } => ({
    ...state,
    pageTurn: side,
  });

/**
 * View-transition types for a route change the router animates. A Page Turn
 * lands without one; moving through history over an entry a turn made plays
 * that turn again, in reverse when going back. Anything else crossfades, and
 * so does everything under reduced motion. `false` skips the transition: the
 * first render or a reload of the same page.
 */
export const transitionTypes = (change: {
  readonly fromLocation?: Location;
  readonly toLocation: Location;
  readonly pathChanged: boolean;
}): Array<string> | false => {
  const { fromLocation: from, toLocation: to } = change;
  if (from === undefined || !change.pathChanged) return false;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return ['fade'];
  }
  const fromIndex = indexOf(from);
  const toIndex = indexOf(to);
  if (fromIndex !== undefined && toIndex !== undefined) {
    if (toIndex < fromIndex) {
      const undone = turnOf(from);
      if (undone !== undefined) {
        return [undone === 'next' ? 'turn-prev' : 'turn-next'];
      }
    } else {
      const redone = turnOf(to);
      if (redone !== undefined) return [`turn-${redone}`];
    }
  }
  return ['fade'];
};

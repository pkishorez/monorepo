/** A way a finger can swipe. */
export type Way = 'up' | 'down' | 'left' | 'right';

/** How far, in px, the moving finger goes before its way is read. */
export const DECIDE = 14;

/** Where the moving finger is, against where it landed. */
export type Reading =
  | { readonly kind: 'undecided' }
  | { readonly kind: 'wrong'; readonly way: Way }
  | { readonly kind: 'going'; readonly way: Way };

const wayOf = (dx: number, dy: number): Way =>
  Math.abs(dx) > Math.abs(dy)
    ? dx > 0
      ? 'right'
      : 'left'
    : dy > 0
      ? 'down'
      : 'up';

/**
 * Reads the moving finger. Its way is read once it has gone DECIDE px and
 * kept until it comes back near where it landed, so a finger can change its
 * mind. A way that does not work here is Wrong.
 */
export const read = (
  before: Reading,
  dx: number,
  dy: number,
  works: (way: Way) => boolean,
): Reading => {
  const distance = Math.hypot(dx, dy);
  if (distance < DECIDE / 2) return { kind: 'undecided' };
  if (before.kind !== 'undecided') return before;
  if (distance < DECIDE) return before;
  const way = wayOf(dx, dy);
  return works(way) ? { kind: 'going', way } : { kind: 'wrong', way };
};

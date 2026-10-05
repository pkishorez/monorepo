/** A way a finger can swipe. */
export type Way = 'up' | 'down' | 'left' | 'right';

export const WAYS: ReadonlyArray<Way> = ['up', 'down', 'left', 'right'];

/** How far, in px, the moving finger goes before its way is read. */
export const DECIDE = 14;

/** How far, in px, along its way the finger goes to arm the Command. */
export const COMMIT = 72;

/** Where the moving finger is, against where it landed. */
export type Reading =
  | { readonly kind: 'undecided' }
  | { readonly kind: 'wrong'; readonly way: Way }
  | {
      readonly kind: 'going';
      readonly way: Way;
      /** 0 to 1: how far to arming. */
      readonly progress: number;
      readonly armed: boolean;
    };

const wayOf = (dx: number, dy: number): Way =>
  Math.abs(dx) > Math.abs(dy)
    ? dx > 0
      ? 'right'
      : 'left'
    : dy > 0
      ? 'down'
      : 'up';

const along = (way: Way, dx: number, dy: number) =>
  way === 'right' ? dx : way === 'left' ? -dx : way === 'down' ? dy : -dy;

/**
 * Reads the moving finger. Its way is read once it has gone DECIDE px and
 * kept until it comes back near where it landed, so a finger can change its
 * mind. A way whose Command does nothing here is Wrong.
 */
export const read = (
  before: Reading,
  dx: number,
  dy: number,
  works: (way: Way) => boolean,
): Reading => {
  const distance = Math.hypot(dx, dy);
  if (distance < DECIDE / 2) return { kind: 'undecided' };
  if (before.kind === 'undecided') {
    if (distance < DECIDE) return before;
    const way = wayOf(dx, dy);
    if (!works(way)) return { kind: 'wrong', way };
    return reading(way, dx, dy);
  }
  if (before.kind === 'wrong') return before;
  return reading(before.way, dx, dy);
};

const reading = (way: Way, dx: number, dy: number): Reading => {
  const gone = Math.max(0, along(way, dx, dy));
  return {
    kind: 'going',
    way,
    progress: Math.min(1, gone / COMMIT),
    armed: gone >= COMMIT,
  };
};

import type { How } from '@kestack/kabuki/routing';

/*
 * One curve and two speeds for everything that moves, so the site moves as
 * one thing. A push comes in from the right and Back from the left; a
 * replace or a first load only fades.
 */

export const EASE = [0.32, 0.72, 0, 1] as const;

export const quick = { duration: 0.18, ease: EASE } as const;
export const settle = { duration: 0.26, ease: EASE } as const;

/** Which way a move goes: forward, back, or neither. */
export const directionOf = (how: How) =>
  how === 'back' ? -1 : how === 'push' || how === 'forward' ? 1 : 0;

/** A page or a pane coming in and going out, by the direction of the move. */
export const slide = {
  enter: (direction: number) => ({
    opacity: 0,
    x: direction * 20,
    y: direction === 0 ? 6 : 0,
  }),
  center: { opacity: 1, x: 0, y: 0 },
  exit: (direction: number) => ({ opacity: 0, x: direction * -20 }),
};

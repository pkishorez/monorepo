import { useMemo } from 'react';
import { Easing, useReducedMotion } from 'react-native-reanimated';

/**
 * How the picker moves, as the web's does: the highlight springs from row
 * to row, a list slides in and out, the menu and scrim fade. All of it is
 * still for those who ask for less motion.
 */
export type Moves = {
  readonly still: boolean;
  readonly row: { readonly duration: number; readonly dampingRatio: number };
  readonly slide: { readonly duration: number; readonly dampingRatio: number };
  readonly fade: number;
  readonly ease: ReturnType<typeof Easing.bezier>;
};

export const useMoves = (): Moves => {
  const still = useReducedMotion();
  return useMemo(
    () => ({
      still,
      row: { duration: 180, dampingRatio: 0.85 },
      slide: { duration: 280, dampingRatio: 0.9 },
      fade: still ? 0 : 160,
      ease: Easing.bezier(0.23, 1, 0.32, 1),
    }),
    [still],
  );
};

/** A Wrong Way: the menu shakes side to side, once, over this many ms. */
export const SHAKE = { at: [-6, 5, -3, 2, 0], duration: 320 } as const;

/** How far, in points, each list behind the open one sits to the top left. */
export const BEHIND = { x: -104, y: -28 } as const;

/** How wide a list is, in points. */
export const WIDTH = 196;

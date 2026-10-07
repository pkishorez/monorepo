import type { Directions } from '../direction/index.ts';
import type { GestureListener, Pointer, Pointers } from '../provider/index.ts';

/** Where the moving finger is, in px from where it landed. */
export type Finger = { readonly x: number; readonly y: number };

/** What a Thumb Lock tells as it goes. */
export type ThumbLockOptions = {
  /** Whether it takes the next touch, read as the first finger lands. */
  readonly enabled: () => boolean;
  /** How wide the screen is now, in px: the thumb lands on its left half. */
  readonly width: () => number;
  /** The thumb is still and another finger landed: the Lock holds. */
  readonly onLock: () => void;
  /** The other finger moved, to `finger` from where it landed. */
  readonly onMove: (finger: Finger) => void;
  /**
   * The Lock let go: `lifted` when the other finger lifted first, false when
   * the thumb lifted first or the touch was taken away.
   */
  readonly onEnd: (lifted: boolean) => void;
};

// The thumb lands on this part of the screen's width, from the left.
const THUMB_PART = 0.5;
// How far, in px, the thumb may drift and still be still.
const STILL = 14;

/**
 * A Thumb Lock as a Gesture listener, on any platform: the left thumb
 * resting still while another finger moves. The Lock holds when a second
 * finger lands while the first, landed on the left half of the screen, has
 * stayed within STILL px. From then on it takes the touch in every
 * Direction and tells each move of that finger; a touch of one finger, or
 * one whose first finger landed on the right, it leaves alone, so the page
 * still scrolls. The other finger lifting first ends it lifted; the thumb
 * lifting first, or the touch being taken, calls it off. The thumb may stay
 * down for another Lock. It is a worklet, as is the provider, so a phone can
 * run both on its UI thread and answer a finger in the frame it moves.
 */
export const thumbLock = <Target>(
  options: ThumbLockOptions,
): GestureListener<Target> => {
  'worklet';
  let thumb: number | undefined;
  let mover: number | undefined;
  // Nothing is taken until the Lock holds; then every Direction is.
  let directions: Directions = [];

  const release = (lifted: boolean) => {
    if (mover === undefined) return;
    mover = undefined;
    directions = [];
    options.onEnd(lifted);
  };

  const still = (pointers: Pointers<Target>) => {
    const held = thumb === undefined ? undefined : pointers.get(thumb);
    return (
      held !== undefined &&
      held.end === undefined &&
      Math.hypot(held.dx, held.dy) <= STILL
    );
  };

  const landed = (pointer: Pointer<Target>, pointers: Pointers<Target>) => {
    if (thumb === undefined || pointer.id === thumb || mover !== undefined) {
      return;
    }
    if (!still(pointers)) return;
    mover = pointer.id;
    directions = 'all';
    options.onLock();
  };

  const lifted = (pointer: Pointer<Target>) => {
    if (pointer.id === mover) release(true);
    else if (pointer.id === thumb) {
      thumb = undefined;
      release(false);
    }
  };

  return {
    enabled: options.enabled,
    directions: () => directions,
    start: (pointers) => {
      const [first] = pointers.values();
      thumb =
        first !== undefined && first.start.x <= options.width() * THUMB_PART
          ? first.id
          : undefined;
    },
    pointer: (pointer, pointers) =>
      pointer.end === undefined ? landed(pointer, pointers) : lifted(pointer),
    move: (pointer) => {
      if (pointer.id === mover)
        options.onMove({ x: pointer.dx, y: pointer.dy });
    },
    end: () => {
      thumb = undefined;
      release(false);
    },
  };
};

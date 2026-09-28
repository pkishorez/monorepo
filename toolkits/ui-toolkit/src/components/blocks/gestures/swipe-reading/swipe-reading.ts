import type { GestureValues, Point } from '../gesture-reading';

export type Axis = 'x' | 'y';

/** A Swipe as it moves: `started` on the move that fixed its axis. */
export type SwipeMove = {
  readonly axis: Axis;
  readonly distance: number;
  readonly started: boolean;
};

/**
 * A finished Swipe: the signed distance along its axis in px, where it
 * started in viewport px, and its speed along the axis in px per second.
 * `interrupted` when a second finger or the browser taking the touch ended it.
 */
export type SwipeEnd = {
  readonly axis: Axis;
  readonly distance: number;
  readonly origin: Point;
  readonly velocity: number;
  readonly interrupted: boolean;
};

// How far one finger moves before its main direction fixes the axis. Less
// is a finger settling, or a Tap.
export const AXIS_LOCK_PX = 8;

type State =
  | { readonly phase: 'idle' }
  | { readonly phase: 'waiting'; readonly origin: Point }
  | {
      readonly phase: 'swiping';
      readonly origin: Point;
      readonly axis: Axis;
      readonly distance: number;
    };

/**
 * Reads a Swipe from a Gesture: one finger moving along one axis, fixed by
 * its first real movement, as a signed distance from where it started. A
 * second finger ends the Swipe as interrupted, and no new Swipe starts until
 * every finger has lifted and a new Gesture begins.
 */
export const createSwipeReading = () => {
  let state: State = { phase: 'idle' };

  const finish = (velocity: GestureValues, interrupted: boolean) => {
    const was = state;
    state = { phase: 'idle' };
    if (was.phase !== 'swiping') return undefined;
    return {
      axis: was.axis,
      distance: was.distance,
      origin: was.origin,
      velocity: velocity[was.axis],
      interrupted,
    } satisfies SwipeEnd;
  };

  return {
    axis: (): Axis | undefined =>
      state.phase === 'swiping' ? state.axis : undefined,
    /** A new Gesture starts with one finger at `origin`. */
    start: (origin: Point) => {
      state = { phase: 'waiting', origin };
    },
    /** The one-finger Gesture moved to `values`. */
    move: (values: GestureValues): SwipeMove | undefined => {
      if (state.phase === 'idle') return undefined;
      if (state.phase === 'swiping') {
        state = { ...state, distance: values[state.axis] };
        return { axis: state.axis, distance: state.distance, started: false };
      }
      const across = Math.abs(values.x);
      const down = Math.abs(values.y);
      if (Math.max(across, down) < AXIS_LOCK_PX) return undefined;
      const axis: Axis = across >= down ? 'x' : 'y';
      state = {
        phase: 'swiping',
        origin: state.origin,
        axis,
        distance: values[axis],
      };
      return { axis, distance: state.distance, started: true };
    },
    /** A second finger lands: any Swipe ends, interrupted. */
    join: (velocity: GestureValues) => finish(velocity, true),
    /** The last finger lifts, or the touch was taken away: `interrupted`. */
    end: (velocity: GestureValues, interrupted = false) =>
      finish(velocity, interrupted),
  };
};

export type SwipeReading = ReturnType<typeof createSwipeReading>;

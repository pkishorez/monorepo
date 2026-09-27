import type { MotionValue } from 'motion';
import { along, type Direction, type MovementEvent, opposite } from '../engine';
import { band, type GestureSpring, settle, shouldCommit } from './springs';

export type SwipeOptions = {
  readonly direction: Direction;
  /** Travel in px that is progress 1. */
  readonly distance: number;
  /** After a commit: spring back to 0 (`return`), or stay open at 1 (`stay`). */
  readonly after: 'return' | 'stay';
  /** `false`: the app animates `progress` after release itself. */
  readonly settle: boolean;
  readonly spring?: GestureSpring;
  readonly onSwipe?: () => void | Promise<void>;
  readonly onCancel?: () => void;
};

/**
 * Drives a Swipe's `progress`, 0 at rest to 1 committed, from the gesture
 * events it is given; `armed` is 1 while releasing now would commit.
 * Dragging follows the finger however slowly, clamped at 0 and rubber-banded
 * past 1. A release commits past 40% or on a forward flick and springs on
 * with the finger's speed, or springs back. After a commit `return` runs
 * `onSwipe`, holds at 1 until its promise settles and springs home; `stay`
 * stays at 1 until a Swipe the opposite way drags it back. A touch landing
 * mid-spring catches it where it is.
 */
export const createSwipe = (
  values: {
    readonly progress: MotionValue<number>;
    readonly armed: MotionValue<number>;
  },
  options: () => SwipeOptions,
) => {
  const { progress, armed } = values;
  // Where it rests, or is springing to.
  let heading: 0 | 1 = 0;
  // Committed with `return`: held at 1 until `onSwipe` settles.
  let busy = false;
  let run = 0;
  let caught = false;
  let drag: { readonly base: number; readonly sign: 1 | -1 } | undefined;

  const toward = (to: 0 | 1, velocity: number): Promise<void> => {
    heading = to;
    return options().settle
      ? settle(progress, to, { velocity, spring: options().spring })
      : Promise.resolve();
  };

  /** Toward 1, px/ms, and whether releasing now commits the way the drag goes. */
  const read = (event: MovementEvent, sign: 1 | -1) => {
    const direction = event.direction ?? options().direction;
    const speed = along(event.velocity, direction);
    const value = progress.get();
    return {
      speed,
      commits: shouldCommit(
        sign === 1
          ? { progress: value, velocity: speed }
          : { progress: 1 - value, velocity: speed },
      ),
    };
  };

  const follow = (event: MovementEvent) => {
    if (drag === undefined) return;
    const { distance } = options();
    const direction = event.direction ?? options().direction;
    const raw =
      drag.base + (drag.sign * along(event.offset, direction)) / distance;
    progress.set(raw <= 0 ? 0 : band(raw, 0, 1, 1));
    armed.set(read(event, drag.sign).commits ? 1 : 0);
  };

  const commit = async (velocity: number) => {
    const { after, onSwipe } = options();
    const id = ++run;
    const landed = toward(1, velocity);
    const done = onSwipe?.();
    if (after === 'stay') return;
    busy =
      done !== undefined &&
      typeof (done as PromiseLike<void>).then === 'function';
    await Promise.allSettled([landed, done]);
    if (id !== run) return;
    busy = false;
    await toward(0, 0);
  };

  const release = (event: MovementEvent) => {
    if (drag === undefined) return;
    const { sign } = drag;
    const { speed, commits } = read(event, sign);
    drag = undefined;
    armed.set(0);
    const velocity = (sign * speed) / options().distance;
    if (sign === 1 && commits) {
      void commit(velocity);
      return;
    }
    if (sign === 1) options().onCancel?.();
    void toward(sign === 1 ? 0 : commits ? 0 : 1, velocity);
  };

  return {
    /** Open and staying open: a `stay` Swipe at 1 or springing there. */
    opened: (): boolean => options().after === 'stay' && heading === 1,
    /** The directions a new Swipe may take it now. */
    directions: (): ReadonlyArray<Direction> => {
      if (busy) return [];
      const { direction, after } = options();
      const back = opposite(direction);
      if (progress.isAnimating() || caught) return [direction, back];
      const value = progress.get();
      if (value <= 0) return [direction];
      if (value >= 1) return after === 'stay' ? [back] : [];
      return [direction, back];
    },
    handle: (event: MovementEvent) => {
      switch (event.phase) {
        case 'start':
          run += 1;
          caught = false;
          progress.stop();
          drag = {
            base: progress.get(),
            sign: event.direction === options().direction ? 1 : -1,
          };
          follow(event);
          return;
        case 'move':
          follow(event);
          return;
        case 'end':
          follow(event);
          release(event);
          return;
        case 'cancel':
          drag = undefined;
          armed.set(0);
          void toward(heading, 0);
      }
    },
    catch: () => {
      if (busy || !progress.isAnimating()) return;
      progress.stop();
      caught = true;
    },
    /** The touch that caught it made no Swipe: carry on where it was going. */
    release: () => {
      if (!caught) return;
      caught = false;
      void toward(heading, 0);
    },
    /** Commits as if swiped: springs to 1 and runs `onSwipe`. */
    open: () => {
      if (!busy) void commit(0);
    },
    close: () => {
      if (!busy) void toward(0, 0);
    },
  };
};

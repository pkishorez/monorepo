import { type MotionValue, useMotionValue } from 'motion/react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { type Direction, Swipe as Rules } from '@kstackz/use-gesture';
import { type Pointers, useGesture } from '../../zones/index.ts';

export type { Direction } from '@kstackz/use-gesture';
export type CommitRule = Rules.CommitRule;
export type Edge = Rules.Edge;
export type Fingers = Rules.Fingers;
export type SwipeCancel = Rules.SwipeCancel;
export type SwipeRelease = Rules.SwipeRelease;

// The fingers still down, each with how far it moved from where it landed.
const down = (pointers: Pointers) =>
  [...pointers.values()]
    .filter((pointer) => pointer.end === undefined)
    .map((pointer) => ({ dx: pointer.dx.get(), dy: pointer.dy.get() }));

export type SwipeOptions = {
  /** Whether it takes the next Gesture: true by default. Read as its first finger lands. */
  readonly enabled?: boolean;
  readonly direction: Direction;
  /** How many fingers: 1 by default. */
  readonly fingers?: Fingers;
  /**
   * Where the first finger must land; anywhere in the zone by default. A touch
   * that lands there is the Swipe's even over an element that scrolls, and it
   * takes no touch that lands anywhere else.
   */
  readonly from?: Edge;
  /** What it needs at release to Commit: `{ distance: 80, velocity: 500 }` by default. */
  readonly commit?: CommitRule;
  /** The touch's Direction is `direction`, with the right fingers: it is Tracking. */
  readonly onStart?: () => void;
  /** It met its CommitRule as its first finger lifted. */
  readonly onCommit?: (release: SwipeRelease) => void;
  /** It gave up; `release` is set when that was at a finger lifting. */
  readonly onCancel?: (reason: SwipeCancel, release?: SwipeRelease) => void;
};

/**
 * `possible` from the first finger landing where `from` asks until the
 * touch's Direction is read, then `tracking` until it Commits or Cancels.
 */
export type SwipeState = 'idle' | 'possible' | 'tracking';

export type Swipe = {
  /** Px moved toward `direction`, never below 0. Reset as the next Gesture lands. */
  readonly offset: MotionValue<number>;
  /** `offset` over the CommitRule's `distance`, unclamped; 0 without a `distance`. */
  readonly progress: MotionValue<number>;
  /** Px/s toward `direction`, falling to 0 while the fingers rest. */
  readonly velocity: MotionValue<number>;
  /** Whether letting go now would Commit. */
  readonly willCommit: MotionValue<boolean>;
  readonly state: SwipeState;
};

type Run = {
  phase: 'possible' | 'tracking' | 'done';
  // Whether the touch's Direction is the Swipe's own.
  locked: boolean;
  pointers: Pointers;
  readonly velocity: ReturnType<typeof Rules.createVelocity>;
  readonly unsubscribes: Array<() => void>;
  timer?: ReturnType<typeof setInterval>;
};

// How often velocity is re-read while the fingers rest.
const TICK = 16;

const useLatest = <T>(value: T) => {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
};

/**
 * The Swipe Recognizer: fingers moving one way. It wants its own Direction,
 * or, with `from`, captures touches landing at that edge. It locks once the
 * touch's Direction is read, follows the fingers while Tracking, and
 * decides at the first finger lifting, so a two-finger Swipe is judged as
 * its fingers leave.
 */
export function useSwipe(options: SwipeOptions): Swipe {
  const latest = useLatest(options);
  const offset = useMotionValue(0);
  const progress = useMotionValue(0);
  const velocity = useMotionValue(0);
  const willCommit = useMotionValue(false);
  const [state, setState] = useState<SwipeState>('idle');
  const run = useRef<Run | undefined>(undefined);

  const rule = () => latest.current.commit ?? Rules.DEFAULT_COMMIT;

  const stop = (current: Run) => {
    current.phase = 'done';
    clearInterval(current.timer);
    velocity.set(0);
    willCommit.set(false);
    setState('idle');
  };

  const cancel = (current: Run, reason: SwipeCancel, at?: SwipeRelease) => {
    stop(current);
    latest.current.onCancel?.(reason, at);
  };

  // Velocity and what it means for a Commit, re-read on every move and tick.
  const measure = (current: Run) => {
    const speed = current.velocity.at(performance.now(), offset.get());
    velocity.set(speed);
    willCommit.set(Rules.commits(rule(), offset.get(), speed));
  };

  const step = (current: Run) => {
    const { direction, fingers = 1 } = latest.current;
    const live = down(current.pointers);
    const move = Rules.movement(live);
    if (current.phase === 'possible') {
      if (!current.locked) return;
      if (!Rules.fingersMatch(fingers, live.length)) {
        return cancel(current, 'fingers');
      }
      current.phase = 'tracking';
      current.timer = setInterval(() => measure(current), TICK);
      setState('tracking');
      latest.current.onStart?.();
    }
    if (current.phase !== 'tracking') return;
    const value = Math.max(0, Rules.along(direction, move));
    const { distance } = rule();
    offset.set(value);
    progress.set(distance === undefined ? 0 : value / distance);
    current.velocity.add(performance.now(), value);
    measure(current);
  };

  const end = (current: Run) => {
    for (const unsubscribe of current.unsubscribes) unsubscribe();
    clearInterval(current.timer);
    if (run.current === current) run.current = undefined;
  };

  useEffect(() => () => run.current && end(run.current), []);

  useGesture({
    enabled: options.enabled !== false,
    directions: options.from === undefined ? [options.direction] : [],
    // A Swipe from an edge owns touches that start there, over any scroller.
    captures: (point) => {
      const { from } = latest.current;
      const viewport = { width: innerWidth, height: innerHeight };
      return from !== undefined && Rules.startsFrom(from, point, viewport);
    },
    onStart: (pointers) => {
      const [first] = pointers.values();
      const viewport = { width: innerWidth, height: innerHeight };
      if (
        first === undefined ||
        !Rules.startsFrom(latest.current.from, first.start, viewport)
      ) {
        return;
      }
      offset.set(0);
      progress.set(0);
      run.current = {
        phase: 'possible',
        locked: false,
        pointers,
        velocity: Rules.createVelocity(),
        unsubscribes: [],
      };
      setState('possible');
    },
    onDirection: (way) => {
      const current = run.current;
      if (current === undefined || current.phase !== 'possible') return;
      if (way !== latest.current.direction) {
        return cancel(current, 'direction');
      }
      current.locked = true;
      step(current);
    },
    onPointer: (pointer, pointers) => {
      const current = run.current;
      if (current === undefined || current.phase === 'done') return;
      if (pointer.end === undefined) {
        // Followed once: a Gesture's first finger lands here too.
        current.pointers = pointers;
        current.unsubscribes.push(
          pointer.dx.on('change', () => step(current)),
          pointer.dy.on('change', () => step(current)),
        );
        if (current.phase === 'tracking') cancel(current, 'fingers');
        return;
      }
      if (current.phase !== 'tracking') {
        current.pointers = pointers;
        return;
      }
      measure(current);
      const at = Rules.release(offset.get(), velocity.get());
      if (willCommit.get()) {
        stop(current);
        latest.current.onCommit?.(at);
      } else {
        cancel(current, 'short', at);
      }
    },
    onEnd: (_pointers, { interrupted }) => {
      const current = run.current;
      if (current === undefined) return;
      if (current.phase !== 'done') {
        cancel(current, interrupted ? 'interrupted' : 'short');
      }
      end(current);
    },
  });

  return { offset, progress, velocity, willCommit, state };
}

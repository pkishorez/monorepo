import type { Direction } from '../direction/index.ts';

/** How many fingers must be down as a Swipe locks: exactly `n`, or `[min, max]`. */
export type Fingers = number | readonly [min: number, max: number];

/** Where a Swipe's first finger must land: within `within` px of a viewport edge. */
export type Edge = {
  readonly edge: 'top' | 'bottom' | 'left' | 'right';
  readonly within: number;
};

/**
 * What a Swipe needs at release to Commit: `distance` in px toward its
 * direction, or `velocity` in px/s toward it. Either one is enough; a Swipe
 * with only `velocity` is a flick.
 */
export type CommitRule = {
  readonly distance?: number;
  readonly velocity?: number;
};

/**
 * Why a Swipe Cancelled: the touch's Direction was not its own; the wrong
 * number of fingers were down as it locked, or one landed after; it lifted
 * without meeting its CommitRule; or the Gesture was Interrupted, by the
 * browser or another zone.
 */
export type SwipeCancel = 'direction' | 'fingers' | 'short' | 'interrupted';

/** Where a Swipe was as its first finger lifted. */
export type SwipeRelease = {
  /** Px moved toward its direction, never below 0. */
  readonly offset: number;
  /** Px/s toward its direction; negative when moving back. */
  readonly velocity: number;
  /** Where its momentum would carry `offset`: for choosing where to settle. */
  readonly projected: number;
};

/** The ms of movement velocity is measured over. */
export const VELOCITY_WINDOW = 100;

/** The seconds of momentum `projected` adds. */
const PROJECTION = 0.15;

/** What a Swipe needs to Commit unless told otherwise. */
export const DEFAULT_COMMIT: CommitRule = { distance: 80, velocity: 500 };

/** How far a finger, or the fingers on average, moved from where they landed, in px. */
export type Movement = { readonly dx: number; readonly dy: number };

const AXES = {
  up: ['y', -1],
  down: ['y', 1],
  left: ['x', -1],
  right: ['x', 1],
} as const satisfies Record<Direction, readonly ['x' | 'y', 1 | -1]>;

/** How the fingers still down moved on average, given each one's Movement. */
export const movement = (fingers: ReadonlyArray<Movement>): Movement => {
  if (fingers.length === 0) return { dx: 0, dy: 0 };
  let dx = 0;
  let dy = 0;
  for (const finger of fingers) {
    dx += finger.dx;
    dy += finger.dy;
  }
  return { dx: dx / fingers.length, dy: dy / fingers.length };
};

/** Px of `move` toward `direction`; negative when away from it. */
export const along = (direction: Direction, move: Movement) => {
  const [axis, sign] = AXES[direction];
  return sign * (axis === 'x' ? move.dx : move.dy);
};

/** Whether `count` fingers down is what `fingers` asks. */
export const fingersMatch = (fingers: Fingers, count: number) =>
  typeof fingers === 'number'
    ? count === fingers
    : count >= fingers[0] && count <= fingers[1];

/** Whether a finger landing at `point` is where `from` asks, in a `width` × `height` viewport. */
export const startsFrom = (
  from: Edge | undefined,
  point: { readonly x: number; readonly y: number },
  viewport: { readonly width: number; readonly height: number },
) => {
  if (from === undefined) return true;
  const { x, y } = point;
  switch (from.edge) {
    case 'left':
      return x <= from.within;
    case 'right':
      return x >= viewport.width - from.within;
    case 'top':
      return y <= from.within;
    case 'bottom':
      return y >= viewport.height - from.within;
  }
};

/** Whether a Swipe at `offset` px moving at `velocity` px/s meets `rule`. */
export const commits = (rule: CommitRule, offset: number, velocity: number) =>
  (rule.distance !== undefined && offset >= rule.distance) ||
  (rule.velocity !== undefined && velocity >= rule.velocity);

/** Where a Swipe was as it let go, with where its momentum would carry it. */
export const release = (offset: number, velocity: number): SwipeRelease => ({
  offset,
  velocity,
  projected: Math.max(0, offset + velocity * PROJECTION),
});

/**
 * Velocity over the last VELOCITY_WINDOW ms. Read with where the Swipe is
 * now, it falls to 0 while the fingers rest, even with no new movement.
 */
export const createVelocity = () => {
  let samples: Array<{ readonly t: number; readonly value: number }> = [];
  return {
    add: (t: number, value: number) => {
      samples = samples.filter((sample) => sample.t >= t - VELOCITY_WINDOW);
      samples.push({ t, value });
    },
    /** Px/s at `t`, with the Swipe now at `value`. */
    at: (t: number, value: number) => {
      const [oldest] = samples.filter(
        (sample) => sample.t >= t - VELOCITY_WINDOW,
      );
      if (oldest === undefined || t <= oldest.t) return 0;
      return ((value - oldest.value) / (t - oldest.t)) * 1000;
    },
  };
};

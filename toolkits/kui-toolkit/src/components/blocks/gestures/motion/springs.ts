import { animate, type MotionValue } from 'motion';

/** Share of the full travel at or past which a slow release commits. */
export const COMMIT_PROGRESS = 0.4;
/** Release speed toward (or away from) commit, in px/ms, that decides on its own. */
export const FLICK_VELOCITY = 0.3;

/**
 * Whether a released Swipe commits (opens the drawer, refreshes the feed):
 * a flick decides by its direction; a slow release commits at 40% of the
 * travel or past it. `progress` and `velocity` are measured toward commit.
 */
export const shouldCommit = (release: {
  readonly progress: number;
  readonly velocity: number;
}): boolean => {
  if (release.velocity >= FLICK_VELOCITY) return true;
  if (release.velocity <= -FLICK_VELOCITY) return false;
  return release.progress >= COMMIT_PROGRESS;
};

// UIScrollView's constant: resistance that grows with distance.
const RUBBER_BAND = 0.55;

/**
 * How far a surface moves when the finger has gone `overshoot` px past its
 * bound: less and less, never as far as `dimension`.
 */
export const rubberBand = (overshoot: number, dimension: number): number =>
  dimension <= 0
    ? 0
    : (1 - 1 / ((overshoot * RUBBER_BAND) / dimension + 1)) * dimension;

/** `value` past `min` or `max` pulled back by the rubber band over `dimension`. */
export const band = (
  value: number,
  min: number,
  max: number,
  dimension: number,
): number => {
  if (value < min) return min - rubberBand(min - value, dimension);
  if (value > max) return max + rubberBand(value - max, dimension);
  return value;
};

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

// Read as each animation starts, so turning the setting on applies at once;
// motion's useReducedMotion reads it only on mount.
const reducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export type GestureSpring = {
  readonly stiffness: number;
  readonly damping: number;
  readonly mass: number;
};

/** The quick, near-critical spring used by gesture settles unless overridden. */
export const DEFAULT_GESTURE_SPRING: GestureSpring = {
  stiffness: 600,
  damping: 50,
  mass: 1,
};

/**
 * Springs `value` to `to`, starting at `velocity` (units per ms) so a
 * release carries the finger's speed into the landing. Reduced motion jumps
 * straight there. `value.stop()` catches it where it is. Resolves when it
 * lands.
 */
export const settle = (
  value: MotionValue<number>,
  to: number,
  options: {
    readonly velocity?: number;
    readonly spring?: GestureSpring;
  } = {},
): Promise<void> => {
  if (reducedMotion() || value.get() === to) {
    value.stop();
    value.set(to);
    return Promise.resolve();
  }
  return animate(value, to, {
    type: 'spring',
    ...(options.spring ?? DEFAULT_GESTURE_SPRING),
    velocity: (options.velocity ?? 0) * 1000,
  }).finished.then(() => undefined);
};

// motion's inertia defaults, which feel like a UIScrollView flick: the
// surface runs on 0.8 × the release speed (per second) and slows over ~1s.
const COAST_POWER = 0.8;
const COAST_TIME_CONSTANT = 325;

/**
 * Lets `value` run on with the finger's speed (units per ms) and slow to a
 * stop by friction (motion's `inertia`). Past `min` or `max` it bounces back
 * to the bound. `snap` is a step it must come to rest on, for detents.
 * Reduced motion jumps straight to where it would rest. Rest is judged to
 * half a unit, so coast pixels, not fractions.
 */
export const coast = (
  value: MotionValue<number>,
  options: {
    readonly velocity: number;
    readonly min?: number;
    readonly max?: number;
    readonly snap?: number;
  },
): Promise<void> => {
  const { min, max, snap } = options;
  const from = value.get();
  const inside = (at: number) => clamp(at, min ?? -Infinity, max ?? Infinity);
  const detent =
    snap === undefined || snap <= 0
      ? undefined
      : (at: number) => Math.round(at / snap) * snap;
  const ideal = from + COAST_POWER * options.velocity * 1000;
  // Where it comes to rest. Released past a bound, it goes straight back.
  const rest =
    inside(from) !== from ? inside(from) : inside(detent?.(ideal) ?? ideal);
  if (reducedMotion() || rest === from) {
    value.stop();
    value.set(rest);
    return Promise.resolve();
  }
  // Inertia reads only the start and plots its own way; the end is given
  // because motion skips an animation whose keyframes do not change.
  return animate(value, rest, {
    type: 'inertia',
    velocity: options.velocity * 1000,
    power: COAST_POWER,
    timeConstant: COAST_TIME_CONSTANT,
    min,
    max,
    modifyTarget: detent,
  }).finished.then(() => undefined);
};

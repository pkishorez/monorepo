import { STORY } from './cloud.ts';
import type { V3 } from './cloud.ts';

/*
 * The clocks a shape keeps time by, written once here for the labels and
 * once in the shader for the points, the same arithmetic on both sides so
 * a label that names the lit state, the flashing card or the playhead's
 * commit always names the one drawn. And the Label itself: words pinned to
 * a place in a shape.
 */

/** The field's clock: seconds run, and how much motion is on, 0..1. */
export type Clock = { readonly time: number; readonly motion: number };

const fract = (x: number) => x - Math.floor(x);
const clamp01 = (x: number) => Math.min(Math.max(x, 0), 1);

export const smooth = (a: number, b: number, x: number): number => {
  const k = clamp01((x - a) / (b - a));
  return k * k * (3 - 2 * k);
};

/**
 * Where in a loop of `period` seconds the clock is, 0..1. Still, at 0.7,
 * for a reader who asked for less motion. (shader: `loopOf`)
 */
export const loopOf = (clock: Clock, period: number = STORY): number =>
  0.7 + (fract(clock.time / period) - 0.7) * clock.motion;

/**
 * 1 while `loop` is in the window from `start` for `length`, easing in
 * and out over `soft`; the window may wrap. (shader: `window`)
 */
export const windowOf = (
  loop: number,
  start: number,
  length: number,
  soft: number,
): number => {
  const x = fract(loop - start);
  return smooth(0, soft, x) * (1 - smooth(length - soft, length, x));
};

/** How drawn a `reveal` point at `u` is, 0..1. (shader: `Kind.reveal`) */
export const revealed = (
  clock: Clock,
  u: number,
  start: number,
  length: number,
): number => {
  const story = loopOf(clock);
  const g = clamp01((story - start) / Math.max(length, 0.02));
  const lit = 1 - smooth(g - 0.02, g, u);
  return lit * (1 - smooth(0.82, 0.95, story));
};

/** How far a `slide` point has gone, 0..1. (shader: `Kind.slide`) */
export const slid = (clock: Clock, start: number, length: number): number => {
  const story = loopOf(clock);
  return smooth(start, start + length, story) * (1 - smooth(0.88, 0.98, story));
};

/** Words pinned to a shape, drawn over the field. */
export type Label = {
  readonly text: string;
  /** Where, in the shape's own space; or where, now. */
  readonly at: V3 | ((clock: Clock) => V3);
  /**
   * `name`: a small mono label; `message`: a Message, as a pill; `note`: a
   * muted aside, left out on a small screen.
   */
  readonly kind?: 'name' | 'message' | 'note';
  /** How shown, 0..1, now; always, if not given. */
  readonly show?: (clock: Clock) => number;
  /** Whether it is the one lit now. */
  readonly lit?: (clock: Clock) => boolean;
};

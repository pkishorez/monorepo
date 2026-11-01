import { Kind, STORY } from './cloud.ts';
import type { Motion, V3 } from './cloud.ts';

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

/**
 * The beats every kabuki shape is timed by, written once for the shader
 * and the words alike. On the story clock, 0..1 of a loop: how long a
 * marker takes to hand over to the next, and how long a thing takes to
 * gather and to scatter. In seconds: how long a pop takes to swell and to
 * settle, and a ripple to run out. And how far `outBack` overshoots.
 */
export const TIMING = {
  handoff: 0.012,
  enter: 0.05,
  leave: 0.035,
  rise: 0.12,
  fall: 0.6,
  ripple: 0.9,
  overshoot: 1.4,
} as const;

/** Easings. (shader: the same names) */
export const outCubic = (x: number): number => 1 - (1 - x) ** 3;
export const outQuart = (x: number): number => 1 - (1 - x) ** 4;
export const inCubic = (x: number): number => x ** 3;
export const inOutQuart = (x: number): number =>
  x < 0.5 ? 8 * x ** 4 : 1 - (2 - 2 * x) ** 4 / 2;
export const outBack = (x: number): number =>
  1 + (TIMING.overshoot + 1) * (x - 1) ** 3 + TIMING.overshoot * (x - 1) ** 2;

/**
 * A `travel` or `glide` Motion: shown from `start` for `length` of the
 * story clock, moving by `by` over the last `move` of it. The shader reads
 * the length and the move from one number: whole thousandths of the move,
 * then the length as the fraction.
 */
export const moving = (
  kind: number,
  start: number,
  by: readonly [number, number],
  length: number,
  move: number,
): Motion => [
  kind,
  start,
  by[0],
  by[1],
  Math.round(move * 1000) + Math.min(length, 0.999),
];

/** A `pop` Motion: round `at`, from `start`, `repeats` times a loop, swelling by `amount` (under 1). */
export const popping = (
  start: number,
  at: V3,
  repeats: number,
  amount: number,
): Motion => [Kind.pop, start, at[0], at[1], repeats + amount];

/** A `ripple` Motion: from `at`, running out to `1 + 4 × reach` times its size. */
export const rippling = (
  start: number,
  at: V3,
  repeats: number,
  reach: number,
): Motion => [Kind.ripple, start, at[0], at[1], repeats + reach];

/**
 * Where a `travel` or `glide` point is on its way, 0..1 eased, and how
 * shown it is, 0..1. (shader: `Kind.travel`)
 */
export const travelled = (
  clock: Clock,
  start: number,
  length: number,
  move: number,
  kind: number,
): { readonly on: number; readonly s: number } => {
  const x = fract(loopOf(clock) - start);
  const u = clamp01((x - (length - move)) / move);
  return {
    on:
      smooth(0, TIMING.handoff, x) *
      (1 - smooth(length, length + TIMING.handoff, x)),
    s: kind === Kind.travel ? outQuart(u) : inOutQuart(u),
  };
};

/** How shown a `gather` point is, 0..1. (shader: `Kind.gather`) */
export const gathered = (
  clock: Clock,
  start: number,
  length: number,
): number => {
  const x = fract(loopOf(clock) - start);
  return x < length
    ? outCubic(clamp01(x / TIMING.enter))
    : 1 - inCubic(clamp01((x - length) / TIMING.leave));
};

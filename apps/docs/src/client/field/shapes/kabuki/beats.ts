import {
  Kind,
  STORY,
  ball,
  circle,
  moving,
  popping,
  rippling,
  stroke,
} from '../pen/index.ts';
import type { Cloud, Motion, V3 } from '../pen/index.ts';

/*
 * The beats every kabuki diagram is told in, so each reads as one chain:
 * a Message flies, it lands, and what it lands on pops at once, a ring
 * running out from it; and the next thing starts as the pop settles.
 */

/** Seconds into the loop, on the story clock. */
export const sec = (seconds: number): number => seconds / STORY;

/** How long a Message waits where it starts before it flies, in seconds. */
export const WAIT = 0.12;

/** When something pops: from `at` seconds, `repeats` times a loop. */
export type Pops = { readonly at: number; readonly repeats?: number };

/**
 * A point that matters: a bright ball; if it `pops`, it swells and a
 * ring runs out from it each time. `motion` is for one that does not pop.
 */
export function node(
  c: Cloud,
  at: V3,
  size: number,
  pops?: Pops,
  motion?: Motion,
  bright = 1.4,
): void {
  const repeats = pops?.repeats ?? 1;
  ball(
    c,
    c.n * 0.006 * size,
    at,
    0.022 * size,
    bright,
    pops ? popping(sec(pops.at), at, repeats, 0.6) : motion,
  );
  if (pops) ring(c, at, 0.03 * size, pops);
}

/** A ring running out from `at` when it pops. */
export function ring(c: Cloud, at: V3, r: number, pops: Pops): void {
  const ripple = rippling(sec(pops.at), at, pops.repeats ?? 1, 0.6);
  stroke(c, c.n * 0.012, circle(at, r, 'xy'), 0.9, () => ripple);
}

/**
 * A Message: a bright head and a short tail behind it, waiting at `from`
 * a moment from `at` seconds, then flying by `by` over `flight` seconds,
 * fast away and slow in, and gone as it lands.
 */
export function message(
  c: Cloud,
  from: V3,
  by: readonly [number, number],
  at: number,
  flight: number,
  kind: number = Kind.travel,
): void {
  const length = sec(WAIT + flight);
  ball(
    c,
    c.n * 0.004,
    from,
    0.016,
    2,
    moving(kind, sec(at), by, length, sec(flight)),
  );
  const TAIL = 48;
  for (let k = 1; k <= TAIL; k++) {
    const lag = (k / TAIL) * sec(0.12);
    const fade = (1 - k / TAIL) ** 1.6;
    ball(
      c,
      c.n * 0.0003,
      from,
      0.006,
      1.6 * fade,
      moving(kind, sec(at) + lag, by, length, sec(flight)),
    );
  }
}

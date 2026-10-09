import { Effect, Random } from 'effect';
import { HEIGHT, WIDTH } from './flow/index.js';
import type { Seed } from './flow/index.js';

/*
 * New particles, chosen at random. They run in Commands and Lifetimes, so
 * what they pick arrives in a Message and Replay sees the same particles.
 */

const MARGIN = 80;
const LIFESPAN = { min: 4500, max: 9000 };
const SPEED = { min: 60, max: 140 };
const DRIFT = 45;

const random = (min: number, max: number) => Random.nextBetween(min, max);

/** A particle somewhere on the canvas, following the flow from the start. */
const ambientSeed: Effect.Effect<Seed> = Effect.gen(function* () {
  return {
    x: yield* random(MARGIN, WIDTH - MARGIN),
    y: yield* random(MARGIN, HEIGHT - MARGIN),
    hue: yield* random(0, 360),
    hueDrift: yield* random(-DRIFT, DRIFT),
    lifespan: yield* random(LIFESPAN.min, LIFESPAN.max),
    speed: yield* random(SPEED.min, SPEED.max),
    heading: null,
    boost: 1,
  };
});

export const ambientSeeds = (count: number) =>
  Effect.all(Array.from({ length: count }, () => ambientSeed));

const BURST = 22;
const JITTER = 6;
const HUE_JITTER = 30;

/** A ring of particles bursting out of `x, y`, their hues around `hue`. */
export const burstSeeds = (x: number, y: number, hue: number) =>
  Effect.all(
    Array.from({ length: BURST }, (_, index) =>
      Effect.gen(function* () {
        return {
          x: x + (yield* random(-JITTER, JITTER)),
          y: y + (yield* random(-JITTER, JITTER)),
          hue: (hue + (yield* random(-HUE_JITTER, HUE_JITTER)) + 360) % 360,
          hueDrift: yield* random(-DRIFT, DRIFT),
          lifespan: yield* random(LIFESPAN.min * 0.85, LIFESPAN.max * 0.85),
          speed: yield* random(SPEED.min, SPEED.max),
          heading: (index / BURST) * Math.PI * 2,
          boost: yield* random(1.4, 2.2),
        } satisfies Seed;
      }),
    ),
  );

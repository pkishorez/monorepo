import { Schema } from 'effect';
import { angleAt, blend } from './field.js';
import type { Field } from './field.js';

/*
 * Particles carried by a flow field, step by step.
 *
 * A particle's path depends on the whole flow it went through, so there is
 * no formula for where it is: it is worked out in fixed steps of the clock.
 * The Model keeps each particle as of its last step (`from`) with its trail;
 * `advance` carries it on to any later reading of the clock with one Field.
 * Update settles every particle to the Message's Time before the Field
 * changes; the View advances them on to each Frame.
 */

export const WIDTH = 960;
export const HEIGHT = 600;

/** One step of the clock, in milliseconds. */
const STEP = 1000 / 60;
/** How many past places a particle's trail keeps. */
const TRAIL = 36;
/** How far past the edge a particle may go before it is gone. */
const MARGIN = 80;
/** How long a burst particle keeps some of its own heading and speed. */
const BOOST = 700;

const Point = Schema.Struct({ x: Schema.Number, y: Schema.Number });

/** What a new particle starts with: chosen at random by a Command. */
export const Seed = Schema.Struct({
  x: Schema.Number,
  y: Schema.Number,
  hue: Schema.Number,
  /** Degrees per second. */
  hueDrift: Schema.Number,
  lifespan: Schema.Number,
  speed: Schema.Number,
  /** A burst particle's heading at first; null follows the flow from the start. */
  heading: Schema.NullOr(Schema.Number),
  /** How much faster a burst particle starts. */
  boost: Schema.Number,
});
export type Seed = typeof Seed.Type;

/** A particle as of its last step: born at clock `born`, last stepped at clock `from`. */
export const Particle = Schema.Struct({
  id: Schema.Number,
  seed: Seed,
  born: Schema.Number,
  from: Schema.Number,
  trail: Schema.Array(Point),
});
export type Particle = typeof Particle.Type;

/** A particle, at once its place, its past, and whether it is gone. */
type Carried = {
  readonly from: number;
  readonly trail: ReadonlyArray<typeof Point.Type>;
  readonly gone: boolean;
};

export const born = (id: number, seed: Seed, clock: number): Particle => ({
  id,
  seed,
  born: clock,
  from: clock,
  trail: [{ x: seed.x, y: seed.y }],
});

const outside = ({ x, y }: typeof Point.Type) =>
  x < -MARGIN || x > WIDTH + MARGIN || y < -MARGIN || y > HEIGHT + MARGIN;

/** Step `carried` on through `field` until the next step would pass `clock`. */
export const advance = (
  particle: Particle,
  carried: Carried,
  field: Field,
  clock: number,
): Carried => {
  const { seed } = particle;
  const trail = [...carried.trail];
  let from = carried.from;
  let gone = carried.gone;
  while (!gone && from + STEP <= clock) {
    const here = trail[trail.length - 1]!;
    const age = from - particle.born;
    const boost = Math.max(0, 1 - age / BOOST);
    const flow = angleAt(field, here.x, here.y, from / 1000);
    const heading =
      seed.heading === null ? flow : blend(seed.heading, flow, 1 - boost);
    const speed = seed.speed * (1 + (seed.boost - 1) * boost);
    const next = {
      x: here.x + (Math.cos(heading) * speed * STEP) / 1000,
      y: here.y + (Math.sin(heading) * speed * STEP) / 1000,
    };
    from += STEP;
    gone = from - particle.born >= seed.lifespan || outside(next);
    trail.push(next);
    if (trail.length > TRAIL) trail.shift();
  }
  return { from, trail, gone };
};

/** Every particle stepped on to `clock` through `field`, the gone ones dropped. */
export const settle = (
  particles: ReadonlyArray<Particle>,
  field: Field,
  clock: number,
): ReadonlyArray<Particle> =>
  particles.flatMap((particle) => {
    const carried = advance(
      particle,
      { from: particle.from, trail: particle.trail, gone: false },
      field,
      clock,
    );
    return carried.gone
      ? []
      : [{ ...particle, from: carried.from, trail: carried.trail }];
  });

export type { Field };
export { POINTER_RADIUS } from './field.js';

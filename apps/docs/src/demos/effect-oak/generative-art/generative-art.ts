import { Effect, Schedule, Schema, Stream } from 'effect';
import { Node } from 'effect-oak';
import { born, Particle, Seed, settle } from './flow/index.js';
import { ambientSeeds, burstSeeds } from './seeds.js';

/*
 * Prism Field: particles carried by a drifting flow field. Running or Paused.
 *
 * The field keeps its own clock, which stops while Paused (as in the
 * stopwatch). Every Update first settles the particles: steps each one on to
 * the clock's reading through the flow as it was, and drops those that are
 * gone. Only then do the sliders, the pointer or the particles change. The
 * View carries the particles on from there to each Frame. Nothing ticks:
 * while Running, a Lifetime offers a new particle every so often, and the
 * field takes it while it has room.
 */

const TARGET = 55;
const FIRST = 45;
/** Every so often, a few new particles are offered: about as many as fade. */
const AMBIENT = { every: 500, count: 4 };
/** Degrees per second the burst hues move round the wheel. */
const BURST_HUE_DRIFT = 35;

export const FLOW_STRENGTH = { min: 0.25, max: 3, step: 0.05 };
export const NOISE_SCALE = { min: 0.4, max: 2.4, step: 0.05 };

const Point = Schema.Struct({ x: Schema.Number, y: Schema.Number });

type Clocked =
  | {
      readonly _tag: 'Running';
      readonly before: number;
      readonly since: number;
    }
  | { readonly _tag: 'Paused'; readonly clock: number };

/** What the field's clock reads at Time `at`, in milliseconds. */
export const clockAt = (state: Clocked, at: number) =>
  state._tag === 'Paused' ? state.clock : state.before + (at - state.since);

type Model = {
  readonly particles: ReadonlyArray<Particle>;
  readonly nextId: number;
  readonly flowStrength: number;
  readonly noiseScale: number;
  readonly pointer: typeof Point.Type | null;
};

/** The particles stepped on to Time `at` through the flow as it has been. */
const settled = (model: Model, state: Clocked, at: number): Model => ({
  ...model,
  particles: settle(model.particles, model, clockAt(state, at)),
});

const add = (model: Model, seeds: ReadonlyArray<Seed>, clock: number) => ({
  ...model,
  particles: [
    ...model.particles,
    ...seeds.map((seed, index) => born(model.nextId + index, seed, clock)),
  ],
  nextId: model.nextId + seeds.length,
});

export const Prism = Node.make('Prism', {
  model: Schema.Struct({
    particles: Schema.Array(Particle),
    nextId: Schema.Number,
    flowStrength: Schema.Number,
    noiseScale: Schema.Number,
    pointer: Schema.NullOr(Point),
  }),
  state: Schema.TaggedUnion({
    Running: { before: Schema.Number, since: Schema.Number },
    Paused: { clock: Schema.Number },
  }),
  message: Schema.TaggedUnion({
    CompletedGenerateAmbient: { seeds: Schema.Array(Seed) },
    CompletedGenerateBurst: { seeds: Schema.Array(Seed) },
    PressedCanvas: { x: Schema.Number, y: Schema.Number },
    MovedPointer: { x: Schema.Number, y: Schema.Number },
    ClickedTogglePlay: {},
    ClickedReset: {},
    ChangedFlowStrength: { value: Schema.Number },
    ChangedNoiseScale: { value: Schema.Number },
  }),
}).build({
  init: () => ({
    model: {
      particles: [],
      nextId: 0,
      flowStrength: 1.4,
      noiseScale: 1,
      pointer: null,
    },
    state: { _tag: 'Running', before: 0, since: 0 },
    commands: [
      Effect.map(ambientSeeds(FIRST), (seeds) => ({
        _tag: 'CompletedGenerateAmbient' as const,
        seeds,
      })),
    ],
  }),
  lifetime: {
    Running: () =>
      Stream.fromEffectSchedule(
        ambientSeeds(AMBIENT.count),
        Schedule.spaced(AMBIENT.every),
      ).pipe(
        Stream.map((seeds) => ({
          _tag: 'CompletedGenerateAmbient' as const,
          seeds,
        })),
      ),
  },
  update: {
    Running: {
      ClickedTogglePlay: (_, { model, state, at }) => ({
        model: settled(model, state, at),
        state: { _tag: 'Paused', clock: clockAt(state, at) },
      }),
    },
    Paused: {
      ClickedTogglePlay: (_, { state, at }) => ({
        state: { _tag: 'Running', before: state.clock, since: at },
      }),
    },
    '*': {
      CompletedGenerateAmbient: ({ seeds }, { model, state, at }) => {
        const now = settled(model, state, at);
        const room = Math.max(0, TARGET - now.particles.length);
        return { model: add(now, seeds.slice(0, room), clockAt(state, at)) };
      },
      CompletedGenerateBurst: ({ seeds }, { model, state, at }) => ({
        model: add(settled(model, state, at), seeds, clockAt(state, at)),
      }),
      PressedCanvas: ({ x, y }, { state, at }) => {
        const hue = ((clockAt(state, at) / 1000) * BURST_HUE_DRIFT) % 360;
        return {
          commands: [
            Effect.map(burstSeeds(x, y, hue), (seeds) => ({
              _tag: 'CompletedGenerateBurst' as const,
              seeds,
            })),
          ],
        };
      },
      MovedPointer: ({ x, y }, { model, state, at }) => ({
        model: { ...settled(model, state, at), pointer: { x, y } },
      }),
      ClickedReset: (_, { model }) => ({
        model: { ...model, particles: [], pointer: null },
      }),
      ChangedFlowStrength: ({ value }, { model, state, at }) => ({
        model: { ...settled(model, state, at), flowStrength: value },
      }),
      ChangedNoiseScale: ({ value }, { model, state, at }) => ({
        model: { ...settled(model, state, at), noiseScale: value },
      }),
    },
  },
});

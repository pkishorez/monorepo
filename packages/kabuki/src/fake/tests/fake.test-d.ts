import { Context, Effect, Layer, Schema, SubscriptionRef } from 'effect';
import { expectTypeOf } from 'vitest';
import { Fake, FakeWorld } from '../index.ts';
import type { StateOf } from '../types.ts';
import { Computers, OnOutdated, computers, newBuild } from './fakes.ts';

/*
 * A Fake's state is typed by its Schema alone: `initial`, each control's
 * state and the Layer's are checked against it. A FakeWorld's Layer is
 * every Fake's merged, and `start` is typed by each Fake's state.
 */

expectTypeOf<StateOf<typeof newBuild>>().toEqualTypeOf<{
  readonly newer: boolean;
}>();
expectTypeOf(newBuild.name).toEqualTypeOf<'newBuild'>();

// A control's state is typed by the state's Schema, and its payload by its own.
const Count = Schema.Struct({ count: Schema.Number });
Fake.make({
  name: 'typed',
  state: Count,
  initial: { count: 0 },
  controls: {
    Add: Fake.control(
      Count,
      Schema.Struct({ by: Schema.Number }),
      (payload, state) => {
        expectTypeOf(payload).toEqualTypeOf<{ readonly by: number }>();
        expectTypeOf(state).toEqualTypeOf<
          SubscriptionRef.SubscriptionRef<{ readonly count: number }>
        >();
        return SubscriptionRef.update(state, ({ count }) => ({
          count: count + payload.by,
        }));
      },
    ),
  },
  layer: (state) => {
    expectTypeOf(state).toEqualTypeOf<
      SubscriptionRef.SubscriptionRef<{ readonly count: number }>
    >();
    return Layer.empty;
  },
});

Fake.make({
  name: 'wrong',
  state: Schema.Struct({ count: Schema.Number }),
  // @ts-expect-error `initial` does not fit the state's Schema
  initial: { count: 'none' },
  controls: {},
  layer: () => Layer.empty,
});

Fake.make({
  name: 'wrong',
  state: Schema.Struct({ count: Schema.Number }),
  initial: { count: 0 },
  controls: {
    Add: Fake.control(Count, Schema.Struct({}), (_, state) =>
      // @ts-expect-error the state has no `total`
      SubscriptionRef.update(state, (s) => ({ ...s, total: s.total })),
    ),
  },
  layer: () => Layer.empty,
});

Fake.make({
  name: 'wrong',
  state: Schema.Struct({ count: Schema.Number }),
  initial: { count: 0 },
  controls: {
    // @ts-expect-error a control fails with a reason a person reads, a string
    Fails: Fake.control(Count, Schema.Struct({}), () => Effect.fail(404)),
  },
  layer: () => Layer.empty,
});

// The world's Layer gives every Fake's service.
class Needed extends Context.Service<Needed, { readonly n: number }>()(
  'test/Needed',
) {}
const needs = Fake.make({
  name: 'needs',
  state: Schema.Struct({}),
  initial: {},
  controls: {},
  layer: () =>
    Layer.effect(OnOutdated)(
      Effect.map(Needed, () => ({
        newer: Effect.succeed(false),
        waited: Effect.void,
      })),
    ),
});
const world = FakeWorld.make([newBuild, computers, needs]);
expectTypeOf(world.layer).toEqualTypeOf<
  Layer.Layer<OnOutdated | Computers, never, Needed>
>();
expectTypeOf(world.control('newBuild', 'PutOutNewerBuild', {})).toEqualTypeOf<
  Effect.Effect<'done', string>
>();

// `start` is typed by each Fake's state, by its name.
FakeWorld.make([newBuild, computers], {
  start: { newBuild: { newer: true }, computers: { names: [] } },
});
FakeWorld.make([newBuild], {
  // @ts-expect-error `newer` is a boolean
  start: { newBuild: { newer: 'yes' } },
});
FakeWorld.make([newBuild], {
  // @ts-expect-error no Fake is named `printer`
  start: { printer: {} },
});

// A control written for another state does not fit.
Fake.make({
  name: 'wrong',
  state: Count,
  initial: { count: 0 },
  controls: {
    // @ts-expect-error the control changes another Fake's state
    Other: newBuild.controls.PutOutNewerBuild!,
  },
  layer: () => Layer.empty,
});

// Two Fakes of one name are refused.
// @ts-expect-error two Fakes are named newBuild
FakeWorld.make([newBuild, computers, newBuild]);

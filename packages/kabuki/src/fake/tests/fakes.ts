import {
  Context,
  Effect,
  Layer,
  Schema,
  Stream,
  SubscriptionRef,
} from 'effect';
import { Fake } from '../index.ts';

/*
 * The Fakes the tests run, shaped as an app's are.
 *
 * - newBuild   whether a newer build is out. Serves `OnOutdated`, which
 *              waits for one.
 * - computers  the computers signed in, by name. Serves `Computers`.
 */

export class OnOutdated extends Context.Service<
  OnOutdated,
  {
    readonly newer: Effect.Effect<boolean>;
    readonly waited: Effect.Effect<void>;
  }
>()('test/OnOutdated') {}

export class Computers extends Context.Service<
  Computers,
  { readonly names: Effect.Effect<ReadonlyArray<string>> }
>()('test/Computers') {}

const NewBuild = Schema.Struct({ newer: Schema.Boolean });

export const newBuild = Fake.make({
  name: 'newBuild',
  state: NewBuild,
  initial: { newer: false },
  controls: {
    PutOutNewerBuild: Fake.control(NewBuild, Schema.Struct({}), (_, state) =>
      SubscriptionRef.update(state, (s) => ({ ...s, newer: true })),
    ),
  },
  layer: (state) =>
    Layer.succeed(OnOutdated, {
      newer: SubscriptionRef.get(state).pipe(Effect.map((s) => s.newer)),
      waited: SubscriptionRef.changes(state).pipe(
        Stream.filter((s) => s.newer),
        Stream.take(1),
        Stream.runDrain,
      ),
    }),
});

const Computer = Schema.Struct({ names: Schema.Array(Schema.String) });

export const computers = Fake.make({
  name: 'computers',
  state: Computer,
  initial: { names: ['mac'] },
  controls: {
    SignIn: Fake.control(
      Computer,
      Schema.Struct({ name: Schema.String }),
      ({ name }, state) =>
        SubscriptionRef.update(state, (s) => ({ names: [...s.names, name] })),
    ),
    SignOut: Fake.control(
      Computer,
      Schema.Struct({ name: Schema.String }),
      ({ name }, state) =>
        Effect.gen(function* () {
          const { names } = yield* SubscriptionRef.get(state);
          if (!names.includes(name))
            return yield* Effect.fail(`no computer named ${name}`);
          yield* SubscriptionRef.set(state, {
            names: names.filter((one) => one !== name),
          });
        }),
    ),
  },
  layer: (state) =>
    Layer.succeed(Computers, {
      names: SubscriptionRef.get(state).pipe(Effect.map((s) => s.names)),
    }),
});

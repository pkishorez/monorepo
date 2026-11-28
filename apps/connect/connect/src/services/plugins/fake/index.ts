import { Effect, Layer, Schema, Stream, SubscriptionRef } from 'effect';
import { Fake } from '@kestack/kabuki/fake';
import { Plugins, PluginStartFailed } from '../contract/index.js';

const Running = Schema.Struct({ name: Schema.String, hash: Schema.String });

export const PluginsState = Schema.Struct({
  running: Schema.Array(Running),
  failing: Schema.Array(Schema.String),
  starts: Schema.Finite,
});

const NAME = Schema.Struct({ name: Schema.String });

const isRunning = (now: PluginsState, name: string, hash: string) =>
  now.running.some((each) => each.name === name && each.hash === hash);

export const plugins = Fake.make({
  name: 'plugins',
  state: PluginsState,
  initial: { running: [], failing: [], starts: 0 },
  controls: {
    Crash: Fake.control(PluginsState, NAME, ({ name }, state) =>
      Effect.flatMap(SubscriptionRef.get(state), (now) =>
        now.running.some((each) => each.name === name)
          ? SubscriptionRef.set(state, {
              ...now,
              running: now.running.filter((each) => each.name !== name),
            })
          : Effect.fail(`${name} is not running`),
      ),
    ),
    FailStarts: Fake.control(PluginsState, NAME, ({ name }, state) =>
      SubscriptionRef.update(state, (now) => ({
        ...now,
        failing: [...now.failing.filter((each) => each !== name), name],
      })),
    ),
    FixStarts: Fake.control(PluginsState, NAME, ({ name }, state) =>
      SubscriptionRef.update(state, (now) => ({
        ...now,
        failing: now.failing.filter((each) => each !== name),
      })),
    ),
  },
  layer: (state) =>
    Layer.succeed(
      Plugins,
      Plugins.of({
        start: (run) =>
          Effect.gen(function* () {
            const hash = run.release.hash.slice(0, 12);
            const now = yield* SubscriptionRef.get(state);
            yield* SubscriptionRef.set(state, {
              ...now,
              starts: now.starts + 1,
            });
            if (now.failing.includes(run.name))
              return yield* new PluginStartFailed({
                message: `${run.name} exited before it was ready`,
                log: [`Error: ${run.name} could not open its database`],
              });
            yield* Effect.acquireRelease(
              SubscriptionRef.update(state, (was) => ({
                ...was,
                running: [...was.running, { name: run.name, hash }],
              })),
              () =>
                SubscriptionRef.update(state, (was) => ({
                  ...was,
                  running: was.running.filter(
                    (each) => !(each.name === run.name && each.hash === hash),
                  ),
                })),
            );
            return {
              exited: SubscriptionRef.changes(state).pipe(
                Stream.filter((was) => !isRunning(was, run.name, hash)),
                Stream.runHead,
                Effect.as({ code: 1, log: [`${run.name} crashed`] }),
              ),
            };
          }),
      }),
    ),
});

export type PluginsState = typeof PluginsState.Type;

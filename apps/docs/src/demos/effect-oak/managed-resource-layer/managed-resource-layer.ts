import { Context, Effect, Schema, Stream } from 'effect';
import { Node } from 'effect-oak';
import { Calculator, Engine } from './calculator/index.js';
import { EngineHost } from './engine-host/index.js';

/*
 * An engine that is built from a Layer when switched on and torn down when
 * switched off: Off → On → Off, or Failed.
 *
 * On's Lifetime boots the engine and holds it for as long as the State lasts,
 * so leaving On is what tears it down. Booting and Ready are one State, On,
 * with the engine's id once it is known: two States would mean two Lifetimes,
 * and the engine would be torn down between them. On Provides Engine to its
 * Calculator Child, which squares numbers on it.
 */

export const EnginePanel = Node.make('EnginePanel', {
  requires: { host: EngineHost },
  state: Schema.TaggedUnion({
    Off: {},
    On: { engineId: Schema.NullOr(Schema.String) },
    Failed: { reason: Schema.String },
  }),
  message: Schema.TaggedUnion({
    ClickedStartEngine: {},
    ClickedStopEngine: {},
    StartedEngine: { engineId: Schema.String },
    FailedStartEngine: { reason: Schema.String },
  }),
  provides: { On: [Engine] },
  children: { On: { calculator: Calculator } },
}).build({
  init: () => ({ state: { _tag: 'Off' } }),
  lifetime: {
    On: () =>
      Stream.unwrap(
        Effect.gen(function* () {
          return (yield* EngineHost).boot;
        }),
      ).pipe(
        Stream.map((engineId) => ({
          _tag: 'StartedEngine' as const,
          engineId,
        })),
        Stream.catch((reason) =>
          Stream.make({ _tag: 'FailedStartEngine' as const, reason }),
        ),
      ),
  },
  provides: {
    On: ({ services }) =>
      Context.make(Engine, {
        square: (value) =>
          Effect.map(services.host.current, (engine) => engine.square(value)),
      }),
  },
  update: {
    Off: {
      ClickedStartEngine: () => ({ state: { _tag: 'On', engineId: null } }),
    },
    Failed: {
      ClickedStartEngine: () => ({ state: { _tag: 'On', engineId: null } }),
    },
    On: {
      StartedEngine: ({ engineId }) => ({ state: { _tag: 'On', engineId } }),
      FailedStartEngine: ({ reason }) => ({
        state: { _tag: 'Failed', reason },
      }),
      ClickedStopEngine: () => ({ state: { _tag: 'Off' } }),
    },
  },
});

export { EngineHostLive } from './engine-host/index.js';

import { Context, Effect, Layer, Stream } from 'effect';
import { ComputeEngine, engineLayer, type Engine } from './compute-engine.js';

/*
 * Holds the one running Compute Engine, like Foldkit's ManagedResource. It was
 * written when a State could not Provide a Capability that an Effect builds;
 * `provides` is now a Layer built on entering the State, but the demo keeps
 * the engine here:
 *
 * - `boot` builds the engine's Layer in the Stream's own scope, keeps the
 *   engine while the Stream runs, and says its id. Run it as a Lifetime:
 *   leaving the State interrupts it, which tears the engine down.
 * - `current` is the running engine, or fails if there is none.
 */

export class EngineHost extends Context.Service<
  EngineHost,
  {
    readonly boot: Stream.Stream<string, string>;
    readonly current: Effect.Effect<Engine, 'NotRunning'>;
  }
>()('docs/managed-resource-layer/EngineHost') {}

/** How long the engine takes to start, so Booting can be seen. */
const BOOT_MS = 600;

export const EngineHostLive = Layer.sync(EngineHost, () => {
  let running: Engine | undefined;
  return {
    boot: Stream.unwrap(
      Effect.gen(function* () {
        yield* Effect.sleep(BOOT_MS);
        const engine = Context.get(
          yield* Layer.build(engineLayer),
          ComputeEngine,
        );
        running = engine;
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            if (running === engine) running = undefined;
          }),
        );
        return Stream.concat(Stream.make(engine.engineId), Stream.never);
      }).pipe(Effect.mapError(String)),
    ),
    current: Effect.suspend(() =>
      running ? Effect.succeed(running) : Effect.fail('NotRunning' as const),
    ),
  };
});

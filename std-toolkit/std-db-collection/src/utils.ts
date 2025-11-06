import { Duration, Effect, Fiber, Ref } from 'effect';

export const periodicSync = (
  effect: Effect.Effect<void>,
  gapBetweenApiCalls: Duration.DurationInput,
  interval: Duration.DurationInput,
) =>
  Effect.gen(function* () {
    // Track if effect is currently executing
    const isExecuting = yield* Ref.make(false);

    // The actual periodic execution loop
    const loop: Effect.Effect<void, never, never> = Effect.gen(function* () {
      while (true) {
        yield* Ref.set(isExecuting, true);
        console.log('Syncing...');
        yield* effect;
        console.log('Sync done');
        yield* Effect.sleep(gapBetweenApiCalls);
        yield* Ref.set(isExecuting, false);
        yield* Effect.sleep(interval);
      }
    });

    // Start the initial loop
    let fiber = yield* Effect.forkDaemon(loop);

    const retrigger = Effect.gen(function* () {
      const executing = yield* Ref.get(isExecuting);

      // If already executing, ignore the retrigger
      if (executing) {
        return;
      }

      // Cancel the current fiber (which is waiting in sleep)
      yield* Fiber.interrupt(fiber);

      // Start a new loop immediately
      fiber = yield* Effect.forkDaemon(loop);
    });

    return {
      retrigger,
    };
  });

import { Duration, Effect, Fiber } from 'effect';

const runTask = (name: string, duration: Duration.Input = 300) =>
  Effect.sleep(duration).pipe(Effect.withSpan(name));

export default Effect.gen(function* () {
  // Effect Description: An effect that runs indefinitely
  const effect = Effect.gen(function* () {
    while (true) {
      yield* runTask('step', 200);
      yield* Effect.sleep('10 millis');
    }
  }).pipe(Effect.withSpan('infinite-effect'));

  // Fiber: Running instance of the effect. Effect.fork runs the effect, and gives back a Fiber.
  const fiber = yield* Effect.forkChild(effect);

  // Wait for 1 second before interrupting the fiber
  yield* Effect.sleep('1 second');
  yield* Fiber.interrupt(fiber);

  yield* runTask('after interrupt');
}).pipe(Effect.withSpan('basic-interrupt-demo'));

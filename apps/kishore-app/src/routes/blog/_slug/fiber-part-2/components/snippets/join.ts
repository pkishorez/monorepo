import { Duration, Effect, Fiber } from 'effect';

const runTask = (name: string, duration: Duration.DurationInput = 300) =>
  Effect.sleep(duration).pipe(Effect.withSpan(name));

export default Effect.gen(function* () {
  const fiber = yield* Effect.fork(runTask(`fork`, 300));

  yield* Fiber.join(fiber);
}).pipe(Effect.withSpan('fork-intro'));

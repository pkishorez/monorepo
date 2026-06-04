import { Duration, Effect, Fiber } from 'effect';

const runTask = (name: string, duration: Duration.Input = 300) =>
  Effect.sleep(duration).pipe(Effect.withSpan(name));

export default Effect.gen(function* () {
  const fiber = yield* Effect.forkChild(
    Effect.sleep('300 millis').pipe(
      Effect.andThen(Effect.fail('Something went wrong!')),
      Effect.withSpan('fork-error'),
    ),
  );

  yield* Fiber.join(fiber);

  yield* runTask('this never runs');
}).pipe(Effect.withSpan('fork-error-example'));

import { Duration, Effect, Fiber } from 'effect';

const runTask = (name: string, duration: Duration.DurationInput = 300) =>
  Effect.sleep(duration).pipe(Effect.withSpan(name));

const allTasks = Array.from({ length: 10 }, (_, i) =>
  runTask(`task - ${i + 1}`),
);
const sequence = Effect.gen(function* () {
  for (const task of allTasks) {
    yield* task;
  }
}).pipe(Effect.withSpan('Effect Sequence'));

const all = Effect.all(allTasks, {}).pipe(Effect.withSpan('Effect.all'));

export default Effect.gen(function* () {
  // Both examples do the same thing.
  // Effect.all without any options, runs all effects in sequence
  const fiber = yield* Effect.forkAll([all, sequence]);
  yield* Fiber.join(fiber);
});

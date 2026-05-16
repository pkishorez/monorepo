import { Effect, Fiber } from 'effect';

const runTask = (name: string, time = 300) =>
  Effect.sleep(time).pipe(Effect.withSpan(name));

export default Effect.gen(function* () {
  const fiber = yield* Effect.forkDaemon(
    Effect.gen(function* () {
      for (let i = 0; i < 3; i++) {
        yield* runTask(`task-${i}`, 300);
      }
    }).pipe(Effect.withSpan('fork')),
  );

  // Sleep for 2 and half tasks time
  yield* Effect.sleep(300 + 150);

  // And then interrupt the fiber
  yield* Fiber.interrupt(fiber);
}).pipe(Effect.withSpan('program'));

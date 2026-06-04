import { Duration, Effect } from 'effect';

const runTask = (name: string, duration: Duration.Input = 300) =>
  Effect.sleep(duration).pipe(Effect.withSpan(name));

export default Effect.gen(function* () {
  for (let i = 1; i <= 3; i++) {
    yield* Effect.forkChild(runTask(`fork-${i}`, i * 100));
  }

  yield* Effect.sleep('500 millis');
}).pipe(Effect.withSpan('fork-intro'));

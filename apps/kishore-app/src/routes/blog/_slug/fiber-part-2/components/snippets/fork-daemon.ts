import { Duration, Effect } from 'effect';

const runTask = (name: string, duration: Duration.Input = 300) =>
  Effect.sleep(duration).pipe(Effect.withSpan(name));

export default Effect.gen(function* () {
  yield* Effect.forkDetach(runTask('fork-daemon', 600));

  yield* Effect.sleep(300);
}).pipe(Effect.withSpan('fork-daemon'));

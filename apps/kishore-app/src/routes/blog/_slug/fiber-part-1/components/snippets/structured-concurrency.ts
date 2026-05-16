import { Duration, Effect } from 'effect';

const runTask = (name: string, duration: Duration.DurationInput = 300) =>
  Effect.sleep(duration).pipe(Effect.withSpan(name));

export default Effect.gen(function* () {
  yield* Effect.fork(runTask('forked-child:1', '1 second'));
  yield* Effect.fork(runTask('forked-child:2', '2 seconds'));

  yield* Effect.sleep('1.5 seconds');

  yield* Effect.fork(runTask('forked-child:3', '100 seconds'));
}).pipe(Effect.withSpan('structured-concurrency-demo'));

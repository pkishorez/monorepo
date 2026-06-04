import { Effect } from 'effect';

const runTask = (name: string) => Effect.sleep(300).pipe(Effect.withSpan(name));
const onError = () => Effect.sleep(300).pipe(Effect.withSpan('onError'));
const onInterrupt = () =>
  Effect.sleep(300).pipe(Effect.withSpan('onInterrupt'));
const ensuring = Effect.sleep(300).pipe(Effect.withSpan('ensuring'));

export default Effect.gen(function* () {
  yield* Effect.all(
    [
      Effect.sleep(300).pipe(
        Effect.tap(runTask('onTap')),
        Effect.onError(onError),
        Effect.onInterrupt(onInterrupt),
        Effect.ensuring(ensuring),
        Effect.withSpan('ex: succeed'),
      ),
      Effect.sleep(300)
        .pipe(Effect.andThen(() => Effect.fail('error')))
        .pipe(
          Effect.tap(runTask('onTap')),
          Effect.onError(onError),
          Effect.onInterrupt(onInterrupt),
          Effect.ensuring(ensuring),
          Effect.withSpan('ex: error'),
        ),
      Effect.gen(function* () {
        yield* Effect.sleep(300);
        yield* Effect.interrupt;
      }).pipe(
        Effect.tap(runTask('onTap')),
        Effect.onInterrupt(onInterrupt),
        Effect.onError(onError),
        Effect.ensuring(ensuring),
        Effect.withSpan('ex: interrupt'),
      ),
    ],
    { mode: 'result', concurrency: 'unbounded' },
  );
});

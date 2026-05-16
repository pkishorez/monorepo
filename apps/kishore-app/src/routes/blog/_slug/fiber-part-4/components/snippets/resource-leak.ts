import type { ResourceOptions } from '@/components/code-block/resource';
import { Effect } from 'effect';

export default Effect.fn(function* ({ aquireResource }: ResourceOptions) {
  yield* Effect.fork(
    Effect.gen(function* () {
      const { release } = yield* aquireResource(`resource`, 300).pipe(
        Effect.withSpan(`acquire`),
      );
      yield* Effect.sleep(300).pipe(Effect.withSpan(`edge case`));
      yield* Effect.addFinalizer(() =>
        release.pipe(Effect.withSpan(`release`)),
      );
    }).pipe(Effect.withSpan('program'), Effect.scoped),
  );

  yield* Effect.sleep(450);
});

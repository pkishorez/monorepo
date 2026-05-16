import type { ResourceOptions } from '@/components/code-block/resource';
import { Effect } from 'effect';

export default Effect.fn(
  function* ({ aquireResource }: ResourceOptions) {
    for (let i = 0; i < 3; i++) {
      const { release } = yield* aquireResource(`resource-${i}`).pipe(
        Effect.withSpan(`acquire-${i}`),
      );
      yield* Effect.addFinalizer(() =>
        release.pipe(Effect.withSpan(`release-${i}`)),
      );
    }
    yield* Effect.sleep(300).pipe(Effect.withSpan('use-resources'));
  },
  Effect.withSpan('fiber-life-cycle'),
  Effect.scoped,
  Effect.withSpan('scope-lifecycle'),
);

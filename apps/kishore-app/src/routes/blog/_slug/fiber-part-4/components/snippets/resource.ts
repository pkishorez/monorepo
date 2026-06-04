import type { ResourceOptions } from '@/components/code-block/resource';
import { Effect, Exit, Fiber, Scope } from 'effect';

const time = 1000;
export default Effect.fn(function* ({ aquireResource }: ResourceOptions) {
  const scope = yield* Scope.make().pipe(
    Effect.tap(Effect.sleep(time)),
    Effect.withSpan('make-scope'),
  );

  const fiber = yield* Effect.forkChild(
    Effect.gen(function* () {
      for (let i = 0; i < 3; i++) {
        const { release } = yield* aquireResource(`resource-${i}`, time).pipe(
          Effect.withSpan(`acquire-${i}`),
        );
        yield* Scope.addFinalizer(
          scope,
          release.pipe(Effect.withSpan(`release-${i}`)),
        );
      }
      yield* Effect.sleep(time).pipe(Effect.withSpan('use-resources'));
    }).pipe(
      Effect.withSpan('program'),
      Effect.ensuring(
        Scope.close(scope, Exit.void).pipe(Effect.withSpan('close-scope')),
      ),
    ),
  );

  yield* Fiber.join(fiber);
});

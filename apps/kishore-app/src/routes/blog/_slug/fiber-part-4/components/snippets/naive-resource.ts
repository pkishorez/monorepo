import { Resource, ResourceOptions } from '@/components/code-block/resource';
import { Effect, Fiber } from 'effect';

const time = 1000;
export default Effect.fn(function* ({ aquireResource }: ResourceOptions) {
  let resources: Resource[] = [];
  const fiber = yield* Effect.forkChild(
    Effect.gen(function* () {
      for (let i = 0; i < 3; i++) {
        resources.push(
          yield* aquireResource(`resource-${i}`, time).pipe(
            Effect.withSpan(`acquire-${i}`),
          ),
        );
      }
    }).pipe(
      Effect.onExit(() =>
        Effect.all(
          resources.map((resource, i) =>
            resource.release.pipe(Effect.withSpan(`release-${i}`)),
          ),
        ),
      ),
      Effect.withSpan('program'),
    ),
  );

  yield* Fiber.join(fiber);
});

import type { ResourceOptions } from '@/components/code-block/resource';
import { Effect } from 'effect';

export default Effect.fn(function* ({ aquireResource }: ResourceOptions) {
  yield* Effect.forkChild(
    Effect.gen(function* () {
      const { resource } = yield* Effect.acquireRelease(
        aquireResource('resource').pipe(Effect.withSpan('aquire')),
        (resource) => resource.release.pipe(Effect.withSpan('release')),
      );

      // Use the resource any way you like. Its properly cleaned up when scope ends
      yield* Effect.sleep(300).pipe(Effect.withSpan('use-resource'));
      console.log(resource);
    }).pipe(Effect.withSpan('program'), Effect.scoped),
  );

  yield* Effect.sleep(450);
});

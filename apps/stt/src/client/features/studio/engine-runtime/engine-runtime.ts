/**
 * React's door onto the engine: a runtime that lives as long as the page,
 * a hook that loads a model with progress, and a hook that mirrors the
 * session into component state.
 */
import { Effect } from 'effect';
import { useState } from 'react';
import { useComponentLifecycle } from 'use-effect-ts';
import { makeStudioRuntime, type StudioRuntime } from './runtime.ts';

export type { StudioRuntime } from './runtime.ts';

export { useModelLoading } from './model-loading.ts';
export type { ModelLoading } from './model-loading.ts';
export { useStudioSession } from './session-hooks.ts';
export type { StudioSessionView } from './session-hooks.ts';

/**
 * Acquires the runtime for the component's lifetime and disposes it on
 * unmount. Held in the lifecycle, not in state, so a dev-mode remount gets a
 * fresh runtime instead of a disposed one.
 */
export function useStudioRuntime(): StudioRuntime | null {
  const [runtime, setRuntime] = useState<StudioRuntime | null>(null);
  useComponentLifecycle(
    Effect.gen(function* () {
      const runtime = yield* Effect.acquireRelease(
        Effect.sync(makeStudioRuntime),
        (runtime) =>
          Effect.andThen(
            Effect.sync(() => setRuntime(null)),
            runtime.disposeEffect,
          ),
      );
      yield* Effect.sync(() => setRuntime(runtime));
    }),
  );
  return runtime;
}

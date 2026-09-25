import { Cause, Effect, Stream } from 'effect';
import { useState } from 'react';
import { useComponentLifecycle } from 'use-effect-ts';
import type { SpeechModelId } from '../../../../engine/transcript/index.ts';
import type { StudioRuntime } from './runtime.ts';
import { StudioSession } from './studio-session.ts';

export type ModelLoading =
  | {
      readonly status: 'loading';
      readonly loaded: number;
      readonly total: number;
    }
  | { readonly status: 'ready' }
  | { readonly status: 'error'; readonly message: string };

/** Loads the chosen model through the worker and reports byte progress. */
export function useModelLoading(
  runtime: StudioRuntime,
  model: SpeechModelId,
): ModelLoading {
  const [state, setState] = useState<ModelLoading>({
    status: 'loading',
    loaded: 0,
    total: 0,
  });

  useComponentLifecycle(
    Effect.gen(function* () {
      setState({ status: 'loading', loaded: 0, total: 0 });
      const context = yield* runtime.contextEffect;
      yield* Effect.gen(function* () {
        const session = yield* StudioSession;
        yield* Stream.runForEach(session.loadModel(model), (progress) =>
          Effect.sync(() => {
            if (progress.status === 'ready') {
              setState({ status: 'ready' });
              return;
            }
            setState({
              status: 'loading',
              loaded: progress.loaded,
              total: progress.total,
            });
          }),
        );
      }).pipe(Effect.provide(context));
    }).pipe(
      Effect.catchCause((cause) =>
        Cause.hasInterruptsOnly(cause)
          ? Effect.void
          : Effect.sync(() =>
              setState({ status: 'error', message: describeCause(cause) }),
            ),
      ),
    ),
    { deps: [runtime, model] },
  );

  return state;
}

const describeCause = (cause: Cause.Cause<{ readonly message: string }>) => {
  const failure = Cause.findErrorOption(cause);
  return failure._tag === 'Some' ? failure.value.message : Cause.pretty(cause);
};

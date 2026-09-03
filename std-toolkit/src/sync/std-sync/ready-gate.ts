import { Effect } from 'effect';
import type { EffectRunner } from '../platform/effect-runner/index.js';
import type { SyncFlow } from '../flow/sync-flow/index.js';

export type Preloadable = { preload: () => Promise<void> };

// Once every Collection created here is preloaded, replay the queued Offline
// Actions and let the Drainer send. Re-armed by each Collection creation so a
// synchronous boot registers everything first.
export const makeReadyGate = <R>(args: {
  runner: EffectRunner<R>;
  flow: SyncFlow;
  replayActions: Effect.Effect<void, never, R> | null;
}) => {
  const collections = new Set<Preloadable>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let open: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });

  const arm = (): void => {
    if (!args.replayActions) return;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(async () => {
      await Promise.allSettled(
        [...collections].map((collection) => collection.preload()),
      );
      await args.runner.runPromise(
        args.replayActions!.pipe(
          args.flow.outbox.withSpan('Replay Offline Actions', {
            attributes: { collections: collections.size },
          }),
          Effect.andThen(
            args.flow.sync.log('Ready Gate opened', {
              attributes: { collections: collections.size },
            }),
          ),
        ),
      );
      open();
    }, 0);
  };
  arm();

  return {
    opened,
    track: (collection: Preloadable): void => {
      collections.add(collection);
      arm();
    },
    cancel: (): void => {
      if (timer !== null) clearTimeout(timer);
    },
  };
};

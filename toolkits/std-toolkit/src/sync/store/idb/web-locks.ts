import { Effect } from 'effect';
import type { Leadership } from '../contract/index.js';

export type BrowserLockManager = {
  request: (
    name: string,
    options: { readonly mode: 'exclusive'; readonly signal: AbortSignal },
    callback: (lock: unknown) => Promise<void>,
  ) => Promise<unknown>;
};

// Holds the Web Lock named `key` for as long as the effect runs. Interrupting
// the effect while it waits aborts the request; ending it releases the lock.
export const webLockLeadership = (locks: BrowserLockManager): Leadership => ({
  run: (key, effect) =>
    Effect.scoped(
      Effect.acquireRelease(
        Effect.callback<{ readonly release: () => void }>((resume, signal) => {
          let acquired = false;
          let release: () => void = () => {};
          const held = new Promise<void>((resolve) => {
            release = resolve;
          });
          void locks
            .request(
              `std-sync:${key}`,
              { mode: 'exclusive', signal },
              async () => {
                acquired = true;
                resume(Effect.succeed({ release }));
                await held;
              },
            )
            .catch((error: unknown) => {
              if (!acquired && !signal.aborted) resume(Effect.die(error));
            });
          return Effect.sync(() => {
            if (acquired) release();
          });
        }),
        (lock) => Effect.sync(lock.release),
        // Waiting for the lock can take forever, so it must stay interruptible.
        { interruptible: true },
      ).pipe(Effect.andThen(effect)),
    ),
});

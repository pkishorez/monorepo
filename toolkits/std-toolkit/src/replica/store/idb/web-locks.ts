import { Effect } from 'effect';
import type { Leader } from '../contract/index.js';

export type BrowserLockManager = {
  request: (
    name: string,
    options: { readonly mode: 'exclusive'; readonly signal: AbortSignal },
    callback: (lock: unknown) => Promise<void>,
  ) => Promise<unknown>;
};

/**
 * Holds the Web Lock named `name` for as long as the effect runs. Interrupting
 * the effect while it waits aborts the request; ending it releases the lock,
 * and the next tab waiting takes over.
 */
export const webLocksLeader =
  (locks: BrowserLockManager): Leader =>
  (name, effect) =>
    Effect.scoped(
      Effect.acquireRelease(
        Effect.callback<{ readonly release: () => void }>((resume, signal) => {
          let acquired = false;
          let release: () => void = () => {};
          const held = new Promise<void>((resolve) => {
            release = resolve;
          });
          void locks
            .request(name, { mode: 'exclusive', signal }, async () => {
              acquired = true;
              resume(Effect.succeed({ release }));
              await held;
            })
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
    );

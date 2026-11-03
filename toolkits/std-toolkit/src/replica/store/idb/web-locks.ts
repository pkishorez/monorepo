import { Effect } from 'effect';
import type { Claim, Leader, Share } from '../contract/index.js';

export type BrowserLockManager = {
  request: (
    name: string,
    options: {
      readonly mode: 'exclusive' | 'shared';
      readonly signal?: AbortSignal;
      readonly ifAvailable?: boolean;
    },
    callback: (lock: unknown) => Promise<void>,
  ) => Promise<unknown>;
};

/** A lock held: `null` when it was asked for only if free, and was not. */
type Held = { readonly release: () => void } | null;

/**
 * Holds the Web Lock named `name` in `mode` for as long as the effect runs.
 * Interrupting the effect while it waits aborts the request; ending it
 * releases the lock, and the next tab waiting takes over. Asked for only if
 * free, it is answered at once, and a lock not free runs nothing.
 */
const holding = (
  locks: BrowserLockManager,
  name: string,
  mode: 'exclusive' | 'shared',
  ifAvailable: boolean,
) =>
  Effect.acquireRelease(
    Effect.callback<Held>((resume, signal) => {
      let acquired = false;
      let release: () => void = () => {};
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      // A request asked for only if free cannot be aborted: it is answered
      // at once, and a lock it got after an interruption is let go at once.
      const options = ifAvailable ? { mode, ifAvailable } : { mode, signal };
      void locks
        .request(name, options, async (lock) => {
          if (lock === null) {
            resume(Effect.succeed(null));
            return;
          }
          acquired = true;
          resume(Effect.succeed({ release }));
          await held;
        })
        .catch((error: unknown) => {
          if (!acquired && !signal.aborted) resume(Effect.die(error));
        });
      return Effect.sync(() => release());
    }),
    (lock) => Effect.sync(() => lock?.release()),
    // Waiting for the lock can take forever, so it must stay interruptible.
    { interruptible: true },
  );

/** Leads `name` while the effect runs, waiting for it first. */
export const webLocksLeader =
  (locks: BrowserLockManager): Leader =>
  (name, effect) =>
    Effect.scoped(
      holding(locks, name, 'exclusive', false).pipe(Effect.andThen(effect)),
    );

/** Holds `name` beside others while the effect runs, waiting while one holds it alone. */
export const webLocksShare =
  (locks: BrowserLockManager): Share =>
  (name, effect) =>
    Effect.scoped(
      holding(locks, name, 'shared', false).pipe(Effect.andThen(effect)),
    );

/** Holds `name` alone while the effect runs, only if no one holds it now. */
export const webLocksClaim =
  (locks: BrowserLockManager): Claim =>
  (name, effect) =>
    Effect.scoped(
      holding(locks, name, 'exclusive', true).pipe(
        Effect.flatMap((lock) =>
          lock === null ? Effect.succeedNone : Effect.asSome(effect),
        ),
      ),
    );

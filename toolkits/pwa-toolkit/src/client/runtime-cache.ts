import * as Effect from 'effect/Effect';
import { isRuntimeCacheName } from '../domain/build/index.js';

/**
 * Deletes every Runtime Cache straight from CacheStorage, which the tab
 * shares with the worker, so it works with no registration at all.
 */
export const clearRuntimeCaches: Effect.Effect<void> = Effect.suspend(() =>
  typeof caches === 'undefined'
    ? Effect.void
    : Effect.tryPromise(async () => {
        const names = await caches.keys();
        await Promise.all(
          names.filter(isRuntimeCacheName).map((name) => caches.delete(name)),
        );
      }).pipe(
        Effect.catch((error) =>
          Effect.logWarning(
            'pwa-toolkit: clearing Runtime Caches failed',
            error,
          ),
        ),
      ),
);

import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import { isToolkitCacheName } from '../shared/build/index.js';
import type { ClientBuildInfo } from '../shared/config/index.js';
import { isBrowser } from './dom-events.js';

const hasServiceWorkerApi = (): boolean =>
  isBrowser() && 'serviceWorker' in navigator;

/**
 * Registers `swUrl`. `updateViaCache: 'none'` makes every update check hit
 * the network. None when unsupported or refused, and when disabled (Kill
 * Switch, dev without `dev: true`): then any registration of `swUrl` left
 * from an earlier build or dev session is removed, with the toolkit's caches.
 */
export const register = (
  config: ClientBuildInfo,
): Effect.Effect<Option.Option<ServiceWorkerRegistration>> => {
  if (!hasServiceWorkerApi()) return Effect.succeed(Option.none());
  if (!config.enabled) return Effect.as(unregister(config), Option.none());
  return Effect.tryPromise(() =>
    navigator.serviceWorker.register(config.swUrl, {
      scope: config.scope,
      updateViaCache: 'none',
    }),
  ).pipe(
    Effect.map(Option.some),
    Effect.tapError((error) =>
      Effect.logWarning(
        'pwa-toolkit: service worker registration failed',
        error,
      ),
    ),
    Effect.orElseSucceed(Option.none),
  );
};

const scriptPath = (registration: ServiceWorkerRegistration) => {
  const worker =
    registration.active ?? registration.waiting ?? registration.installing;
  return worker === null ? null : new URL(worker.scriptURL).pathname;
};

const unregister = (config: ClientBuildInfo): Effect.Effect<void> =>
  Effect.tryPromise(async () => {
    const stale = (await navigator.serviceWorker.getRegistrations()).filter(
      (registration) => scriptPath(registration) === config.swUrl,
    );
    if (stale.length === 0) return;
    await Promise.all(stale.map((registration) => registration.unregister()));
    if (typeof caches === 'undefined') return;
    const names = await caches.keys();
    await Promise.all(
      names.filter(isToolkitCacheName).map((name) => caches.delete(name)),
    );
  }).pipe(
    Effect.catch((error) =>
      Effect.logWarning(
        'pwa-toolkit: removing the old service worker failed',
        error,
      ),
    ),
  );

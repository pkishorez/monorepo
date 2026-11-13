import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import info from 'virtual:web-platform/pwa/build';
import type { WorkerBuildInfo } from '../contract/config/index.js';
import { matchCommand } from '../contract/commands/index.js';
import { makeFetchRouter } from './requests/index.js';
import {
  GlobalScope,
  KeepAlive,
  type ServiceWorkerGlobal,
} from './global-scope/index.js';
import { onActivate, onInstall, serveCommand } from './lifecycle/index.js';

declare const self: ServiceWorkerGlobalScope;

/**
 * Starts the service worker. Call once, synchronously, at the top of the
 * worker entry: install, activate, fetch and message listeners are added
 * during this call.
 */
export const runServiceWorker = (): void => startServiceWorker(self, info);

/** `runServiceWorker` over an explicit global scope and build; tests use fakes. */
export const startServiceWorker = (
  global: ServiceWorkerGlobal,
  build: WorkerBuildInfo,
): void => {
  const scope = GlobalScope.fromGlobal(global);
  const run = <A>(
    effect: Effect.Effect<A, Error, GlobalScope | KeepAlive>,
    event: ExtendableEvent,
  ): Promise<A> =>
    Effect.runPromise(
      effect.pipe(
        Effect.provideService(GlobalScope, scope),
        Effect.provideService(KeepAlive, KeepAlive.forEvent(event)),
      ),
    );
  const route = makeFetchRouter(build, scope.origin);

  global.addEventListener('install', (event) => {
    event.waitUntil(run(onInstall(build), event));
  });

  global.addEventListener('activate', (event) => {
    event.waitUntil(run(onActivate(build), event));
  });

  global.addEventListener('fetch', (event) => {
    const handler = route(event.request);
    if (Option.isNone(handler)) return;
    event.respondWith(
      run(
        handler.value.pipe(
          Effect.catch(() => Effect.succeed(Response.error())),
        ),
        event,
      ),
    );
  });

  global.addEventListener('message', (event) => {
    const request = matchCommand(event.data);
    if (Option.isSome(request)) {
      event.waitUntil(run(serveCommand(request.value, event), event));
    }
  });
};

import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';
import info from 'virtual:pwa-toolkit/build';
import type { WorkerBuildInfo } from '../shared/config/index.js';
import { isCommandEnvelope, matchCommand } from '../shared/commands/index.js';
import { WorkerHost } from '../shared/worker-host/index.js';
import { serveCommand } from './commands/index.js';
import { makeFetchRouter } from './requests/index.js';
import {
  GlobalScope,
  KeepAlive,
  type ServiceWorkerGlobal,
} from './global-scope/index.js';
import { onActivate, onInstall } from './lifecycle/index.js';
import { makeMessageHub } from './messages/index.js';

export { WorkerHost } from '../shared/worker-host/index.js';

declare const self: ServiceWorkerGlobalScope;

interface RunServiceWorkerOptions<E> {
  readonly layer?: Layer.Layer<never, E, WorkerHost>;
}

/**
 * Starts the service worker. Call once, synchronously, at the top of the
 * worker entry: install, activate, fetch and message listeners are added
 * during this call. `layer` (e.g. a Worker RPC Worker Server) is built after,
 * with `WorkerHost` provided.
 */
export const runServiceWorker = <E = never>(
  options?: RunServiceWorkerOptions<E>,
): void => startServiceWorker(self, info, options);

/** `runServiceWorker` over an explicit global scope and build; tests use fakes. */
export const startServiceWorker = <E>(
  global: ServiceWorkerGlobal,
  build: WorkerBuildInfo,
  options?: RunServiceWorkerOptions<E>,
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
  const hub = makeMessageHub({ buffer: options?.layer !== undefined });

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
    if (!isCommandEnvelope(event.data)) return hub.publish(event);
    const request = matchCommand(event.data);
    if (Option.isSome(request)) {
      event.waitUntil(run(serveCommand(request.value, event), event));
    }
  });

  if (options?.layer !== undefined) {
    const host = Layer.succeed(WorkerHost, {
      buildId: build.buildId,
      messages: hub.messages,
    });
    Effect.runFork(
      Layer.launch(Layer.provide(options.layer, host)).pipe(
        Effect.tapCause((cause) =>
          Effect.logError('pwa-toolkit: worker layer failed', cause),
        ),
        Effect.ensuring(Effect.sync(hub.close)),
      ),
    );
  }
};

import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Fiber from 'effect/Fiber';

/** The parts of `ServiceWorkerGlobalScope` the runtime touches; tests pass a fake. */
export type ServiceWorkerGlobal = Pick<
  ServiceWorkerGlobalScope,
  | 'addEventListener'
  | 'caches'
  | 'clients'
  | 'fetch'
  | 'location'
  | 'registration'
  | 'skipWaiting'
>;

interface GlobalScopeService {
  readonly origin: string;
  readonly caches: CacheStorage;
  readonly fetch: (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => Promise<Response>;
  readonly skipWaiting: () => Promise<void>;
  readonly claimClients: () => Promise<void>;
  /** Whether an older version is active, i.e. this is not the first install. */
  readonly hasActiveWorker: () => boolean;
}

/** The service worker's global scope, as seen by the runtime. */
export class GlobalScope extends Context.Service<
  GlobalScope,
  GlobalScopeService
>()('pwa-toolkit/worker/GlobalScope') {
  static fromGlobal(global: ServiceWorkerGlobal): GlobalScopeService {
    return {
      origin: global.location.origin,
      caches: global.caches,
      fetch: (input, init) => global.fetch(input, init),
      skipWaiting: () => global.skipWaiting(),
      claimClients: () => global.clients.claim(),
      hasActiveWorker: () => global.registration.active !== null,
    };
  }
}

/** Keeps the worker alive until a detached fiber (background cache work) ends. */
export class KeepAlive extends Context.Service<
  KeepAlive,
  (fiber: Fiber.Fiber<unknown, unknown>) => void
>()('pwa-toolkit/worker/KeepAlive') {
  static forEvent(
    event: ExtendableEvent,
  ): (fiber: Fiber.Fiber<unknown, unknown>) => void {
    return (fiber) =>
      event.waitUntil(Effect.runPromise(Fiber.join(fiber).pipe(Effect.ignore)));
  }
}

const toError = (cause: unknown): Error =>
  cause instanceof Error ? cause : new Error(String(cause));

/** A promise-returning platform call as an Effect failing with `Error`. */
export const attempt = <A>(
  evaluate: () => PromiseLike<A>,
): Effect.Effect<A, Error> =>
  Effect.tryPromise({ try: evaluate, catch: toError });

export const openCache = (
  name: string,
): Effect.Effect<Cache, Error, GlobalScope> =>
  Effect.flatMap(GlobalScope, (scope) =>
    attempt(() => scope.caches.open(name)),
  );

export const fetchNetwork = (
  input: Request | string,
  init?: RequestInit,
): Effect.Effect<Response, Error, GlobalScope> =>
  Effect.flatMap(GlobalScope, (scope) =>
    attempt(() => scope.fetch(input, init)),
  );

/** Deletes every cache whose name satisfies `predicate`. */
export const deleteCaches = (
  predicate: (name: string) => boolean,
): Effect.Effect<void, Error, GlobalScope> =>
  Effect.gen(function* () {
    const scope = yield* GlobalScope;
    const names = yield* attempt(() => scope.caches.keys());
    yield* Effect.forEach(
      names.filter(predicate),
      (name) => attempt(() => scope.caches.delete(name)),
      { discard: true, concurrency: 'unbounded' },
    );
  });

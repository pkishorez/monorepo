import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import type { RuntimeCacheStrategy } from '../../domain/runtime-cache/index.js';
import {
  fetchNetwork,
  type GlobalScope,
  KeepAlive,
} from '../global-scope/index.js';
import { networkFirst } from '../network-first/index.js';
import type { CacheStore } from './cache-store.js';

type Strategy = (
  request: Request,
  store: CacheStore,
  networkTimeoutMs: number | undefined,
) => Effect.Effect<Response, Error, GlobalScope | KeepAlive>;

/** Fetches and saves a copy; the caller gets the original. */
const fetchAndSave = (request: Request, store: CacheStore) =>
  Effect.tap(fetchNetwork(request), (response) =>
    store.put(request, response.clone()),
  );

const missing = (request: Request) =>
  new Error(`Not in the Runtime Cache: ${request.url}`);

export const strategies: Record<RuntimeCacheStrategy, Strategy> = {
  'network-first': (request, store, networkTimeoutMs) =>
    networkFirst({
      network: fetchAndSave(request, store),
      fallback: store.match(request),
      timeoutMs: networkTimeoutMs,
    }),

  'cache-first': (request, store) =>
    Effect.flatMap(
      store.match(request),
      Option.match({
        onNone: () => fetchAndSave(request, store),
        onSome: Effect.succeed,
      }),
    ),

  'stale-while-revalidate': (request, store) =>
    Effect.gen(function* () {
      const cached = yield* store.match(request);
      if (Option.isNone(cached)) return yield* fetchAndSave(request, store);
      const revalidate = yield* Effect.forkDetach(fetchAndSave(request, store));
      (yield* KeepAlive)(revalidate);
      return cached.value;
    }),

  'network-only': (request) => fetchNetwork(request),

  'cache-only': (request, store) =>
    Effect.flatMap(
      store.match(request),
      Option.match({
        onNone: () => Effect.fail(missing(request)),
        onSome: Effect.succeed,
      }),
    ),
};

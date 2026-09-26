import * as Clock from 'effect/Clock';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import { attempt, type GlobalScope, openCache } from '../global-scope/index.js';

const CACHED_AT_HEADER = 'x-pwa-toolkit-cached-at';

/** One Runtime Cache with its expiry limits. */
export interface CacheStore {
  /** A fresh saved response; expired ones are deleted and count as a miss. */
  readonly match: (
    request: Request,
  ) => Effect.Effect<Option.Option<Response>, never, GlobalScope>;
  /** Saves a cacheable response, then trims to `maxEntries` (oldest first). */
  readonly put: (
    request: Request,
    response: Response,
  ) => Effect.Effect<void, never, GlobalScope>;
}

export const cacheStore = (options: {
  readonly name: string;
  readonly maxEntries: number | undefined;
  readonly maxAgeSeconds: number | undefined;
}): CacheStore => ({
  match: (request) =>
    Effect.gen(function* () {
      const cache = yield* openCache(options.name);
      const hit = yield* attempt(() => cache.match(request));
      if (hit === undefined) return Option.none();
      if (options.maxAgeSeconds !== undefined) {
        const cachedAt = Number(hit.headers.get(CACHED_AT_HEADER));
        const now = yield* Clock.currentTimeMillis;
        if (cachedAt > 0 && now - cachedAt > options.maxAgeSeconds * 1000) {
          yield* attempt(() => cache.delete(request));
          return Option.none();
        }
      }
      return Option.some(hit);
    }).pipe(Effect.orElseSucceed(() => Option.none<Response>())),
  put: (request, response) =>
    Effect.gen(function* () {
      if (!isCacheable(response)) return;
      const cache = yield* openCache(options.name);
      const now = yield* Clock.currentTimeMillis;
      yield* attempt(() => cache.put(request, stamped(response, now)));
      if (options.maxEntries !== undefined) {
        const keys = yield* attempt(() => cache.keys());
        const excess = keys.slice(
          0,
          Math.max(0, keys.length - options.maxEntries),
        );
        yield* Effect.forEach(
          excess,
          (key) => attempt(() => cache.delete(key)),
          {
            discard: true,
          },
        );
      }
    }).pipe(Effect.ignore),
});

/** Successful responses, and opaque cross-origin ones (their status is hidden). */
const isCacheable = (response: Response): boolean =>
  response.status === 200 || response.type === 'opaque';

/** Opaque responses cannot be rebuilt, so they are stored unstamped and never age out. */
const stamped = (response: Response, now: number): Response => {
  if (response.type === 'opaque') return response;
  const headers = new Headers(response.headers);
  headers.set(CACHED_AT_HEADER, String(now));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

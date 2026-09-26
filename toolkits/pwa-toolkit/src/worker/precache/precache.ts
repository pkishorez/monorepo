import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import {
  type BuildId,
  isPrecacheCacheName,
  precacheCacheName,
} from '../../domain/build/index.js';
import type { WorkerBuildInfo } from '../../domain/config/index.js';
import {
  attempt,
  deleteCaches,
  fetchNetwork,
  GlobalScope,
  openCache,
} from '../global-scope/index.js';
import { downloadEntry } from './download.js';

/** Downloads every Precache entry into this build's cache; any failure fails install. */
export const installPrecache = (
  info: WorkerBuildInfo,
): Effect.Effect<void, Error, GlobalScope> =>
  Effect.gen(function* () {
    const scope = yield* GlobalScope;
    const cache = yield* openCache(precacheCacheName(info.buildId));
    yield* Effect.forEach(
      info.precache,
      (entry) => downloadEntry(cache, new URL(entry.url, scope.origin).href),
      { discard: true, concurrency: 8 },
    );
  });

/** Absolute URLs of every Precache entry, for synchronous routing. */
export const precachedUrls = (
  info: WorkerBuildInfo,
  origin: string,
): ReadonlySet<string> =>
  new Set(info.precache.map((entry) => new URL(entry.url, origin).href));

/** The precached response for an origin-relative or absolute URL. */
export const matchPrecache = (
  buildId: BuildId,
  url: string,
): Effect.Effect<Option.Option<Response>, never, GlobalScope> =>
  Effect.gen(function* () {
    const scope = yield* GlobalScope;
    const cache = yield* openCache(precacheCacheName(buildId));
    const hit = yield* attempt(() =>
      cache.match(new URL(url, scope.origin).href),
    );
    return Option.fromNullishOr(hit);
  }).pipe(Effect.orElseSucceed(() => Option.none<Response>()));

/** Cache-first from the Precache; the network only if the entry is missing. */
export const servePrecached = (
  buildId: BuildId,
  request: Request,
): Effect.Effect<Response, Error, GlobalScope> =>
  Effect.flatMap(
    matchPrecache(buildId, request.url),
    Option.match({
      onNone: () => fetchNetwork(request),
      onSome: Effect.succeed,
    }),
  );

/** Deletes every other build's Precache. */
export const deleteOtherPrecaches = (
  buildId: BuildId,
): Effect.Effect<void, Error, GlobalScope> =>
  deleteCaches(
    (name) => isPrecacheCacheName(name) && name !== precacheCacheName(buildId),
  );

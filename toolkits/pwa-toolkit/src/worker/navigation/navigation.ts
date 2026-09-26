import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import { PAGES_CACHE_NAME } from '../../domain/build/index.js';
import type { WorkerBuildInfo } from '../../domain/config/index.js';
import {
  attempt,
  fetchNetwork,
  type GlobalScope,
  type KeepAlive,
  openCache,
} from '../global-scope/index.js';
import { networkFirst } from '../network-first/index.js';
import { matchPrecache } from '../precache/index.js';

/** Whether the worker answers this navigation; denylisted paths go straight to the network. */
export const isHandledNavigation = (
  info: WorkerBuildInfo,
  request: Request,
  origin: string,
): boolean => {
  const url = new URL(request.url);
  return (
    request.mode === 'navigate' &&
    url.origin === origin &&
    !info.config.navigation.denylist.some((prefix) =>
      url.pathname.startsWith(prefix),
    )
  );
};

/**
 * Network within `networkTimeoutMs`; then the saved page (only with
 * `cachePages`), the App Shell (with `shell`), and the Offline Fallback.
 * The Offline Fallback is reached through a redirect to
 * `${offlineFallback}?from=<path+search>`, so a client router renders the
 * fallback route instead of the requested one; a request already for the
 * fallback path gets its body directly.
 */
export const handleNavigation = (
  info: WorkerBuildInfo,
  request: Request,
): Effect.Effect<Response, Error, GlobalScope | KeepAlive> => {
  const { navigation } = info.config;
  const network = navigation.cachePages
    ? Effect.tap(fetchNetwork(request), (response) =>
        response.ok ? savePage(request, response.clone()) : Effect.void,
      )
    : fetchNetwork(request);
  return networkFirst({
    network,
    fallback: firstSome([
      ...(navigation.cachePages ? [matchPage(request)] : []),
      ...(navigation.shell
        ? [matchPrecache(info.buildId, navigation.shellPath)]
        : []),
      offlineFallback(info, request),
    ]),
    timeoutMs: navigation.networkTimeoutMs,
  });
};

const offlineFallback = (info: WorkerBuildInfo, request: Request) => {
  const path = info.config.navigation.offlineFallback;
  const url = new URL(request.url);
  const fallback = matchPrecache(info.buildId, path);
  if (url.pathname === path) return fallback;
  const target = new URL(path, url.origin);
  target.searchParams.set('from', url.pathname + url.search);
  return Effect.map(
    fallback,
    Option.map(() => Response.redirect(target.href, 302)),
  );
};

const savePage = (request: Request, response: Response) =>
  Effect.flatMap(openCache(PAGES_CACHE_NAME), (cache) =>
    attempt(() => cache.put(request, response)),
  ).pipe(Effect.ignore);

const matchPage = (request: Request) =>
  Effect.flatMap(openCache(PAGES_CACHE_NAME), (cache) =>
    attempt(() => cache.match(request)),
  ).pipe(
    Effect.map(Option.fromNullishOr),
    Effect.orElseSucceed(() => Option.none<Response>()),
  );

const firstSome = <R>(
  candidates: ReadonlyArray<Effect.Effect<Option.Option<Response>, never, R>>,
): Effect.Effect<Option.Option<Response>, never, R> =>
  Effect.gen(function* () {
    for (const candidate of candidates) {
      const hit = yield* candidate;
      if (Option.isSome(hit)) return hit;
    }
    return Option.none();
  });

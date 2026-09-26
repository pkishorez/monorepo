import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import { type BuildId, pagesCacheName } from '../../domain/build/index.js';
import type { WorkerBuildInfo } from '../../domain/config/index.js';
import {
  attempt,
  fetchNetwork,
  GlobalScope,
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
 *
 * While a newer version waits to be accepted, the network holds that newer
 * build's HTML, so with `shell` the App Shell of this build answers first:
 * every tab stays on the active Build ID until the update is accepted.
 * For the same reason, pages are not saved while a newer version waits:
 * they belong to that build, not to this Build ID's pages cache.
 */
export const handleNavigation = (
  info: WorkerBuildInfo,
  request: Request,
): Effect.Effect<Response, Error, GlobalScope | KeepAlive> => {
  const { navigation } = info.config;
  const shell = matchPrecache(info.buildId, navigation.shellPath);
  const network = navigation.cachePages
    ? Effect.tap(fetchNetwork(request), (response) =>
        response.ok
          ? savePage(info.buildId, request, response.clone())
          : Effect.void,
      )
    : fetchNetwork(request);
  const networkFirstNavigation = networkFirst({
    network,
    fallback: firstSome([
      ...(navigation.cachePages ? [matchPage(info.buildId, request)] : []),
      ...(navigation.shell ? [shell] : []),
      offlineFallback(info, request),
    ]),
    timeoutMs: navigation.networkTimeoutMs,
  });
  if (!navigation.shell) return networkFirstNavigation;
  return Effect.gen(function* () {
    const scope = yield* GlobalScope;
    if (scope.hasWaitingWorker()) {
      const pinned = yield* shell;
      if (Option.isSome(pinned)) return pinned.value;
    }
    return yield* networkFirstNavigation;
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

const savePage = (buildId: BuildId, request: Request, response: Response) =>
  Effect.gen(function* () {
    const scope = yield* GlobalScope;
    if (scope.hasWaitingWorker()) return;
    const cache = yield* openCache(pagesCacheName(buildId));
    yield* attempt(() => cache.put(request, response));
  }).pipe(Effect.ignore);

const matchPage = (buildId: BuildId, request: Request) =>
  Effect.flatMap(openCache(pagesCacheName(buildId)), (cache) =>
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

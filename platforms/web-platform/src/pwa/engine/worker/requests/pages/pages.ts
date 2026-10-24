import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import { type BuildId, pagesCacheName } from '../../../shared/build/index.js';
import type { WorkerBuildInfo } from '../../../shared/config/index.js';
import {
  attempt,
  fetchNetwork,
  GlobalScope,
  type KeepAlive,
  openCache,
} from '../../global-scope/index.js';
import { networkFirst } from '../strategies/index.js';
import { matchPrecache, pageAt, readPages } from '../../precache/index.js';

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
 * How a page is answered follows from its Render Mode, as this build's
 * Pages say (a page they do not name, or no Pages at all, is dynamic):
 *
 *   client   the App Shell, which is what the server would send; the
 *            network only if it is missing.
 *   static   this build's copy, precached or saved when first visited;
 *            else as dynamic.
 *   dynamic  the network within `networkTimeoutMs`, kept; then the copy
 *            saved last, then the App Shell.
 *
 * While a newer version waits to be accepted, the network holds that newer
 * build's HTML, so this build's copy, or else its App Shell, answers
 * first: every page stays on the active Build ID until the update is
 * accepted. For the same reason, pages are not saved while a newer version
 * waits: they belong to that build, not to this Build ID's pages cache.
 */
export const handleNavigation = (
  info: WorkerBuildInfo,
  request: Request,
): Effect.Effect<Response, Error, GlobalScope | KeepAlive> =>
  Effect.gen(function* () {
    const scope = yield* GlobalScope;
    const pages = yield* readPages(info.buildId);
    const { pathname } = new URL(request.url);
    const render = pages.pipe(
      Option.flatMap((all) => pageAt(all, pathname)),
      Option.match({ onNone: () => 'dynamic', onSome: (page) => page.render }),
    );
    const shell = Option.match(pages, {
      onNone: () => Effect.succeed(Option.none<Response>()),
      onSome: (all) => matchPrecache(info.buildId, all.shell),
    });
    const saved = matchPage(info.buildId, request);
    const network = Effect.tap(fetchNetwork(request), (response) =>
      response.ok
        ? savePage(info.buildId, request, response.clone())
        : Effect.void,
    );
    const ours =
      render === 'client'
        ? [shell]
        : render === 'static'
          ? [matchPrecache(info.buildId, pathname), saved]
          : [];
    const pinned = scope.hasWaitingWorker() ? [saved, shell] : [];
    const first = yield* firstSome([...ours, ...pinned]);
    if (Option.isSome(first)) return first.value;
    return yield* networkFirst({
      network,
      fallback: firstSome([saved, shell]),
      timeoutMs: info.config.navigation.networkTimeoutMs,
    });
  });

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

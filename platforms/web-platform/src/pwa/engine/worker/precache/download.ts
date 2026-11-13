import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import {
  attempt,
  fetchNetwork,
  type GlobalScope,
} from '../global-scope/index.js';

/**
 * Saves one entry unless the cache already holds it (a retried install of
 * the same build). Bypasses the HTTP cache so a stale file is never saved.
 */
export const downloadEntry = (
  cache: Cache,
  url: string,
): Effect.Effect<void, Error, GlobalScope> =>
  Effect.gen(function* () {
    if ((yield* attempt(() => cache.match(url))) !== undefined) return;
    const response = yield* fetchNetwork(url, { cache: 'reload' });
    if (!response.ok) {
      return yield* Effect.fail(
        new Error(`Precache download failed: ${url} (${response.status})`),
      );
    }
    yield* attempt(() => cache.put(url, withoutRedirect(response)));
  });

/**
 * Browsers refuse a redirected response for a navigation, and the App Shell
 * answers navigations, so store a fresh copy.
 */
const withoutRedirect = (response: Response): Response =>
  response.redirected
    ? new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      })
    : response;

/**
 * Saves one page that `build` drew, unless the cache already holds `build`'s
 * copy. A browser can answer even a `reload` fetch with a copy an older
 * deploy drew (iOS Safari did), and that copy points at hashed assets the
 * deploys since have deleted: kept, it would load unstyled for the whole
 * life of this build. So such a page is asked for once more, past every
 * cache, and fails if it is still another build's, its old copy deleted so
 * the network answers it. A copy already held is checked too: a deploy that
 * changes no asset keeps the Build ID, and so this cache, from the last
 * install. No `build` (Start in dev) is no check.
 */
export const downloadPage = (
  cache: Cache,
  url: string,
  build: string | undefined,
): Effect.Effect<void, Error, GlobalScope> =>
  Effect.gen(function* () {
    const held = yield* attempt(() => cache.match(url));
    if (held !== undefined && (yield* isDrawnBy(held, build))) return;
    const first = yield* drawnBy(url, { cache: 'reload' }, build);
    const page = Option.isSome(first)
      ? first
      : yield* drawnBy(
          url,
          { cache: 'no-store', headers: { 'cache-control': 'no-cache' } },
          build,
        );
    if (Option.isNone(page)) {
      yield* attempt(() => cache.delete(url));
      return yield* Effect.fail(
        new Error(`Precache download failed: ${url} is another build's page`),
      );
    }
    yield* attempt(() => cache.put(url, page.value));
  });

/** The page at `url` as a fresh Response, if `build` drew it. */
const drawnBy = (
  url: string,
  init: RequestInit,
  build: string | undefined,
): Effect.Effect<Option.Option<Response>, Error, GlobalScope> =>
  Effect.gen(function* () {
    const response = yield* fetchNetwork(url, init);
    if (!response.ok) {
      return yield* Effect.fail(
        new Error(`Precache download failed: ${url} (${response.status})`),
      );
    }
    const body = yield* attempt(() => response.text());
    if (build !== undefined && !body.includes(build)) return Option.none();
    return Option.some(
      new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      }),
    );
  });

/** Whether a saved page is `build`'s. */
const isDrawnBy = (
  page: Response,
  build: string | undefined,
): Effect.Effect<boolean, Error> =>
  build === undefined
    ? Effect.succeed(true)
    : Effect.map(
        attempt(() => page.text()),
        (body) => body.includes(build),
      );

import * as Effect from 'effect/Effect';
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
 * and Offline Fallback answer navigations, so store a fresh copy.
 */
const withoutRedirect = (response: Response): Response =>
  response.redirected
    ? new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      })
    : response;

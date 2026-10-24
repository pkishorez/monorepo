import { Effect } from 'effect';
import { HttpEffect, type HttpServerRequest } from 'effect/http';

import type { identify } from './admission.js';
import { appendRefreshedCookies } from './refreshed-cookies.js';

type Verification = ReturnType<typeof identify>;

// What one HTTP request's calls share: one verification per credential,
// and the Sign-in cookies refreshed while verifying.
interface RequestState {
  readonly verifications: Map<string, Verification>;
  refreshedCookies: ReadonlyArray<string>;
}

/** The key a call's verification is shared under: its credential. */
export const credentialOf = (request: Request) =>
  `${request.headers.get('authorization') ?? ''}\n${request.headers.get('cookie') ?? ''}`;

/** What the calls of one Batched RPC Request share, kept per HTTP request
 * a guard layer sees. */
export const batchedRequests = () => {
  // Keyed by the HTTP request a Batched RPC Request arrived in, which every
  // call it carries runs under; nothing outlives the request.
  const states = new WeakMap<
    HttpServerRequest.HttpServerRequest,
    RequestState
  >();

  // The state of the HTTP request running this call, made on its first
  // call, which also puts the refreshed cookies on its response. None for a
  // websocket upgrade, whose request lives as long as the socket.
  return (http: HttpServerRequest.HttpServerRequest) => {
    if (http.method !== 'POST') return undefined;
    let state = states.get(http);
    if (state === undefined) {
      const created: RequestState = {
        verifications: new Map(),
        refreshedCookies: [],
      };
      states.set(http, created);
      HttpEffect.appendPreResponseHandlerUnsafe(http, (_request, response) =>
        Effect.succeed(
          appendRefreshedCookies(response, created.refreshedCookies),
        ),
      );
      state = created;
    }
    return state;
  };
};

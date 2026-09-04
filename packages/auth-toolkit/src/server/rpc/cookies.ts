import { Context, Effect, Ref, SynchronizedRef } from 'effect';
import { HttpServerResponse } from 'effect/unstable/http';

import type { Verification } from './middleware.js';

interface RequestAuthStateValue {
  readonly refreshedCookies: Ref.Ref<ReadonlyArray<string>>;
  readonly verify: (verification: Verification) => Verification;
}

const appendSetCookieHeaders = (
  response: HttpServerResponse.HttpServerResponse,
  setCookieHeaders: ReadonlyArray<string>,
): HttpServerResponse.HttpServerResponse => {
  const headers = new Headers(response.headers);
  for (const header of setCookieHeaders) {
    headers.append('set-cookie', header);
  }

  return Object.assign(
    Object.create(Object.getPrototypeOf(response)),
    response,
    {
      headers,
    },
  ) as HttpServerResponse.HttpServerResponse;
};

// Internal: lets authzLayer verify once per HTTP request when present.
export class RequestAuthState extends Context.Service<
  RequestAuthState,
  RequestAuthStateValue
>()('auth-toolkit/server/rpc/RequestAuthState') {}

// Bridges refreshed cookies from forked RPC handler fibers back to a
// completed non-streaming HTTP response. Use with RpcSerialization.layerJson.
export const authzCookies = <
  A extends HttpServerResponse.HttpServerResponse,
  E,
  R,
>(
  app: Effect.Effect<A, E, R>,
): Effect.Effect<HttpServerResponse.HttpServerResponse, E, R> =>
  Effect.gen(function* () {
    const cachedVerification = yield* SynchronizedRef.make<
      Verification | undefined
    >(undefined);
    const refreshedCookies = yield* Ref.make<ReadonlyArray<string>>([]);

    const state: RequestAuthStateValue = {
      refreshedCookies,
      verify: (verification) =>
        Effect.gen(function* () {
          const cached = yield* SynchronizedRef.modifyEffect(
            cachedVerification,
            (current) => {
              if (current !== undefined) {
                return Effect.succeed([current, current] as const);
              }
              return Effect.map(
                Effect.cached(verification),
                (created) => [created, created] as const,
              );
            },
          );
          return yield* cached;
        }),
    };

    const response = yield* Effect.provideService(app, RequestAuthState, state);
    const cookies = yield* Ref.get(refreshedCookies);
    return cookies.length === 0
      ? response
      : appendSetCookieHeaders(response, cookies);
  });

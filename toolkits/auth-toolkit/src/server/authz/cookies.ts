import { Context, Effect, Ref, SynchronizedRef } from 'effect';
import { HttpServerResponse } from 'effect/http';

import { appendRefreshedCookies } from './refreshed-cookies.js';
import type { Verification } from './rpc.js';

interface RequestAuthStateValue {
  readonly refreshedCookies: Ref.Ref<ReadonlyArray<string>>;
  readonly verify: (verification: Verification) => Verification;
}

// Internal: lets the guard verify once per HTTP request when present.
export class RequestAuthState extends Context.Service<
  RequestAuthState,
  RequestAuthStateValue
>()('@kstackz/auth-toolkit/server/RequestAuthState') {}

/** Verifies a request's caller once for all the calls it carries, and puts
 * the sign-in cookies refreshed while doing so on its response. Give it as
 * `Rpc.http.server`'s `wrap`. */
export const cookies = <A extends HttpServerResponse.HttpServerResponse, E, R>(
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
    return appendRefreshedCookies(response, cookies);
  });

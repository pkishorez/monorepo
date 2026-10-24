import { Effect, Option } from 'effect';
import {
  HttpEffect,
  HttpServerRequest,
  type HttpServerResponse,
} from 'effect/http';

import {
  httpMiddleware,
  rpcMiddleware,
  type HttpGuard,
  type RpcGuard,
} from '../guard/index.js';
import {
  admit,
  identify,
  requestOf,
  type Resolution,
  type Resolve,
} from './admission.js';
import { appendRefreshedCookies } from './refreshed-cookies.js';
import { batchedRequests, credentialOf } from './batched-request.js';

export type { Resolution, Resolve };

interface GuardOptions {
  /** Admit Test Users rather than refuse them Forbidden. */
  readonly testUsers: boolean;
}

interface HttpGuardOptions extends GuardOptions {
  /** Rewrites a guarded endpoint's response, given the Scopes its policy
   * asks for: a Resource Server's `WWW-Authenticate` challenge. */
  readonly challenge?:
    | ((
        response: HttpServerResponse.HttpServerResponse,
        scopes: ReadonlyArray<string> | undefined,
      ) => HttpServerResponse.HttpServerResponse)
    | undefined;
}

/**
 * The Guard's server half for Effect RPC over `resolve`. A Batched RPC
 * Request is verified once per credential, and the Sign-in cookies
 * refreshed while verifying go on its response. A call that arrived
 * otherwise (a socket message, in-process) is verified on its own.
 */
export const rpcGuardLayer = (
  resolve: Resolve,
  { testUsers }: GuardOptions,
): RpcGuard => {
  const stateOf = batchedRequests();

  return rpcMiddleware.layer<never, never>(({ headers, rpc, value: policy }) =>
    Effect.gen(function* () {
      const request = requestOf(headers);
      const attributes = {
        'rpc.method': rpc._tag,
        'auth.policy.present': Option.isSome(policy),
      };
      const verification = identify(resolve, request, attributes);
      const http = yield* Effect.serviceOption(
        HttpServerRequest.HttpServerRequest,
      );
      const state = Option.isSome(http)
        ? yield* stateOf(http.value)
        : undefined;

      let resolved: Resolution | null;
      if (state === undefined) {
        resolved = yield* verification;
      } else {
        const credential = credentialOf(request);
        let shared = state.verifications.get(credential);
        if (shared === undefined) {
          shared = Effect.runSync(Effect.cached(verification));
          state.verifications.set(credential, shared);
        }
        resolved = yield* shared;
        if (resolved !== null && resolved.refreshedCookies.length > 0) {
          state.refreshedCookies = resolved.refreshedCookies;
        }
      }

      return yield* admit(
        resolved,
        request,
        policy,
        { 'rpc.method': rpc._tag },
        testUsers,
      );
    }),
  );
};

/**
 * The Guard's server half for Effect HttpApi over `resolve`. The Sign-in
 * cookies refreshed while verifying go on the response, and `challenge`,
 * when given, rewrites it.
 */
export const httpGuardLayer = (
  resolve: Resolve,
  { testUsers, challenge }: HttpGuardOptions,
): HttpGuard =>
  httpMiddleware.layer<never, never>(
    ({ endpoint, request: http, value: policy }) =>
      Effect.gen(function* () {
        if (challenge !== undefined) {
          const scopes = Option.getOrUndefined(policy)?.scopes;
          yield* HttpEffect.appendPreResponseHandler((_request, response) =>
            Effect.succeed(challenge(response, scopes)),
          );
        }

        const request = requestOf(http.headers);
        const resolved = yield* identify(resolve, request, {
          'http.endpoint': endpoint.identifier,
          'auth.policy.present': Option.isSome(policy),
        });

        if (resolved !== null && resolved.refreshedCookies.length > 0) {
          yield* HttpEffect.appendPreResponseHandler((_request, response) =>
            Effect.succeed(
              appendRefreshedCookies(response, resolved.refreshedCookies),
            ),
          );
        }

        return yield* admit(
          resolved,
          request,
          policy,
          { 'http.endpoint': endpoint.identifier },
          testUsers,
        );
      }),
  );

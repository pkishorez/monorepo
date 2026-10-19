import { Effect, Option } from 'effect';
import { HttpEffect, HttpServerRequest } from 'effect/http';

import { rpcMiddleware, type Principal } from '../../guard/index.js';
import {
  admit,
  appendRefreshedCookies,
  fixedResolver,
  identify,
  requestOf,
  resolver,
  type AuthOptions,
  type Resolution,
  type Resolve,
} from '../verification/index.js';

type Verification = ReturnType<typeof identify>;

// What one HTTP request's calls share: one verification per credential,
// and the Sign-in cookies refreshed while verifying.
interface RequestState {
  readonly verifications: Map<string, Verification>;
  refreshedCookies: ReadonlyArray<string>;
}

const credentialOf = (request: Request) =>
  `${request.headers.get('authorization') ?? ''}\n${request.headers.get('cookie') ?? ''}`;

const layerWith = (resolve: Resolve) => {
  // Keyed by the HTTP request a Batched RPC Request arrived in, which every
  // call it carries runs under; nothing outlives the request.
  const states = new WeakMap<
    HttpServerRequest.HttpServerRequest,
    RequestState
  >();

  // The state of the HTTP request running this call, made on its first
  // call, which also puts the refreshed cookies on its response. None for a
  // call that arrived otherwise (a socket message, in-process), or over a
  // websocket upgrade, whose request lives as long as the socket.
  const stateOf = (http: HttpServerRequest.HttpServerRequest) => {
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
      const state = Option.isSome(http) ? stateOf(http.value) : undefined;

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

      return yield* admit(resolved, request, policy, {
        'rpc.method': rpc._tag,
      });
    }),
  );
};

/**
 * The Guard's server half for Effect RPC: give it with the group's handlers
 * and every guarded call is checked.
 *
 * - `auth({ url })`: asks the Auth Worker at `url` about the call's cookie
 *   or Device token (Server-Side Verification).
 * - `auth({ url, oauth: { resource } })`: also accepts Access Tokens for
 *   `resource`, checked against the Auth Worker's keys.
 * - `auth({ local: true })`: Local mode; reads Local Tokens, asks no one.
 *
 * A Batched RPC Request is verified once, and the Sign-in cookies refreshed
 * while verifying go on its response. A cookie call whose Active Account is
 * not its `expect-user` fails AccountChanged before the handler runs.
 */
export const auth = (options: AuthOptions) => layerWith(resolver(options));

/** The Guard's server half for calls whose caller was found out before
 * they arrived, such as over a socket verified at its upgrade: `caller`
 * says who, at each call (null for nobody); its failure fails the call
 * Unavailable. Asks no one; `expect-user` and the policies still apply. */
export const authAs = (caller: Effect.Effect<Principal | null, unknown>) =>
  layerWith(() =>
    Effect.map(caller, (principal) =>
      principal === null ? null : { principal, refreshedCookies: [] },
    ),
  );

/** The Guard's server half with `principal` behind every call (null for
 * nobody), for handlers' tests. */
export const testAuth = (principal: Principal | null) =>
  layerWith(fixedResolver(principal));

export type { AuthOptions, OAuthOptions } from '../verification/index.js';

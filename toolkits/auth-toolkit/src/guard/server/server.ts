import { Effect, Layer } from 'effect';
import type { HttpRouter } from 'effect/http';

import { authWorkerIssuer } from '../../contract/index.js';
import type {
  HttpGuard,
  Principal,
  RpcGuard,
} from '../authz/middleware/index.js';
import { httpGuardLayer, rpcGuardLayer } from './guard-layer/index.js';
import {
  checkOptions,
  type AuthOptions,
  type HttpOAuthOptions,
} from './options.js';
import {
  protectedResourceMetadata,
  withChallenge,
} from './protected-resource.js';
import { resolve, resolver } from './verification/index.js';

export type { AuthOptions, HttpGuard, RpcGuard };

const targetOf = (options: AuthOptions) => {
  checkOptions(options);
  return { url: options.url, resource: options.oauth?.resource };
};

const testUsersOf = (options: { readonly testUsers?: boolean | undefined }) =>
  options.testUsers === true;

/**
 * The Guard's server half for Effect RPC: give it with the group's handlers
 * and every guarded call is checked.
 *
 * - `auth.rpc({ url })`: asks the Auth Worker at `url` about the call's
 *   cookie or Device token (Server-Side Verification).
 * - `auth.rpc({ url, oauth: { resource } })`: also accepts Access Tokens
 *   for `resource`, checked against the Auth Worker's keys.
 * - `auth.rpc({ url, testUsers: true })`: also admits Test Users, whose
 *   email ends in `.test`; without it they fail Forbidden, whatever their
 *   credential.
 *
 * A Batched RPC Request is verified once, and the Sign-in cookies refreshed
 * while verifying go on its response. A cookie call whose Active Account is
 * not its `expect-user` fails AccountChanged before the handler runs.
 */
const rpc = (options: AuthOptions): RpcGuard =>
  rpcGuardLayer(resolver(targetOf(options)), {
    testUsers: testUsersOf(options),
  });

/**
 * The Guard's server half for Effect HttpApi: give it with the API's
 * handlers and every guarded endpoint is checked.
 *
 * - `auth.http({ url })`: asks the Auth Worker at `url` about the call's
 *   cookie or Device token (Server-Side Verification).
 * - `auth.http({ url, oauth: { resource, scopes? } })`: a Resource Server.
 *   Also accepts Access Tokens for `resource`, checked against the Auth
 *   Worker's keys; serves the Protected Resource Metadata; and answers a
 *   401 or 403 with the `WWW-Authenticate` challenge an MCP client follows.
 *   An MCP server is this, with `Authz.scope` inside its tools.
 * - `auth.http({ url, testUsers: true })`: also admits Test Users.
 *
 * The Sign-in cookies refreshed while verifying go on the response. A
 * cookie call whose Active Account is not its `expect-user` fails
 * AccountChanged before the handler runs.
 */
function http(options: {
  readonly url: string;
  readonly oauth: HttpOAuthOptions;
  readonly testUsers?: boolean | undefined;
}): HttpGuard<HttpRouter.HttpRouter>;
function http(options: {
  readonly url: string;
  readonly oauth?: undefined;
  readonly testUsers?: boolean | undefined;
}): HttpGuard;
function http(
  options: AuthOptions<HttpOAuthOptions>,
): HttpGuard<HttpRouter.HttpRouter> {
  const { oauth } = options;
  const guard = httpGuardLayer(resolver(targetOf(options)), {
    testUsers: testUsersOf(options),
    challenge:
      oauth === undefined
        ? undefined
        : (response, scopes) => withChallenge(response, oauth.resource, scopes),
  });
  return oauth === undefined
    ? guard
    : Layer.merge(
        guard,
        protectedResourceMetadata({
          resource: oauth.resource,
          issuer: authWorkerIssuer(options.url),
          scopes: oauth.scopes ?? [],
        }),
      );
}

/** The Guard's server half, one per protocol: `auth.rpc` for Effect RPC,
 * `auth.http` for Effect HttpApi. The browser environment's is `fakeGuard`
 * from `fake`. */
export const auth = { rpc, http };

/** The Guard's server half for Effect RPC calls whose caller was found out
 * before they arrived, such as over a socket verified at its upgrade:
 * `caller` says who, at each call (null for nobody); its failure fails the
 * call Unavailable. Asks no one; `expect-user`, the Test User refusal
 * (unless `testUsers: true`) and the policies still apply. */
export const authAs = (
  caller: Effect.Effect<Principal | null, unknown>,
  options: { readonly testUsers?: boolean | undefined } = {},
): RpcGuard =>
  rpcGuardLayer(
    () =>
      Effect.map(caller, (principal) =>
        principal === null ? null : { principal, refreshedCookies: [] },
      ),
    { testUsers: testUsersOf(options) },
  );

/**
 * Who `request` is from, for code outside Effect's servers: a raw WebSocket
 * upgrade, a plain fetch handler. Resolves null for nobody, and for a Test
 * User unless `testUsers` admits them; rejects when the Auth Worker could
 * not be asked.
 */
export const verify = async (
  request: Request,
  options: AuthOptions,
): Promise<Principal | null> => {
  const principal =
    (await resolve(targetOf(options), request))?.principal ?? null;
  return principal?.test && !testUsersOf(options) ? null : principal;
};

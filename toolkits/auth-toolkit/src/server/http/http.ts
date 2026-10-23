import { Effect, Layer, Option } from 'effect';
import { HttpEffect, type HttpRouter } from 'effect/http';

import { authWorkerIssuer } from '../../contract/index.js';
import { httpMiddleware, type Principal } from '../../guard/index.js';
import {
  admit,
  appendRefreshedCookies,
  fixedResolver,
  identify,
  isLocal,
  requestOf,
  resolver,
  type AuthOptions,
  type OAuthOptions,
  type Resolve,
} from '../verification/index.js';
import {
  protectedResourceMetadata,
  withChallenge,
} from './protected-resource.js';

/** `oauth` for an HttpApi server, which also publishes its Protected
 * Resource Metadata. */
export interface HttpOAuthOptions extends OAuthOptions {
  /** The Scopes this Resource Server understands, published as
   * `scopes_supported` so an OAuth Client knows what to ask for. */
  readonly scopes?: ReadonlyArray<string> | undefined;
}

export type HttpAuthOptions = AuthOptions<HttpOAuthOptions>;

const layerWith = (resolve: Resolve, oauth: HttpOAuthOptions | undefined) =>
  httpMiddleware.layer<never, never>(
    ({ endpoint, request: http, value: policy }) =>
      Effect.gen(function* () {
        if (oauth !== undefined) {
          const scopes = Option.getOrUndefined(policy)?.scopes;
          yield* HttpEffect.appendPreResponseHandler((_request, response) =>
            Effect.succeed(withChallenge(response, oauth.resource, scopes)),
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

        return yield* admit(resolved, request, policy, {
          'http.endpoint': endpoint.identifier,
        });
      }),
  );

type AuthLayer = ReturnType<typeof layerWith>;

/**
 * The Guard's server half for Effect HttpApi: give it with the API's
 * handlers and every guarded endpoint is checked.
 *
 * - `auth({ url })`: asks the Auth Worker at `url` about the call's cookie
 *   or Device token (Server-Side Verification).
 * - `auth({ url, oauth: { resource, scopes? } })`: a Resource Server. Also
 *   accepts Access Tokens for `resource`, checked against the Auth Worker's
 *   keys; serves the Protected Resource Metadata; and answers a 401 or 403
 *   with the `WWW-Authenticate` challenge an MCP client follows. An MCP
 *   server is this, with `scope` inside its tools.
 * - `auth({ local: true })`: Local mode; reads Local Tokens, asks no one.
 *
 * The Sign-in cookies refreshed while verifying go on the response. A
 * cookie call whose Active Account is not its `expect-user` fails
 * AccountChanged before the handler runs.
 */
export function auth(options: {
  readonly url: string;
  readonly oauth: HttpOAuthOptions;
}): Layer.Layer<Layer.Success<AuthLayer>, never, HttpRouter.HttpRouter>;
export function auth(
  options:
    | { readonly url: string; readonly oauth?: undefined }
    | { readonly local: true },
): AuthLayer;
export function auth(
  options: HttpAuthOptions,
): Layer.Layer<Layer.Success<AuthLayer>, never, HttpRouter.HttpRouter> {
  if (isLocal(options)) return layerWith(resolver(options), undefined);
  const { oauth } = options;
  const guard = layerWith(resolver(options), oauth);
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

/** The Guard's server half with `principal` behind every call (null for
 * nobody), for handlers' tests. */
export const testAuth = (principal: Principal | null) =>
  layerWith(fixedResolver(principal), undefined);

export { verify } from '../verification/index.js';
export type { OAuthOptions } from '../verification/index.js';

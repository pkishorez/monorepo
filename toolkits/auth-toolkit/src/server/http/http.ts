import { Layer } from 'effect';
import type { HttpRouter } from 'effect/http';

import { authWorkerIssuer } from '../../contract/index.js';
import type { Principal } from '../../guard/index.js';
import { httpGuardLayer } from '../guard-layers/index.js';
import {
  checkOptions,
  fixedResolver,
  resolver,
  type AuthOptions,
  type OAuthOptions,
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

type AuthLayer = ReturnType<typeof httpGuardLayer>;

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
 * - `auth({ url, testUsers: true })`: also admits Test Users, whose email
 *   ends in `.test`; without it they fail Forbidden, whatever their
 *   credential.
 *
 * The Sign-in cookies refreshed while verifying go on the response. A
 * cookie call whose Active Account is not its `expect-user` fails
 * AccountChanged before the handler runs. The browser environment's guard
 * is `fakeGuard` from `fake`.
 */
export function auth(options: {
  readonly url: string;
  readonly oauth: HttpOAuthOptions;
  readonly testUsers?: boolean | undefined;
}): Layer.Layer<Layer.Success<AuthLayer>, never, HttpRouter.HttpRouter>;
export function auth(options: {
  readonly url: string;
  readonly oauth?: undefined;
  readonly testUsers?: boolean | undefined;
}): AuthLayer;
export function auth(
  options: HttpAuthOptions,
): Layer.Layer<Layer.Success<AuthLayer>, never, HttpRouter.HttpRouter> {
  checkOptions(options);
  const { oauth } = options;
  const guard = httpGuardLayer(resolver(options), {
    testUsers: options.testUsers === true,
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

/** The Guard's server half with `principal` behind every call (null for
 * nobody), for handlers' tests. A Test User `principal` is admitted. */
export const testAuth = (principal: Principal | null) =>
  httpGuardLayer(fixedResolver(principal), { testUsers: true });

export { verify } from '../verification/index.js';
export type { OAuthOptions } from '../verification/index.js';

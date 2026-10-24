import { Effect } from 'effect';

import { isTestEmail } from '../../contract/index.js';
import { bearerToken } from '../../guard/index.js';
import type { Resolution, Resolve } from '../../guard-layer/index.js';
import { verifyAccessToken } from './access-token.js';
import { verifySignIn } from './session.js';

/** Where to find out who a request is from: the Auth Worker at `url`, and,
 * for a Resource Server, the `resource` its Access Tokens must be for. */
export interface Target {
  readonly url: string;
  readonly resource?: string | undefined;
}

/** Who `request` is from, asking the Auth Worker: an Access Token for
 * `resource` is checked against its keys, anything else is a Sign-in. Null
 * for nobody; rejects when the Auth Worker could not be asked. */
export const resolve = async (
  { url, resource }: Target,
  request: Request,
): Promise<Resolution | null> => {
  const token = bearerToken(request.headers);
  if (token !== null && resource !== undefined) {
    const identity = await verifyAccessToken(url, resource, token);
    if (identity !== null) {
      return {
        principal: {
          kind: 'token',
          ...identity,
          test: isTestEmail(identity.user.email),
        },
        refreshedCookies: [],
      };
    }
  }

  // A bearer that is no Access Token is a Device token; a bearer is never
  // followed by the cookie.
  const verified = await verifySignIn(url, request);
  return verified === null
    ? null
    : {
        principal: {
          kind: 'session',
          session: {
            id: verified.session.id,
            expiresAt: new Date(verified.session.expiresAt),
          },
          user: {
            id: verified.user.id,
            email: verified.user.email,
            name: verified.user.name,
          },
          test: isTestEmail(verified.user.email),
        },
        refreshedCookies: verified.refreshedCookies,
      };
};

/** The Resolver for `target`, for a guard layer. */
export const resolver =
  (target: Target): Resolve =>
  (request) =>
    Effect.tryPromise(() => resolve(target, request));

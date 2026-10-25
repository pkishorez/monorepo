import type { Principal } from '../../authz/middleware/index.js';
import { bearerToken } from '../../authz/middleware/index.js';
import { auth as realAuth, verify as realVerify } from '../../server/index.js';
import { fakeGuard } from '../fake.js';
import { fakePrincipal } from '../principal.js';

export {
  authAs,
  type AuthOptions,
  type HttpGuard,
  type RpcGuard,
} from '../../server/index.js';

/*
 * `server` as the `kestack-fake-auth` condition resolves it, which only a
 * development build sets: the same `auth` and `verify`, reading the fake
 * token instead of asking the Auth Worker. Their `url` is not used.
 */

/** `auth`, faked: `fakeGuard` for each protocol. */
export const auth: typeof realAuth = {
  rpc: () => fakeGuard.rpc(),
  http: () => fakeGuard.http(),
} as typeof realAuth;

/** `verify`, faked: the fake User the request's bearer names, or null. */
export const verify: typeof realVerify = async (
  request,
): Promise<Principal | null> => {
  const token = bearerToken(request.headers);
  return token === null ? null : fakePrincipal(token);
};

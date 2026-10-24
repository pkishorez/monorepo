import { Effect } from 'effect';

import type { Principal } from '../../guard/index.js';
import { rpcGuardLayer } from '../guard-layers/index.js';
import {
  fixedResolver,
  resolver,
  type AuthOptions,
} from '../verification/index.js';

/**
 * The Guard's server half for Effect RPC: give it with the group's handlers
 * and every guarded call is checked.
 *
 * - `auth({ url })`: asks the Auth Worker at `url` about the call's cookie
 *   or Device token (Server-Side Verification).
 * - `auth({ url, oauth: { resource } })`: also accepts Access Tokens for
 *   `resource`, checked against the Auth Worker's keys.
 * - `auth({ url, testUsers: true })`: also admits Test Users, whose email
 *   ends in `.test`; without it they fail Forbidden, whatever their
 *   credential.
 *
 * A Batched RPC Request is verified once, and the Sign-in cookies refreshed
 * while verifying go on its response. A cookie call whose Active Account is
 * not its `expect-user` fails AccountChanged before the handler runs. The
 * browser environment's guard is `fakeGuard` from `fake`.
 */
export const auth = (options: AuthOptions) =>
  rpcGuardLayer(resolver(options), { testUsers: options.testUsers === true });

/** The Guard's server half for calls whose caller was found out before
 * they arrived, such as over a socket verified at its upgrade: `caller`
 * says who, at each call (null for nobody); its failure fails the call
 * Unavailable. Asks no one; `expect-user`, the Test User refusal (unless
 * `testUsers: true`) and the policies still apply. */
export const authAs = (
  caller: Effect.Effect<Principal | null, unknown>,
  options: { readonly testUsers?: boolean | undefined } = {},
) =>
  rpcGuardLayer(
    () =>
      Effect.map(caller, (principal) =>
        principal === null ? null : { principal, refreshedCookies: [] },
      ),
    { testUsers: options.testUsers === true },
  );

/** The Guard's server half with `principal` behind every call (null for
 * nobody), for handlers' tests. A Test User `principal` is admitted. */
export const testAuth = (principal: Principal | null) =>
  rpcGuardLayer(fixedResolver(principal), { testUsers: true });

export type { AuthOptions, OAuthOptions } from '../verification/index.js';

import { Context, Effect } from 'effect';

import { Forbidden } from './errors.js';
import type { Principal } from './principal.js';

/** The verified Principal of one guarded call. Both kinds carry a `user`
 * with `id`, `email` and `name`, so a policy that reads only those works for
 * either. */
export class User
  extends /*#__PURE__*/ Context.Service<User, Principal>()(
    '@kestack/auth-toolkit/User',
  ) {}

/** What the Guard's value is: a rule the caller must pass. A Scope policy
 * also names its Scopes, for the challenge an OAuth Client reads. */
export interface Policy {
  (principal: Principal): Effect.Effect<void, Forbidden>;
  readonly scopes?: ReadonlyArray<string>;
}

export type Invariant = (
  principal: Principal,
) => boolean | Effect.Effect<boolean>;

/** A Policy from an invariant, failing Forbidden with `reason`. */
export const policy =
  (invariant: Invariant, reason: string): Policy =>
  (principal) => {
    const holds = invariant(principal);
    return Effect.flatMap(
      Effect.isEffect(holds) ? holds : Effect.succeed(holds),
      (ok) => (ok ? Effect.void : Effect.fail(new Forbidden({ reason }))),
    );
  };

/** A Policy that holds only for a Token Principal carrying every listed
 * Scope. A Sign-in Principal has no Scopes, so it always fails. */
export const scope = (...required: [string, ...string[]]): Policy =>
  Object.assign(
    policy(
      (principal) =>
        principal.kind === 'token' &&
        required.every((name) => principal.scopes.includes(name)),
      `Scope required: ${required.join(' ')}`,
    ),
    { scopes: required },
  );

import { Context, Effect, Schema } from 'effect';
import type { Principal } from './principal.js';

/** The verified Principal of one request. Both kinds carry a `user` with
 * `id`, `email` and `name`, so a policy that reads only those works for
 * either. */
export class Current extends Context.Service<Current, Principal>()(
  '@kstackz/auth-toolkit/Current',
) {}

export class Unauthenticated extends Schema.Error<Unauthenticated>(
  '@kstackz/auth-toolkit/Unauthenticated',
)(
  { _tag: Schema.tag('Unauthenticated'), reason: Schema.String },
  { httpApiStatus: 401 },
) {}

export class Forbidden extends Schema.Error<Forbidden>(
  '@kstackz/auth-toolkit/Forbidden',
)(
  { _tag: Schema.tag('Forbidden'), reason: Schema.String },
  { httpApiStatus: 403 },
) {}

/** Who is calling could not be found out, because the sign-in service could
 * not be asked. Not the same as a call nobody signed. */
export class Unavailable extends Schema.Error<Unavailable>(
  '@kstackz/auth-toolkit/Unavailable',
)(
  { _tag: Schema.tag('Unavailable'), reason: Schema.String },
  { httpApiStatus: 503 },
) {}

/** Who a request is from, and the sign-in cookies refreshed while finding
 * out. */
export interface Resolution {
  readonly current: Principal;
  readonly refreshedCookies: ReadonlyArray<string>;
}

/** Finds out who a request is from: a Service with a `cloud` and a `device`
 * version (`authz.cloud`, `authz.device`); null for nobody. */
export class Resolver extends Context.Service<
  Resolver,
  {
    readonly resolve: (
      request: Request,
    ) => Effect.Effect<Resolution | null, unknown>;
  }
>()('@kstackz/auth-toolkit/Authz/Resolver') {}

/** What a guard's value is: a rule the caller must pass. */
export type Policy = (current: Principal) => Effect.Effect<void, Forbidden>;

type Invariant = (current: Principal) => boolean | Effect.Effect<boolean>;

/** A Policy from an invariant, failing Forbidden with `reason`. */
export const policy =
  (invariant: Invariant, reason: string): Policy =>
  (current) => {
    const holds = invariant(current);
    return Effect.flatMap(
      Effect.isEffect(holds) ? holds : Effect.succeed(holds),
      (ok) => (ok ? Effect.void : Effect.fail(new Forbidden({ reason }))),
    );
  };

/** A policy that holds only for a Token Principal carrying every listed
 * Scope. A Sign-in Principal has no Scopes, so it always fails: a browser
 * call should not be guarded by a Scope at all. */
export const scope = (...required: [string, ...string[]]): Policy =>
  policy(
    (principal) =>
      principal.kind === 'token' &&
      required.every((name) => principal.scopes.includes(name)),
    `Scope required: ${required.join(' ')}`,
  );

export const Failure = Schema.Union([Unauthenticated, Forbidden, Unavailable]);

export const Failures = [Unauthenticated, Forbidden, Unavailable] as const;

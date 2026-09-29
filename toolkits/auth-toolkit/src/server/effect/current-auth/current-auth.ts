import { Context, Effect, Schema } from 'effect';
import type { Principal } from '../../vanilla/principal/index.js';

/** Current Auth is the verified Principal of one request. Both kinds carry a
 * `user` with `id`, `email`, and `name`, so a policy that reads only those
 * works for either. */
export type CurrentAuthValue = Principal;

export class CurrentAuth extends Context.Service<
  CurrentAuth,
  CurrentAuthValue
>()('@kstackz/auth-toolkit/CurrentAuth') {}

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

export class VerificationUnavailable extends Schema.Error<VerificationUnavailable>(
  '@kstackz/auth-toolkit/VerificationUnavailable',
)(
  { _tag: Schema.tag('VerificationUnavailable'), reason: Schema.String },
  { httpApiStatus: 503 },
) {}

export interface CurrentAuthResolution {
  readonly currentAuth: CurrentAuthValue;
  readonly refreshedCookies: ReadonlyArray<string>;
}

export class Resolver extends Context.Service<
  Resolver,
  {
    readonly resolve: (
      request: Request,
    ) => Effect.Effect<CurrentAuthResolution | null, unknown>;
  }
>()('@kstackz/auth-toolkit/Authz/Resolver') {}

export type AuthPolicy = (
  auth: CurrentAuthValue,
) => Effect.Effect<void, Forbidden>;

type Invariant = (auth: CurrentAuthValue) => boolean | Effect.Effect<boolean>;

const policy =
  (invariant: Invariant, reason: string): AuthPolicy =>
  (auth) => {
    const holds = invariant(auth);
    return Effect.flatMap(
      Effect.isEffect(holds) ? holds : Effect.succeed(holds),
      (ok) => (ok ? Effect.void : Effect.fail(new Forbidden({ reason }))),
    );
  };

/** A policy that holds only for a Token Principal carrying every listed
 * Scope. A Session Principal has no Scopes, so it always fails: a browser
 * endpoint should not be guarded by a Scope at all. */
const scope = (...required: [string, ...string[]]): AuthPolicy =>
  policy(
    (principal) =>
      principal.kind === 'token' &&
      required.every((name) => principal.scopes.includes(name)),
    `Scope required: ${required.join(' ')}`,
  );

export const auth = {
  CurrentAuth,
  Resolver,
  Unauthenticated,
  Forbidden,
  VerificationUnavailable,
  policy,
  scope,
};

export const AuthFailure = Schema.Union([
  Unauthenticated,
  Forbidden,
  VerificationUnavailable,
]);

export const AuthFailures = [
  Unauthenticated,
  Forbidden,
  VerificationUnavailable,
] as const;

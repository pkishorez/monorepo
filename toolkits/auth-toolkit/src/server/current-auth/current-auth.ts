import type { Session, User } from 'better-auth';
import { Context, Effect, Schema } from 'effect';

/** A Principal established by a browser Session. */
export interface SessionPrincipal {
  readonly kind: 'session';
  readonly user: User;
  readonly session: Session;
}

/** What an Access Token says about its User: the claims the Auth Worker adds
 * so a Resource Server needs no callback to know who is acting. */
export interface TokenUser {
  readonly id: string;
  readonly email: string;
  readonly name: string;
}

/** A Principal established by an Access Token: the User, the Client
 * Application acting for them, and the granted Scopes. It has no Session. */
export interface TokenPrincipal {
  readonly kind: 'token';
  readonly user: TokenUser;
  readonly client: { readonly id: string };
  readonly scopes: ReadonlyArray<string>;
}

export type Principal = SessionPrincipal | TokenPrincipal;

/** Current Auth is the verified Principal of one request. Both kinds carry a
 * `user` with `id`, `email`, and `name`, so a policy that reads only those
 * works for either. */
export type CurrentAuthValue = Principal;

export class CurrentAuth extends Context.Service<
  CurrentAuth,
  CurrentAuthValue
>()('auth-toolkit/CurrentAuth') {}

export class Unauthenticated extends Schema.Error<Unauthenticated>(
  'auth-toolkit/Unauthenticated',
)(
  { _tag: Schema.tag('Unauthenticated'), reason: Schema.String },
  { httpApiStatus: 401 },
) {}

export class Forbidden extends Schema.Error<Forbidden>(
  'auth-toolkit/Forbidden',
)(
  { _tag: Schema.tag('Forbidden'), reason: Schema.String },
  { httpApiStatus: 403 },
) {}

export class VerificationUnavailable extends Schema.Error<VerificationUnavailable>(
  'auth-toolkit/VerificationUnavailable',
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
>()('auth-toolkit/Authz/Resolver') {}

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

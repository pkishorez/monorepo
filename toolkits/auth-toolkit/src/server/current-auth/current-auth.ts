import type { Session, User } from 'better-auth';
import { Context, Effect, Schema } from 'effect';

export interface CurrentAuthValue {
  readonly session: Session;
  readonly user: User;
}

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

export const auth = {
  CurrentAuth,
  Resolver,
  Unauthenticated,
  Forbidden,
  VerificationUnavailable,
  policy,
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

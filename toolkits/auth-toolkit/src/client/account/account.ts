import { Context, type Effect, Schema } from 'effect';

/** One person, as a client knows them. */
export interface User {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly image: string | null;
}

/** One user signed in on this device, with their token: send it as
 * `Authorization: Bearer` to act as them whichever Account is active. The
 * token is null while the Account is only remembered, as when it opened
 * before the Backend answered. */
export interface Account {
  readonly user: User;
  readonly token: string | null;
}

/** An Account as the Backend lists it: with its token, and whether it is the
 * active one. */
export type Listed = Account & {
  readonly token: string;
  readonly active: boolean;
};

/** Why a sign-in came back without signing anyone in. */
export interface LoginError {
  readonly code: string;
  readonly description?: string;
}

/** Where a sign-in comes back to, and where it comes back to on failure.
 * Both default to the current page without stale login-error parameters. */
export interface SignInOptions {
  readonly returnTo?: string;
  readonly errorReturnTo?: string;
}

/** The sign-in service could not be reached, or refused the call. */
export class Unreachable extends Schema.Error<Unreachable>(
  '@kstackz/auth-toolkit/Unreachable',
)({ _tag: Schema.tag('Unreachable'), reason: Schema.String }) {}

/** This device's Accounts on one Backend: who is signed in, signing one more
 * in, the Account Switch, and signing out. `cookie`, `oauth`, `deviceCode`
 * and `signIn.named` each make one. */
export class SignIn extends Context.Service<
  SignIn,
  {
    /** Every Account signed in, the active one marked; none when signed
     * out. */
    readonly list: Effect.Effect<ReadonlyArray<Listed>, Unreachable>;
    /** Signs one more Account in and makes it the active one. With a cookie,
     * the page leaves for Google and comes back to `returnTo`, so it never
     * completes; by name, it asks who and completes once they are signed
     * in, or at once if nobody was chosen. */
    readonly signIn: (
      options?: SignInOptions,
    ) => Effect.Effect<void, Unreachable>;
    /** Makes an Account the active one: for the whole browser with a
     * cookie, for this device otherwise. */
    readonly switchTo: (token: string) => Effect.Effect<void, Unreachable>;
    /** Signs out one Account; the others stay. Signing out the active one
     * makes another one active, if any. */
    readonly signOut: (token: string) => Effect.Effect<void, Unreachable>;
    /** Signs every Account out of this device. */
    readonly signOutAll: Effect.Effect<void, Unreachable>;
    /** The error the last sign-in came back with, if any, reported once. */
    readonly takeLoginError: Effect.Effect<LoginError | null>;
  }
>()('@kstackz/auth-toolkit/SignIn') {}

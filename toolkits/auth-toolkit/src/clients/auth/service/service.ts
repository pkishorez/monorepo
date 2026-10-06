import { Context, type Effect, Schema } from 'effect';

/** A User signed in within this browser, as a First-Party app sees them. */
export interface SignedInAccount {
  readonly user: {
    readonly id: string;
    readonly name: string;
    readonly email: string;
    readonly image: string | null;
  };
  /** The account's Session token: send it as `Authorization: Bearer` to act
   * as this account whichever one is active. */
  readonly token: string;
  /** Whether this is the Active Account. */
  readonly active: boolean;
}

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

/** The Auth Worker could not be reached, or refused the call. */
export class Unreachable extends Schema.Error<Unreachable>(
  '@kstackz/auth-toolkit/Unreachable',
)({ _tag: Schema.tag('Unreachable'), reason: Schema.String }) {}

/** This browser's Signed-in Accounts: who is signed in, signing one more in,
 * the Account Switch, and signing out. `authLive` asks the Auth Worker;
 * `authLocal` keeps Local Accounts itself. */
export class Auth extends Context.Service<
  Auth,
  {
    /** Every Signed-in Account, the Active Account marked; none when signed
     * out. */
    readonly list: Effect.Effect<ReadonlyArray<SignedInAccount>, Unreachable>;
    /** Signs one more account in and makes it the Active Account. Live, the
     * page leaves for Google and comes back to `returnTo`, so it never
     * completes; local, it asks who and completes once they are signed in,
     * or at once if nobody was chosen. */
    readonly signIn: (
      options?: SignInOptions,
    ) => Effect.Effect<void, Unreachable>;
    /** Makes a Signed-in Account the Active Account, for the whole browser. */
    readonly switchTo: (token: string) => Effect.Effect<void, Unreachable>;
    /** Signs out one Signed-in Account; the others stay. Signing out the
     * Active Account makes another one active, if any. */
    readonly signOut: (token: string) => Effect.Effect<void, Unreachable>;
    /** Signs every Signed-in Account out of this browser. */
    readonly signOutAll: Effect.Effect<void, Unreachable>;
    /** The error the last sign-in came back with, if any, removed from the
     * page's URL so it is reported once. */
    readonly takeLoginError: Effect.Effect<LoginError | null>;
  }
>()('@kstackz/auth-toolkit/Auth') {}

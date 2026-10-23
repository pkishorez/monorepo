import { Context, Data, type Effect, type Stream } from 'effect';
import type { AccountsError } from './errors.js';

export {
  AccountLimitReached,
  AuthWorkerRejected,
  AuthWorkerUnavailable,
  AuthWorkerUnreachable,
  DeviceLoginFailed,
  InvalidAuthWorkerResponse,
  type AccountsError,
} from './errors.js';

/** A User signed in on this client. Never carries a token. */
export interface Account {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly image: string | null;
}

/** Who is signed in on this client.
 *
 * - `Checking`: not confirmed yet; `last` is the Active Account last seen
 *   here, when the client remembers one.
 * - `SignedIn`: the Active Account and every Account, in sign-in order.
 *   `switchingTo` is the Account an Account Switch under way makes active:
 *   `active` stays the Active Account, and every call acts as it, until the
 *   switch is confirmed.
 * - `SignedOut`: no Account. */
export type AccountsState = Data.TaggedEnum<{
  Checking: { readonly last?: Account };
  SignedIn: {
    readonly active: Account;
    readonly accounts: ReadonlyArray<Account>;
    readonly switchingTo?: Account;
  };
  SignedOut: {};
}>;

export const AccountsState = /*#__PURE__*/ Data.taggedEnum<AccountsState>();

/** How to sign one more Account in. A Browser uses `returnTo`; a Device uses
 * `account` and `open`. Each ignores the others. */
export interface SignInOptions {
  /** Browser: where the Login Screen comes back to; the current page unless
   * given. */
  readonly returnTo?: string;
  /** Device: the email the Device Screen should approve as. */
  readonly account?: string;
  /** Device: `'prompt'` prints the link and code and opens the browser when
   * `o` is pressed; `'auto'` opens it at once. Without a terminal, both only
   * print. */
  readonly open?: 'prompt' | 'auto';
}

/** The Accounts signed in on this client, and signing them in and out. The
 * same for a Browser (`client/browser`) and a Device (`client/device`), so
 * app code is the same for both. */
export class Accounts
  extends /*#__PURE__*/ Context.Service<
    Accounts,
    {
      /** Every state from the current one on. */
      readonly state: Stream.Stream<AccountsState>;
      /** The current state. */
      readonly current: Effect.Effect<AccountsState>;
      /** Asks again who is signed in, and answers the new state. */
      readonly check: Effect.Effect<AccountsState, AccountsError>;
      /** Signs one more Account in and makes it active. A Browser leaves the
       * page for the Login Screen, so it never completes; a Device completes
       * once its Device Login is approved. */
      readonly signIn: (
        options?: SignInOptions,
      ) => Effect.Effect<void, AccountsError>;
      /** Makes another signed-in Account the Active Account. While it is
       * under way the state is `SignedIn` with `switchingTo`; once confirmed,
       * `SignedIn` with the new Active Account. A switch that fails leaves
       * the state as it was, without `switchingTo`, and fails. */
      readonly switchTo: (userId: string) => Effect.Effect<void, AccountsError>;
      /** Signs one Account out, the active one unless given. Signing out the
       * Active Account makes the next one active, if any. */
      readonly signOut: (userId?: string) => Effect.Effect<void, AccountsError>;
      /** Signs every Account out. */
      readonly signOutAll: Effect.Effect<void, AccountsError>;
    }
  >()('@kestack/auth-toolkit/Accounts') {}

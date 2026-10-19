import type { Account } from '@kestack/auth-toolkit/client';

/** What every screen asks the Gate. */
export type GateView<S> =
  | { readonly kind: 'checking' }
  | { readonly kind: 'signedOut'; readonly unreachable: boolean }
  | { readonly kind: 'opening'; readonly account: Account }
  | { readonly kind: 'signingOut' }
  | {
      readonly kind: 'open';
      readonly session: S;
      readonly account: Account;
      readonly accounts: ReadonlyArray<Account>;
    }
  | { readonly kind: 'unopenable'; readonly account: Account }
  /** The account that was open is signed out on another device or app. The
   * User signs in to it again, keeping its Sync, or opens another account,
   * deleting it; `accounts` are those still signed in. */
  | {
      readonly kind: 'accountLost';
      readonly account: Account;
      readonly accounts: ReadonlyArray<Account>;
    };

/** A message the Gate leaves for the app once: a sign-in that ended
 * without signing anyone in, and why. */
export type GateNotice = {
  readonly kind: 'signInFailed';
  readonly message: string;
};

export type { Account };

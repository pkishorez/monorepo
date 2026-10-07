import { type Effect, Schema } from 'effect';
import type { LoginError, SignedInAccount } from '../../auth/index.js';

/** Where an app's Backend runs, and its Users sign in: in the cloud, or on
 * this device, in the app itself. */
export const Backend = Schema.Literals(['cloud', 'device']);
export type Backend = typeof Backend.Type;

// What the Backends were called before.
const FORMER: Readonly<Record<string, Backend>> = {
  remote: 'cloud',
  local: 'device',
};

/** The Backend `name` names, by its name or its former one (`remote`,
 * `local`); null for anything else. */
export const backendNamed = (
  name: string | null | undefined,
): Backend | null =>
  name === 'cloud' || name === 'device'
    ? name
    : name == null
      ? null
      : (FORMER[name] ?? null);

/** One person, as the Gate knows them. */
export type GateUser = SignedInAccount['user'];

/** A Signed-in Account as the Gate holds it: its token is null while it is
 * only remembered, as when it opened before the Backend answered. */
export type Account = {
  readonly user: GateUser;
  readonly token: string | null;
  readonly active: boolean;
};

/** What a Session Lifetime is opened with: whose it is, and the token their
 * calls carry, read at each call because the Gate refreshes it. */
export type OpenAccount = {
  readonly user: GateUser;
  readonly token: () => string | null;
  /** The token, or, while the Gate holds none, as when the account opened
   * before the Backend answered, the first one it is given. Calls signed
   * with it wait for the Backend instead of failing. */
  readonly waitForToken: Effect.Effect<string>;
  /** Settles as `promise` does while this Session Lifetime is open; once it
   * has ended, never settles, so nothing of one account reaches another's
   * screen and nobody reports a call the Gate cut off as an error. */
  readonly whileOpen: <A>(promise: Promise<A>) => Promise<A>;
};

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
   * User signs in to it again, keeping its Copy, or opens another account,
   * deleting it; `accounts` are those still signed in. */
  | {
      readonly kind: 'accountLost';
      readonly account: Account;
      readonly accounts: ReadonlyArray<Account>;
    };

/** A message the Gate leaves for the app once. */
export type GateNotice = {
  readonly kind: 'loginError';
  readonly error: LoginError;
};

import { Effect, Schema, Stream } from 'effect';
import { Accounts, type AccountsState } from '@kestack/auth-toolkit/client';
import type { Start } from './sign-in/index.ts';

/*
 * The root page's Account step: show what this device kept, check behind,
 * and correct the screen if the check disagrees, in one step.
 *
 * 0. Reading   until auth-toolkit says anything, which waits only for what
 *              this device kept: nothing is drawn but the mark, and nothing
 *              says it is checking, since nothing is asked yet.
 * 1. Checking  auth-toolkit's `Checking { last }`: the app is drawn as the
 *              Account last signed in here, if there is one, while the
 *              Auth Worker is asked. A check that fails stays here.
 * 2. Answer    signed in or signed out, as the Auth Worker said.
 * 3. Prune     on the first answer, and on each with fewer Accounts signed
 *              in, every Account not signed in on this device is deleted;
 *              never while still checking.
 * 4. Draw      the Account the app is drawn for: the one wanted at once
 *              when none is drawn, none is wanted, or it is the same;
 *              another stays drawn until the one wanted is ready, its
 *              Machines' kept list read, and then the app is drawn for it,
 *              home, in one step, never from nothing.
 */

/** An Account as the app is drawn for it. */
export const Shown = Schema.Struct({ id: Schema.String, email: Schema.String });
export type Shown = typeof Shown.Type;

/**
 * Who is signed in, as the root keeps it: not yet read from this device;
 * still checked, and drawn as `last` meanwhile, when this device has one;
 * signed out; or signed in.
 */
export const Signed = Schema.TaggedUnion({
  Reading: {},
  Checking: { last: Schema.NullOr(Shown) },
  SignedOut: {},
  SignedIn: {
    id: Schema.String,
    email: Schema.String,
    /** Every Account signed in on this device, by id. */
    accounts: Schema.Array(Schema.String),
  },
});
export type Signed = typeof Signed.Type;

/** auth-toolkit's state, as the root keeps it. */
export const signedFrom = (now: AccountsState): Signed =>
  now._tag === 'SignedIn'
    ? {
        _tag: 'SignedIn',
        id: now.active.id,
        email: now.active.email,
        accounts: now.accounts.map(({ id }) => id),
      }
    : now._tag === 'SignedOut'
      ? { _tag: 'SignedOut' }
      : {
          _tag: 'Checking',
          last:
            now.last === undefined
              ? null
              : { id: now.last.id, email: now.last.email },
        };

/** auth-toolkit's state, now and after each change, as the root keeps it. */
export const signed = Accounts.pipe(
  Effect.map(({ state }) => Stream.map(state, signedFrom)),
  Stream.unwrap,
);

// 1. Checking
/** The Account to draw: the one signed in, or while checked the last; null for none. */
export const shownOf = (account: Signed): Shown | null =>
  account._tag === 'SignedIn'
    ? { id: account.id, email: account.email }
    : account._tag === 'Checking'
      ? account.last
      : null;

/**
 * What is drawn while no Account is: signing in once signed out; checking
 * only once asked with no Account kept here, for this device draws the
 * Account it kept while it is checked; else the mark.
 */
export const startOf = (account: Signed): Start =>
  account._tag === 'SignedOut'
    ? 'signed-out'
    : account._tag === 'Checking' && account.last === null
      ? 'checking'
      : 'reading';

/** The Accounts signed in on this device, as the Auth Worker answered; null while it is checked. */
const signedInOf = (account: Signed): ReadonlyArray<string> | null =>
  account._tag === 'SignedIn'
    ? account.accounts
    : account._tag === 'SignedOut'
      ? []
      : null;

// 3. Prune
/**
 * The Accounts to keep as `after` comes after `before`, every other
 * deleted, or null to delete nothing: on the first answer, or one with
 * fewer signed in.
 */
export const kept = (
  before: Signed,
  after: Signed,
): ReadonlyArray<string> | null => {
  const now = signedInOf(after);
  const then = signedInOf(before);
  const prunes =
    now !== null && (then === null || then.some((id) => !now.includes(id)));
  return prunes ? now : null;
};

// 4. Draw
/** The Account the app is drawn for, and whether drawing it goes home. */
export interface Drawing {
  readonly drawn: Shown | null;
  /** Another Account than the one drawn, or none: home, in place of the page. */
  readonly home: boolean;
}

const drawing = (drawn: Shown | null, next: Shown | null): Drawing => ({
  drawn: next,
  home: drawn !== null && next?.id !== drawn.id,
});

/**
 * What is drawn as `wanted` is the Account to draw: it, at once, when
 * nothing is drawn, nothing is wanted, or it is the Account drawn; else
 * the Account drawn, until the one wanted is `ready`.
 */
export const draw = (drawn: Shown | null, wanted: Shown | null): Drawing =>
  wanted === null || drawn === null || drawn.id === wanted.id
    ? drawing(drawn, wanted)
    : { drawn, home: false };

/** What is drawn as the Machines of `accountId` are ready: it, if it is still the one wanted. */
export const ready = (
  drawn: Shown | null,
  wanted: Shown | null,
  accountId: string,
): Drawing =>
  wanted?.id === accountId ? drawing(drawn, wanted) : { drawn, home: false };

/** The Accounts whose Machines run: the one drawn, and the one wanted, preparing. */
export const running = (
  drawn: Shown | null,
  wanted: Shown | null,
): ReadonlyArray<Shown> =>
  [drawn, wanted].filter(
    (each, at, all): each is Shown =>
      each !== null && all.findIndex((other) => other?.id === each.id) === at,
  );

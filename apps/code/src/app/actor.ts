import { Effect, Schema, ScopedRef, Stream } from 'effect';
import { Accounts, type AccountsState } from '@kestack/auth-toolkit/client';
import { Actor } from '@kestack/kabuki';
import { Navigation, Page, Router } from '@kestack/kabuki/routing';
import {
  AccountSwitcherLive,
  CurrentAccount,
} from '@kestack/web-platform/recipes/account-switcher';
import { Account } from './account/index.ts';
import { accountOf, before, home, type Route } from './app.ts';
import { pruneAccounts, signIn } from './commands.ts';
import { Preferences, Storage } from './storage/index.ts';
import type { Start } from './sign-in/index.ts';

/*
 * The app: the root page, drawn only in the browser, the app on every
 * Connection of the Account signed in at once. It opens first and asks who
 * is signed in, from auth-toolkit's `Accounts`, showing what this device
 * kept and checking behind; everything else is the Account's page
 * (`account/`), `/a/:accountId`, which it holds as its one page. What this
 * device keeps is `storage/`, and what is drawn while no Account is,
 * `sign-in/`.
 *
 * 0. Reading   until auth-toolkit says anything, which waits only for what
 *              this device kept: nothing is drawn but the mark, and nothing
 *              says it is checking, since nothing is asked yet.
 * 1. Checking  auth-toolkit's `Checking { last }`: the Account last active
 *              here is taken as active, if there is one, while the Auth
 *              Worker is asked. A check that fails stays here.
 * 2. Answer    signed in or signed out, as the Auth Worker said; signed
 *              out, only signing in is drawn (`sign-in/`).
 * 3. Prune     on the first answer, and on each with fewer Accounts signed
 *              in, every Account not signed in on this device is deleted,
 *              with all its databases (`Storage`); never while still
 *              checking.
 * 4. Place     `/`, and an address the app had before its pages were an
 *              Account's, is the same page under the Account active, in
 *              place of the address, once one is known. Placed while the
 *              Auth Worker was still asked, under the Account this device
 *              kept, it was the app's guess, not the user's: once the
 *              Auth Worker answers another, the page goes, saying nothing,
 *              to the same page under that one. Any other address is the
 *              user's, and is never moved.
 * 6. Nowhere   an address that names no page, and was never one, says so,
 *              whoever is signed in.
 * 5. Switcher  who is signed in, for the Account's page and its header:
 *              the Account Switcher, always, and `CurrentAccount`.
 * 7. Awake     once Preferences says so, whoever is signed in, the screen is
 *              kept on while the page shows, and let go when it no longer
 *              says so. The browser lets go whenever the page hides, so it
 *              is asked again when the page shows; refused, or let go while
 *              showing, it is asked again at the user's next tap or key, as
 *              asking in a loop would not help. A browser without it, or
 *              that keeps refusing, dims as it always has.
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
const signed = Accounts.pipe(
  Effect.map(({ state }) => Stream.map(state, signedFrom)),
  Stream.unwrap,
);

// 1. Checking
/** The Account active: the one signed in, or while checked the last; null for none. */
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

// 4. Place
/** Where the root page is: its Account's page, or an address that names none. */
export interface At {
  readonly page?: Route | undefined;
  readonly notFound: string | null;
}

/**
 * Where the app goes in place of `route`, under the Account active: home
 * for `/`, the same page for an address it had before; and the same page
 * under the Account the Auth Worker answered, for one it `placed` under
 * its guess; null where it is.
 */
export const placeOf = (
  account: Signed,
  route: At,
  placed: string | null = null,
): Route | null => {
  const active = shownOf(account);
  if (active === null) return null;
  if (route.notFound !== null) return before(route.notFound, active.id);
  if (route.page === undefined) return home(active.id);
  const guessed =
    placed !== null &&
    account._tag === 'SignedIn' &&
    active.id !== placed &&
    route.page._tag === 'Account' &&
    route.page.accountId === placed;
  return guessed ? { ...route.page, accountId: active.id } : null;
};

/**
 * Whether the guess the app `placed` the page under is settled: the Auth
 * Worker answered it; or the page is under another Account, the guess
 * corrected or the user gone elsewhere. Signed out, it is kept, so a
 * sign-in from it still lands where the Account signed in belongs.
 */
export const settled = (account: Signed, route: At, placed: string) =>
  (account._tag === 'SignedIn' && account.id === placed) ||
  (route.page !== undefined && accountOf(route.page) !== placed);

// 6. Nowhere
/** Whether `route` names no page, nor any the app had before. */
export const nowhere = (route: At) =>
  route.notFound !== null && before(route.notFound, '') === null;

// 7. Awake
/** Whether Preferences keeps the screen on, now and after each change to it. */
export const keepScreenOn = Stream.concat(
  Stream.make(undefined),
  Preferences.changes,
).pipe(
  Stream.mapEffect(() =>
    Effect.map(Preferences.read, ({ keepScreenOn }) => keepScreenOn),
  ),
  Stream.changes,
);

/** The screen's wake lock, let go as its Scope closes; a refusal is its failure. */
const wakeLock = Effect.acquireRelease(
  Effect.tryPromise(() => navigator.wakeLock.request('screen')),
  (lock) => Effect.promise(() => lock.release()),
);

const touched = { capture: true, passive: true };

/** Keeps the screen on until its Scope closes; a browser without a wake lock does nothing. */
export const holdScreen = Effect.gen(function* () {
  if (!('wakeLock' in navigator)) return;
  const held = yield* ScopedRef.make<WakeLockSentinel | null>(() => null);
  const ask = Effect.gen(function* () {
    const lock = yield* ScopedRef.get(held);
    if (document.visibilityState !== 'visible' || lock?.released === false)
      return;
    yield* ScopedRef.set(held, wakeLock).pipe(Effect.ignore);
  });
  yield* Stream.runForEach(
    Stream.mergeAll(
      [
        Stream.make(undefined),
        Stream.fromEventListener(document, 'visibilitychange'),
        Stream.fromEventListener(window, 'pointerup', touched),
        Stream.fromEventListener(window, 'keydown', touched),
      ],
      { concurrency: 'unbounded' },
    ),
    () => ask,
  );
});

const Model = Schema.Struct({
  /** Why signing in failed, until it is tried again. */
  signInProblem: Schema.NullOr(Schema.String),
  /** Whether a sign-in is under way: the page leaving for Google. */
  signingIn: Schema.Boolean,
  /**
   * 4. Place: the Account the app placed `/` or an old address under while
   * the Auth Worker was still asked, its guess, until it is settled.
   */
  placed: Schema.NullOr(Schema.String),
  /** 7. Awake: whether the screen is kept on; off until Preferences is read. */
  keepScreenOn: Schema.Boolean,
});

export const App = Page.define({
  render: 'client',
  requires: [Navigation, Accounts, Storage, Preferences],
  metadata: { title: 'code' },
  pages: { Account: Account.page },
  model: Model,
  state: Signed,
  message: Schema.TaggedUnion({
    Signed: { account: Signed },
    /** The URL names `/`, an address the app had before, or a page under a guess the Auth Worker answered otherwise. */
    Misplaced: {},
    /** The guess the page was placed under is settled. */
    Settled: {},
    SignInAsked: {},
    /** A sign-in ended without leaving the page, as under the Fake. */
    SignInEnded: {},
    SignInFailed: { problem: Schema.String },
    KeepScreenOnRead: { on: Schema.Boolean },
  }),
});

export const AppLive = App.build({
  init: () => ({
    model: {
      signInProblem: null,
      signingIn: false,
      placed: null,
      keepScreenOn: false,
    },
    state: { _tag: 'Reading' },
  }),
  pages: { Account: Account.actor },
  // 5. Switcher
  provides: () => CurrentAccount.layer,
  children: {
    // The Auth Worker's `maxAccounts`: its default, 5.
    account: Actor.child(AccountSwitcherLive, {
      input: () => ({ maxAccounts: 5 }),
    }),
  },
  workers: {
    // 1. Checking, 2. Answer
    accounts: {
      run: (self) =>
        Stream.runForEach(signed, (account) =>
          self.send({ _tag: 'Signed', account }),
        ),
    },
    // 4. Place
    misplaced: {
      while: ({ model, state, props }) =>
        placeOf(state, props.route, model.placed) !== null,
      run: (self) => self.send({ _tag: 'Misplaced' }),
    },
    settled: {
      while: ({ model, state, props }) =>
        model.placed !== null && settled(state, props.route, model.placed),
      run: (self) => self.send({ _tag: 'Settled' }),
    },
    // 7. Awake
    keepScreenOn: {
      run: (self) =>
        Stream.runForEach(keepScreenOn, (on) =>
          self.send({ _tag: 'KeepScreenOnRead', on }),
        ),
    },
    awake: {
      while: ({ model }) => model.keepScreenOn,
      run: () => holdScreen,
    },
  },
  on: {
    // 3. Prune: answered at last, or one fewer signed in, only theirs are kept.
    Signed: ({ account }, { state }) => {
      const keep = kept(state, account);
      return {
        state: account,
        ...(keep !== null
          ? { command: pruneAccounts({ accountIds: keep }) }
          : {}),
      };
    },
    // 4. Place: in place of the address, so Back never returns to it; a
    // guess is kept until it is settled.
    Misplaced: (_, { model, state, props }) => {
      const to = placeOf(state, props.route, model.placed);
      if (to === null) return {};
      return {
        model: {
          ...model,
          placed: state._tag === 'Checking' ? accountOf(to) : model.placed,
        },
        command: Router.replace(to),
      };
    },
    Settled: (_, { model }) => ({ model: { ...model, placed: null } }),
    // A page the app placed under its guess is no page the user asked
    // for: signing in from it comes back to `/`, placed anew.
    SignInAsked: (_, { model }) =>
      model.signingIn
        ? {}
        : {
            model: { ...model, signInProblem: null, signingIn: true },
            command: signIn({
              returnTo:
                model.placed === null
                  ? window.location.href
                  : new URL('/', window.location.href).href,
            }),
          },
    SignInEnded: (_, { model }) => ({
      model: { ...model, signingIn: false },
    }),
    SignInFailed: ({ problem }, { model }) => ({
      model: { ...model, signInProblem: problem, signingIn: false },
    }),
    KeepScreenOnRead: ({ on }, { model }) => ({
      model: { ...model, keepScreenOn: on },
    }),
  },
});
